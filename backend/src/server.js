const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { run, get, all, initDb } = require('./db');
const logger = require('./logger');

const app = express();
const port = Number(process.env.PORT || 3000);
const host = String(process.env.HOST || '0.0.0.0').trim() || '0.0.0.0';
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const inviteTtlMs = 7 * 24 * 60 * 60 * 1000;
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
app.use((req, res, next) => {
  const requestId = crypto.randomBytes(6).toString('hex');
  const startAt = Date.now();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.on('finish', () => {
    const durationMs = Date.now() - startAt;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('request completed', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      userId: req.auth && req.auth.userId ? req.auth.userId : null,
      ip: req.ip
    });
  });
  next();
});

function now() {
  return Date.now();
}

function normalizeAvatarUrl(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }
  return url.endsWith('/0') ? `${url.slice(0, -2)}/132` : url;
}

function createInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
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
      logger.warn('unlink upload file failed', {
        error: error.message,
        filePath: resolvedPath
      });
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
           u.nickname as nickname, u.avatar_url as avatarUrl, u.openid as openId,
           am.album_id as albumId, am.role as albumRole
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN album_members am ON am.user_id = s.user_id
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
      nickname = CASE
        WHEN excluded.nickname <> '' THEN excluded.nickname
        ELSE users.nickname
      END,
      avatar_url = CASE
        WHEN excluded.avatar_url <> '' THEN excluded.avatar_url
        ELSE users.avatar_url
      END,
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

async function ensureUserAlbumMembership(userId, nickname = '') {
  const existed = await get(`SELECT album_id as albumId FROM album_members WHERE user_id = ?`, [userId]);
  if (existed && existed.albumId) {
    return Number(existed.albumId);
  }
  const ts = now();
  const title = nickname ? `${nickname}的相册` : '共享相册';
  const album = await run(`INSERT INTO albums(title, created_at, updated_at) VALUES (?, ?, ?)`, [title, ts, ts]);
  const albumId = Number(album.lastID);
  await run(`INSERT INTO album_members(album_id, user_id, role, created_at) VALUES (?, ?, ?, ?)`, [
    albumId,
    userId,
    'owner',
    ts
  ]);
  await run(`UPDATE photos SET album_id = ? WHERE user_id = ? AND (album_id IS NULL OR album_id = 0)`, [albumId, userId]);
  await run(`UPDATE folders SET album_id = ? WHERE user_id = ? AND (album_id IS NULL OR album_id = 0)`, [albumId, userId]);
  return albumId;
}

async function getPairStatusByAlbum(albumId, selfUserId) {
  if (!albumId) {
    return { paired: false, partner: null };
  }
  const members = await all(
    `
    SELECT u.id, u.nickname as nickName, u.avatar_url as avatarUrl
    FROM album_members am
    JOIN users u ON u.id = am.user_id
    WHERE am.album_id = ?
    ORDER BY am.created_at ASC
  `,
    [albumId]
  );
  const partner = members.find((item) => Number(item.id) !== Number(selfUserId)) || null;
  return {
    paired: !!partner,
    partner: partner
      ? {
          userId: Number(partner.id),
          nickName: partner.nickName || '',
          avatarUrl: normalizeAvatarUrl(partner.avatarUrl || '')
        }
      : null
  };
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
  if (!session.albumId) {
    session.albumId = await ensureUserAlbumMembership(session.userId, session.nickname || '');
  }
  req.auth = session;
  next();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, time: now() });
});

app.get('/api/health', (_req, res) => {
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
    const albumId = await ensureUserAlbumMembership(user.id, user.nickname || '');
    const session = await createSession(user.id);
    res.json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        openId: user.openid,
        nickName: user.nickname,
        avatarUrl: normalizeAvatarUrl(user.avatarUrl)
      },
      albumId
    });
  } catch (error) {
    logger.error('wechat-login failed', {
      requestId: req.requestId,
      error: error.message
    });
    res.status(500).json({ message: '登录失败', detail: error.message });
  }
});

app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  await run(`DELETE FROM sessions WHERE token = ?`, [req.auth.token]);
  res.json({ ok: true });
});

app.get('/api/pair/status', authMiddleware, async (req, res) => {
  const pairStatus = await getPairStatusByAlbum(req.auth.albumId, req.auth.userId);
  const selfUser = await get(`SELECT nickname as nickName, avatar_url as avatarUrl FROM users WHERE id = ?`, [req.auth.userId]);
  res.json({
    albumId: req.auth.albumId,
    paired: pairStatus.paired,
    self: {
      userId: req.auth.userId,
      nickName: (selfUser && selfUser.nickName) || req.auth.nickname || '',
      avatarUrl: normalizeAvatarUrl((selfUser && selfUser.avatarUrl) || req.auth.avatarUrl || '')
    },
    partner: pairStatus.partner
  });
});

