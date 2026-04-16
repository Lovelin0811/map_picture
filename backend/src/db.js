const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbFile = path.join(dataDir, 'app.db');
const db = new sqlite3.Database(dbFile);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openid TEXT UNIQUE NOT NULL,
      nickname TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '共享相册',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS album_members (
      album_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at INTEGER NOT NULL,
      UNIQUE(album_id, user_id),
      UNIQUE(user_id),
      FOREIGN KEY(album_id) REFERENCES albums(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS album_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      album_id INTEGER NOT NULL,
      inviter_user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at INTEGER NOT NULL,
      accepted_by_user_id INTEGER,
      created_at INTEGER NOT NULL,
      accepted_at INTEGER,
      FOREIGN KEY(album_id) REFERENCES albums(id),
      FOREIGN KEY(inviter_user_id) REFERENCES users(id),
      FOREIGN KEY(accepted_by_user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      province TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      province TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, province, name),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  const photoColumns = await all(`PRAGMA table_info(photos)`);
  const hasFolderId = photoColumns.some((column) => column.name === 'folder_id');
  const hasAlbumId = photoColumns.some((column) => column.name === 'album_id');
  if (!hasFolderId) {
    await run(`ALTER TABLE photos ADD COLUMN folder_id INTEGER`);
  }
  if (!hasAlbumId) {
    await run(`ALTER TABLE photos ADD COLUMN album_id INTEGER`);
  }

  const folderColumns = await all(`PRAGMA table_info(folders)`);
  const folderHasAlbumId = folderColumns.some((column) => column.name === 'album_id');
  if (!folderHasAlbumId) {
    await run(`ALTER TABLE folders ADD COLUMN album_id INTEGER`);
  }

  const users = await all(`SELECT id, nickname FROM users`);
  for (const user of users) {
    const existedMember = await get(`SELECT album_id as albumId FROM album_members WHERE user_id = ?`, [user.id]);
    let albumId = existedMember && existedMember.albumId;
    if (!albumId) {
      const ts = Date.now();
      const albumTitle = user.nickname ? `${user.nickname}的相册` : '共享相册';
      const albumResult = await run(`INSERT INTO albums(title, created_at, updated_at) VALUES(?, ?, ?)`, [
        albumTitle,
        ts,
        ts
      ]);
      albumId = albumResult.lastID;
      await run(`INSERT INTO album_members(album_id, user_id, role, created_at) VALUES(?, ?, ?, ?)`, [
        albumId,
        user.id,
        'owner',
        ts
      ]);
    }

    await run(`UPDATE photos SET album_id = ? WHERE user_id = ? AND (album_id IS NULL OR album_id = 0)`, [albumId, user.id]);
    await run(`UPDATE folders SET album_id = ? WHERE user_id = ? AND (album_id IS NULL OR album_id = 0)`, [albumId, user.id]);
  }

  await run(`CREATE INDEX IF NOT EXISTS idx_photos_user_province ON photos(user_id, province)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_photos_album_province ON photos(album_id, province)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_photos_folder_id ON photos(folder_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_folders_user_province ON folders(user_id, province)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_folders_album_province ON folders(album_id, province)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_album_members_album ON album_members(album_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_album_invites_album ON album_invites(album_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_album_invites_status_expires ON album_invites(status, expires_at)`);
}

module.exports = {
  run,
  get,
  all,
  initDb
};
