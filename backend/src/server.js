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
const defaultPageSize = Number(process.env.PHOTO_PAGE_SIZE || 30);
const maxPageSize = Number(process.env.PHOTO_MAX_PAGE_SIZE || 80);
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 10);
const maxUploadBytes = Math.max(1, Math.floor(maxUploadMb * 1024 * 1024));
const corsAllowList = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const allowedImageExt = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic']);
const allowedImageMime = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/heic'
]);

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
const upload = multer({
  storage,
  limits: { fileSize: maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (!allowedImageExt.has(ext) || !allowedImageMime.has(mime)) {
      cb(new Error('仅支持 jpg/png/gif/webp/bmp/heic 图片'));
      return;
    }
    cb(null, true);
  }
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (corsAllowList.length === 0 || corsAllowList.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS blocked'));
    }
  })
);
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

function parsePaging(req) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const sizeRaw = Number(req.query.pageSize) || defaultPageSize;
  const pageSize = Math.max(1, Math.min(maxPageSize, sizeRaw));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

function getMimeTypeByExt(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.heic': 'image/heic'
  };
  return mimeMap[ext] || 'application/octet-stream';
}

function resolveSafeUploadPath(filePath) {
  if (!filePath) {
    return '';
  }
  const resolvedPath = path.resolve(filePath);
  const resolvedUploadsDir = path.resolve(uploadsDir) + path.sep;
  if (!resolvedPath.startsWith(resolvedUploadsDir)) {
    return '';
  }
  return resolvedPath;
}

async function unlinkUploadFileSafe(filePath) {
  const resolvedPath = resolveSafeUploadPath(filePath);
  if (!resolvedPath) {
    return;
  }
  try {
    await fs.promises.unlink(resolvedPath);
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      // eslint-disable-next-line no-console
      console.warn('unlink upload file failed:', error.message);
    }
  }
}

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (bearerToken) {
    return bearerToken;
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
  const { page, pageSize, offset } = parsePaging(req);
  const totalRow = await get(
    `
    SELECT COUNT(*) as total
    FROM photos p
    WHERE p.user_id = ? AND p.province = ?
  `,
    [req.auth.userId, province]
  );
  const total = Number((totalRow && totalRow.total) || 0);
  const rows = await all(
    `
    SELECT p.id, p.province, p.file_url as fileUrl, p.created_at as createdAt,
           p.folder_id as folderId, f.name as folderName
    FROM photos p
    LEFT JOIN folders f ON f.id = p.folder_id AND f.user_id = p.user_id
    WHERE p.user_id = ? AND p.province = ?
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `,
    [req.auth.userId, province, pageSize, offset]
  );
  res.json({
    items: rows,
    page,
    pageSize,
    total,
    hasMore: offset + rows.length < total
  });
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

app.delete('/api/folders/:id', authMiddleware, async (req, res) => {
  try {
    const folderId = Number(req.params.id);
    if (!Number.isInteger(folderId) || folderId <= 0) {
      res.status(400).json({ message: '无效文件夹ID' });
      return;
    }

    const target = await get(
      `SELECT id, province, name FROM folders WHERE id = ? AND user_id = ?`,
      [folderId, req.auth.userId]
    );
    if (!target) {
      res.status(404).json({ message: '文件夹不存在' });
      return;
    }

    const keepPhotos = !(req.body && req.body.keepPhotos === false);
    if (keepPhotos) {
      await run(`UPDATE photos SET folder_id = NULL WHERE user_id = ? AND folder_id = ?`, [req.auth.userId, folderId]);
    } else {
      const photos = await all(`SELECT id, file_path as filePath FROM photos WHERE user_id = ? AND folder_id = ?`, [
        req.auth.userId,
        folderId
      ]);
      await run(`DELETE FROM photos WHERE user_id = ? AND folder_id = ?`, [req.auth.userId, folderId]);
      await Promise.allSettled(photos.map((item) => unlinkUploadFileSafe(item.filePath)));
    }
    await run(`DELETE FROM folders WHERE id = ? AND user_id = ?`, [folderId, req.auth.userId]);

    res.json({
      ok: true,
      id: folderId,
      province: target.province,
      name: target.name,
      keepPhotos
    });
  } catch (error) {
    res.status(500).json({ message: '删除文件夹失败', detail: error.message });
  }
});

function uploadPhotoMiddleware(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ message: `图片不能超过 ${maxUploadMb}MB` });
      return;
    }
    res.status(400).json({ message: error.message || '上传文件校验失败' });
  });
}

app.get('/api/photos/file/:id', authMiddleware, async (req, res) => {
  const photoId = Number(req.params.id);
  if (!Number.isFinite(photoId)) {
    res.status(400).json({ message: '无效照片ID' });
    return;
  }

  const target = await get(
    `SELECT file_path as filePath FROM photos WHERE id = ? AND user_id = ?`,
    [photoId, req.auth.userId]
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
  res.setHeader('Content-Type', getMimeTypeByExt(resolvedPath));
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.sendFile(resolvedPath);
});

app.post('/api/photos/upload', authMiddleware, uploadPhotoMiddleware, async (req, res) => {
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
      if (!allowedImageExt.has(ext)) {
        res.status(400).json({ message: '不支持的图片格式' });
        return;
      }
      const decodedSize = Buffer.byteLength(fileBase64, 'base64');
      if (decodedSize > maxUploadBytes) {
        res.status(413).json({ message: `图片不能超过 ${maxUploadMb}MB` });
        return;
      }
      const safeExt = ext;
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
  try {
    const photoId = Number(req.params.id);
    if (!Number.isInteger(photoId) || photoId <= 0) {
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
    await unlinkUploadFileSafe(target.filePath);

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: '删除失败', detail: error.message });
  }
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