app.post('/api/pair/invite', authMiddleware, async (req, res) => {
  const memberCountRow = await get(`SELECT COUNT(*) as total FROM album_members WHERE album_id = ?`, [req.auth.albumId]);
  const memberCount = Number((memberCountRow && memberCountRow.total) || 0);
  if (memberCount >= 2) {
    res.status(409).json({ message: '当前相册已配对，无法再邀请' });
    return;
  }

  await run(`UPDATE album_invites SET status = 'revoked' WHERE album_id = ? AND status = 'pending'`, [req.auth.albumId]);
  const code = createInviteCode();
  const ts = now();
  const expiresAt = ts + inviteTtlMs;
  await run(
    `
    INSERT INTO album_invites(token, album_id, inviter_user_id, status, expires_at, created_at)
    VALUES(?, ?, ?, 'pending', ?, ?)
  `,
    [code, req.auth.albumId, req.auth.userId, expiresAt, ts]
  );

  res.json({
    code,
    expiresAt
  });
});

app.post('/api/pair/accept', authMiddleware, async (req, res) => {
  const code = String((req.body && req.body.code) || '')
    .trim()
    .toUpperCase();
  if (!code) {
    res.status(400).json({ message: '缺少邀请码' });
    return;
  }

  const invite = await get(
    `
    SELECT id, token, album_id as albumId, inviter_user_id as inviterUserId, status, expires_at as expiresAt
    FROM album_invites
    WHERE token = ?
  `,
    [code]
  );
  if (!invite || invite.status !== 'pending') {
    res.status(404).json({ message: '邀请码不存在或已失效' });
    return;
  }
  if (invite.expiresAt <= now()) {
    await run(`UPDATE album_invites SET status = 'expired' WHERE id = ?`, [invite.id]);
    res.status(410).json({ message: '邀请码已过期' });
    return;
  }
  if (Number(invite.inviterUserId) === Number(req.auth.userId)) {
    res.status(400).json({ message: '不能接受自己发出的邀请' });
    return;
  }

  const targetCountRow = await get(`SELECT COUNT(*) as total FROM album_members WHERE album_id = ?`, [invite.albumId]);
  const targetCount = Number((targetCountRow && targetCountRow.total) || 0);
  if (targetCount >= 2) {
    res.status(409).json({ message: '该相册已配对完成' });
    return;
  }

  const currentAlbumId = await ensureUserAlbumMembership(req.auth.userId, req.auth.nickname || '');
  if (Number(currentAlbumId) !== Number(invite.albumId)) {
    await run(`DELETE FROM album_members WHERE user_id = ?`, [req.auth.userId]);
    await run(`INSERT INTO album_members(album_id, user_id, role, created_at) VALUES(?, ?, ?, ?)`, [
      invite.albumId,
      req.auth.userId,
      'member',
      now()
    ]);
    await run(`UPDATE photos SET album_id = ? WHERE user_id = ? AND album_id = ?`, [invite.albumId, req.auth.userId, currentAlbumId]);
    await run(`UPDATE folders SET album_id = ? WHERE user_id = ? AND album_id = ?`, [invite.albumId, req.auth.userId, currentAlbumId]);
  }

  await run(
    `UPDATE album_invites SET status = 'accepted', accepted_by_user_id = ?, accepted_at = ? WHERE id = ?`,
    [req.auth.userId, now(), invite.id]
  );

  const pairStatus = await getPairStatusByAlbum(invite.albumId, req.auth.userId);
  res.json({
    ok: true,
    albumId: invite.albumId,
    paired: pairStatus.paired,
    partner: pairStatus.partner
  });
});

app.post('/api/pair/unbind', authMiddleware, async (req, res) => {
  const currentAlbumId = await ensureUserAlbumMembership(req.auth.userId, req.auth.nickname || '');
  const pairStatus = await getPairStatusByAlbum(currentAlbumId, req.auth.userId);
  if (!pairStatus.paired) {
    res.status(400).json({ message: '当前未配对，无需解绑' });
    return;
  }

  const ts = now();
  const newAlbum = await run(`INSERT INTO albums(title, created_at, updated_at) VALUES(?, ?, ?)`, [
    '我的相册',
    ts,
    ts
  ]);
  const newAlbumId = Number(newAlbum.lastID);

  await run(`DELETE FROM album_members WHERE user_id = ?`, [req.auth.userId]);
  await run(`INSERT INTO album_members(album_id, user_id, role, created_at) VALUES(?, ?, ?, ?)`, [
    newAlbumId,
    req.auth.userId,
    'owner',
    ts
  ]);

  await run(`UPDATE photos SET album_id = ? WHERE user_id = ? AND album_id = ?`, [newAlbumId, req.auth.userId, currentAlbumId]);
  await run(`UPDATE folders SET album_id = ? WHERE user_id = ? AND album_id = ?`, [newAlbumId, req.auth.userId, currentAlbumId]);
  await run(`UPDATE album_invites SET status = 'revoked' WHERE album_id = ? AND status = 'pending'`, [currentAlbumId]);

  res.json({
    ok: true,
    albumId: newAlbumId
  });
});

