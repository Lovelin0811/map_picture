const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { run, get, all, initDb } = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ext && ext.length <= 6 ? ext : '.jpg';
    cb(null, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${safeExt}`);
  }
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json({ limit: '20mb' }));

function now() {
  return Date.now();
}

function parseOptionalFolderId(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return null;
  }
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function getTokenFromRequest(req, { allowQuery = false } = {}) {
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (bearerToken) {
    return bearerToken;
  }
  if (allowQuery) {
    return String((req.query && req.query.token) || '').trim();
  }
  return '';
}

async function getSessionByToken(token) {
  if (!token) {
    return null;
  }
  const session = await get(
    `
    SELECT s.token, s.user_id as userId, s.expires_at as expiresAt,
           u.nickname as nickname, u.avatar_url as avatarUrl, u.openid as openId
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `,
    [token]
  );
  if (!session) {
    return null;
  }
  if (session.expiresAt <= now()) {
    await run(`DELETE FROM sessions WHERE token = ?`, [token]);
    return null;
  }
  return session;
}

async function resolveOpenIdByCode(code) {
  const appid = process.env.WECHAT_APPID;
  const secret = process.env.WECHAT_SECRET;
  if (!appid || !secret) {
    throw new Error('缺少 WECHAT_APPID / WECHAT_SECRET');
  }

  const url =
    `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}` +
    `&secret=${encodeURIComponent(secret)}` +
    `&js_code=${encodeURIComponent(code)}` +
    '&grant_type=authorization_code';

  const response = await fetch(url);
  const data = await response.json();
  if (!data || !data.openid) {
    throw new Error((data && data.errmsg) || 'jscode2session 失败');
  }
  return data.openid;
}

async function upsertUser(openid, nickname, avatarUrl) {
  const ts = now();
  await run(
    `
    INSERT INTO users(openid, nickname, avatar_url, created_at, updated_at)
    VALUES(?, ?, ?, ?, ?)
    ON CONFLICT(openid) DO UPDATE SET
      nickname = excluded.nickname,
      avatar_url = excluded.avatar_url,
      updated_at = excluded.updated_at
  `,
    [openid, nickname || '', avatarUrl || '', ts, ts]
  );
  return get(`SELECT id, openid, nickname, avatar_url as avatarUrl FROM users WHERE openid = ?`, [openid]);
}

async function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  const createdAt = now();
  const expiresAt = createdAt + sessionTtlMs;
  await run(
    `INSERT INTO sessions(token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
    [token, userId, expiresAt, createdAt]
  );
  return { token, expiresAt };
}

async function authMiddleware(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ message: '未登录' });
    return;
  }
  const session = await getSessionByToken(token);
  if (!session) {
    res.status(401).json({ message: '登录已过期，请重新登录' });
    return;
  }
  req.auth = session;
  next();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, time: now() });
});

app.post('/api/auth/wechat-login', async (req, res) => {
  try {
    const { code, nickName = '', avatarUrl = '' } = req.body || {};
    if (!code) {
      res.status(400).json({ message: '缺少 code' });
      return;
    }

    const openId = await resolveOpenIdByCode(code);
    const user = await upsertUser(openId, nickName, avatarUrl);
    const session = await createSession(user.id);
    res.json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        openId: user.openid,
        nickName: user.nickname,
        avatarUrl: user.avatarUrl
      }
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('wechat-login failed:', error.message);
    res.status(500).json({ message: '登录失败', detail: error.message });
  }
});

app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  await run(`DELETE FROM sessions WHERE token = ?`, [req.auth.token]);
  res.json({ ok: true });
});

app.get('/api/photos/stats', authMiddleware, async (req, res) => {
  const rows = await all(
    `
    SELECT province, COUNT(*) as count
    FROM photos
    WHERE user_id = ?
    GROUP BY province
  `,
    [req.auth.userId]
  );
  res.json(rows.map((row) => ({ province: row.province, count: Number(row.count) })));
});

app.get('/api/photos', authMiddleware, async (req, res) => {
  const province = String(req.query.province || '').trim();
  if (!province) {
    res.status(400).json({ message: '缺少 province' });
    return;
  }
  const rows = await all(
    `
    SELECT p.id, p.province, p.file_url as fileUrl, p.created_at as createdAt,
           p.folder_id as folderId, f.name as folderName
    FROM photos p
    LEFT JOIN folders f ON f.id = p.folder_id AND f.user_id = p.user_id
    WHERE p.user_id = ? AND p.province = ?
    ORDER BY p.created_at DESC
  `,
    [req.auth.userId, province]
  );
  res.json(rows);
});

app.get('/api/folders', authMiddleware, async (req, res) => {
  const province = String(req.query.province || '').trim();
  if (!province) {
    res.status(400).json({ message: '缺少 province' });
    return;
  }
  const rows = await all(
    `
    SELECT f.id, f.name, f.province, f.created_at as createdAt, COUNT(p.id) as count
    FROM folders f
    LEFT JOIN photos p ON p.folder_id = f.id
    WHERE f.user_id = ? AND f.province = ?
    GROUP BY f.id
    ORDER BY f.created_at ASC
  `,
    [req.auth.userId, province]
  );
  res.json(rows.map((row) => ({ ...row, count: Number(row.count || 0) })));
});