app.get('/api/photos/stats', authMiddleware, async (req, res) => {
  const rows = await all(
    `
    SELECT province, COUNT(*) as count
    FROM photos
    WHERE album_id = ?
    GROUP BY province
  `,
    [req.auth.albumId]
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
    WHERE p.album_id = ? AND p.province = ?
  `,
    [req.auth.albumId, province]
  );
  const total = Number((totalRow && totalRow.total) || 0);
  const rows = await all(
    `
    SELECT p.id, p.province, p.file_url as fileUrl, p.created_at as createdAt,
           p.folder_id as folderId, f.name as folderName
    FROM photos p
    LEFT JOIN folders f ON f.id = p.folder_id AND f.album_id = p.album_id
    WHERE p.album_id = ? AND p.province = ?
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `,
    [req.auth.albumId, province, pageSize, offset]
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
    WHERE f.album_id = ? AND f.province = ?
    GROUP BY f.id
    ORDER BY f.created_at ASC
  `,
    [req.auth.albumId, province]
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
    `SELECT id FROM folders WHERE album_id = ? AND province = ? AND name = ?`,
    [req.auth.albumId, province, name]
  );
  if (existed) {
    res.status(409).json({ message: '文件夹已存在' });
    return;
  }

  const createdAt = now();
  const result = await run(
    `
    INSERT INTO folders(user_id, album_id, province, name, created_at)
    VALUES(?, ?, ?, ?, ?)
  `,
    [req.auth.userId, req.auth.albumId, province, name, createdAt]
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
      `SELECT id, province, name FROM folders WHERE id = ? AND album_id = ?`,
      [folderId, req.auth.albumId]
    );
    if (!target) {
      res.status(404).json({ message: '文件夹不存在' });
      return;
    }

    const keepPhotos = !(req.body && req.body.keepPhotos === false);
    if (keepPhotos) {
      await run(`UPDATE photos SET folder_id = NULL WHERE album_id = ? AND folder_id = ?`, [req.auth.albumId, folderId]);
    } else {
      const photos = await all(`SELECT id, file_path as filePath FROM photos WHERE album_id = ? AND folder_id = ?`, [
        req.auth.albumId,
        folderId
      ]);
      await run(`DELETE FROM photos WHERE album_id = ? AND folder_id = ?`, [req.auth.albumId, folderId]);
      await Promise.allSettled(photos.map((item) => unlinkUploadFileSafe(item.filePath)));
    }
    await run(`DELETE FROM folders WHERE id = ? AND album_id = ?`, [folderId, req.auth.albumId]);

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
    `SELECT file_path as filePath FROM photos WHERE id = ? AND album_id = ?`,
    [photoId, req.auth.albumId]
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
        `SELECT id FROM folders WHERE id = ? AND album_id = ? AND province = ?`,
        [folderId, req.auth.albumId, province]
      );
      if (!folder) {
        res.status(400).json({ message: '文件夹不存在' });
        return;
      }
    }

    const createdAt = now();
    const result = await run(
      `
      INSERT INTO photos(user_id, province, file_url, file_path, created_at, folder_id, album_id)
      VALUES(?, ?, ?, ?, ?, ?, ?)
    `,
      [req.auth.userId, province, fileUrl, filePath, createdAt, folderId, req.auth.albumId]
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
    `SELECT id, province FROM photos WHERE id = ? AND album_id = ?`,
    [photoId, req.auth.albumId]
  );
  if (!photo) {
    res.status(404).json({ message: '照片不存在' });
    return;
  }

  if (folderId) {
    const folder = await get(
      `SELECT id FROM folders WHERE id = ? AND album_id = ? AND province = ?`,
      [folderId, req.auth.albumId, photo.province]
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
      `SELECT id, file_path as filePath FROM photos WHERE id = ? AND album_id = ?`,
      [photoId, req.auth.albumId]
    );
    if (!target) {
      res.status(404).json({ message: '照片不存在' });
      return;
    }

    await run(`DELETE FROM photos WHERE id = ? AND album_id = ?`, [photoId, req.auth.albumId]);
    await unlinkUploadFileSafe(target.filePath);

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: '删除失败', detail: error.message });
  }
});

app.use((error, req, res, _next) => {
  logger.error('unhandled server error', {
    requestId: req && req.requestId ? req.requestId : null,
    method: req && req.method ? req.method : null,
    path: req && req.originalUrl ? req.originalUrl : null,
    error: error && error.message ? error.message : String(error)
  });
  if (res.headersSent) {
    return;
  }
  res.status(500).json({ message: '服务器内部错误' });
});

initDb()
  .then(() => {
    app.listen(port, host, () => {
      logger.info('backend started', {
        host,
        port,
        env: process.env.NODE_ENV || 'development',
        logLevel: process.env.LOG_LEVEL || 'info'
      });
    });
  })
  .catch((error) => {
    logger.error('failed to init db', { error: error && error.message ? error.message : String(error) });
    process.exit(1);
  });