app.post('/api/folders', authMiddleware, async (req, res) => {
  const province = String((req.body && req.body.province) || '').trim();
  const name = String((req.body && req.body.name) || '').trim();
  if (!province) {
    res.status(400).json({ message: '缺少 province' });
    return;
  }
  if (!name) {
    res.status(400).json({ message: '缺少文件夹名称' });
    return;
  }
  if (name.length > 24) {
    res.status(400).json({ message: '文件夹名称不能超过24个字符' });
    return;
  }

  const existed = await get(
    `SELECT id FROM folders WHERE user_id = ? AND province = ? AND name = ?`,
    [req.auth.userId, province, name]
  );
  if (existed) {
    res.status(409).json({ message: '文件夹已存在' });
    return;
  }

  const createdAt = now();
  const result = await run(
    `
    INSERT INTO folders(user_id, province, name, created_at)
    VALUES(?, ?, ?, ?)
  `,
    [req.auth.userId, province, name, createdAt]
  );
  res.json({
    id: result.lastID,
    province,
    name,
    createdAt,
    count: 0
  });
});

app.get('/api/photos/file/:id', async (req, res) => {
  const token = getTokenFromRequest(req, { allowQuery: true });
  if (!token) {
    res.status(401).json({ message: '未登录' });
    return;
  }
  const session = await getSessionByToken(token);
  if (!session) {
    res.status(401).json({ message: '登录已过期，请重新登录' });
    return;
  }

  const photoId = Number(req.params.id);
  if (!Number.isFinite(photoId)) {
    res.status(400).json({ message: '无效照片ID' });
    return;
  }

  const target = await get(
    `SELECT file_path as filePath FROM photos WHERE id = ? AND user_id = ?`,
    [photoId, session.userId]
  );
  if (!target || !target.filePath) {
    res.status(404).json({ message: '照片不存在' });
    return;
  }

  const resolvedPath = path.resolve(target.filePath);
  const resolvedUploadsDir = path.resolve(uploadsDir) + path.sep;
  if (!resolvedPath.startsWith(resolvedUploadsDir) || !fs.existsSync(resolvedPath)) {
    res.status(404).json({ message: '照片文件不存在' });
    return;
  }
  res.sendFile(resolvedPath);
});

app.post('/api/photos/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const province = String((req.body && req.body.province) || '').trim();
    if (!province) {
      res.status(400).json({ message: '缺少 province' });
      return;
    }
    let fileUrl = '';
    let filePath = '';
    if (req.file) {
      fileUrl = `/uploads/${req.file.filename}`;
      filePath = req.file.path;
    } else {
      const fileBase64 = String((req.body && req.body.fileBase64) || '').trim();
      const fileName = String((req.body && req.body.fileName) || '').trim();
      if (!fileBase64) {
        res.status(400).json({ message: '缺少文件' });
        return;
      }
      const ext = path.extname(fileName || '.jpg').toLowerCase();
      const safeExt = ext && ext.length <= 6 ? ext : '.jpg';
      const filename = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${safeExt}`;
      filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, Buffer.from(fileBase64, 'base64'));
      fileUrl = `/uploads/${filename}`;
    }
    const folderId = parseOptionalFolderId(req.body && req.body.folderId);
    if (folderId === undefined) {
      res.status(400).json({ message: 'folderId 无效' });
      return;
    }
    if (folderId) {
      const folder = await get(
        `SELECT id FROM folders WHERE id = ? AND user_id = ? AND province = ?`,
        [folderId, req.auth.userId, province]
      );
      if (!folder) {
        res.status(400).json({ message: '文件夹不存在' });
        return;
      }
    }

    const createdAt = now();
    const result = await run(
      `
      INSERT INTO photos(user_id, province, file_url, file_path, created_at, folder_id)
      VALUES(?, ?, ?, ?, ?, ?)
    `,
      [req.auth.userId, province, fileUrl, filePath, createdAt, folderId]
    );
    res.json({
      id: result.lastID,
      province,
      fileUrl,
      createdAt,
      folderId
    });
  } catch (error) {
    res.status(500).json({ message: '上传失败', detail: error.message });
  }
});

app.patch('/api/photos/:id/folder', authMiddleware, async (req, res) => {
  const photoId = Number(req.params.id);
  if (!Number.isFinite(photoId)) {
    res.status(400).json({ message: '无效照片ID' });
    return;
  }
  const folderId = parseOptionalFolderId(req.body && req.body.folderId);
  if (folderId === undefined) {
    res.status(400).json({ message: 'folderId 无效' });
    return;
  }

  const photo = await get(
    `SELECT id, province FROM photos WHERE id = ? AND user_id = ?`,
    [photoId, req.auth.userId]
  );
  if (!photo) {
    res.status(404).json({ message: '照片不存在' });
    return;
  }

  if (folderId) {
    const folder = await get(
      `SELECT id FROM folders WHERE id = ? AND user_id = ? AND province = ?`,
      [folderId, req.auth.userId, photo.province]
    );
    if (!folder) {
      res.status(400).json({ message: '文件夹不存在或不属于当前省份' });
      return;
    }
  }

  await run(`UPDATE photos SET folder_id = ? WHERE id = ?`, [folderId, photoId]);
  res.json({ ok: true, id: photoId, folderId });
});

app.delete('/api/photos/:id', authMiddleware, async (req, res) => {
  const photoId = Number(req.params.id);
  if (!Number.isFinite(photoId)) {
    res.status(400).json({ message: '无效照片ID' });
    return;
  }
  const target = await get(
    `SELECT id, file_path as filePath FROM photos WHERE id = ? AND user_id = ?`,
    [photoId, req.auth.userId]
  );
  if (!target) {
    res.status(404).json({ message: '照片不存在' });
    return;
  }
  await run(`DELETE FROM photos WHERE id = ?`, [photoId]);
  if (target.filePath && fs.existsSync(target.filePath)) {
    fs.unlinkSync(target.filePath);
  }
  res.json({ ok: true });
});

initDb()
  .then(() => {
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`backend started: http://0.0.0.0:${port}`);
    });
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('failed to init db:', error);
    process.exit(1);
  });
