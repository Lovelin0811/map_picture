const fs = require('fs');
const path = require('path');

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const levelName = String(process.env.LOG_LEVEL || 'info').toLowerCase();
const currentLevel = LEVELS[levelName] || LEVELS.info;
const logToStdout = String(process.env.LOG_TO_STDOUT || 'true').toLowerCase() !== 'false';
const logToFile = String(process.env.LOG_TO_FILE || 'true').toLowerCase() !== 'false';
const retentionDays = Math.max(1, Number(process.env.LOG_RETENTION_DAYS || 14));
const logDir = path.resolve(process.env.LOG_DIR || path.join(__dirname, '..', 'logs'));

let activeDay = '';
let appStream = null;
let errorStream = null;

function shouldLog(level) {
  return (LEVELS[level] || LEVELS.info) >= currentLevel;
}

function nowIso() {
  return new Date().toISOString();
}

function getDayString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function stringifyMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    return '';
  }
  const keys = Object.keys(meta);
  if (keys.length === 0) {
    return '';
  }
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch (_error) {
    return '';
  }
}

function ensureLogDir() {
  if (!logToFile) {
    return;
  }
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

function closeStreams() {
  if (appStream) {
    appStream.end();
    appStream = null;
  }
  if (errorStream) {
    errorStream.end();
    errorStream = null;
  }
}

function rotateStreamsIfNeeded() {
  if (!logToFile) {
    return;
  }
  const day = getDayString();
  if (day === activeDay && appStream && errorStream) {
    return;
  }
  ensureLogDir();
  closeStreams();
  const appFile = path.join(logDir, `app-${day}.log`);
  const errFile = path.join(logDir, `error-${day}.log`);
  appStream = fs.createWriteStream(appFile, { flags: 'a' });
  errorStream = fs.createWriteStream(errFile, { flags: 'a' });
  activeDay = day;
}

function cleanupOldLogs() {
  if (!logToFile) {
    return;
  }
  ensureLogDir();
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let files = [];
  try {
    files = fs.readdirSync(logDir);
  } catch (_error) {
    return;
  }
  files.forEach((name) => {
    if (!name.endsWith('.log')) {
      return;
    }
    const fullPath = path.join(logDir, name);
    try {
      const stats = fs.statSync(fullPath);
      if (stats.mtimeMs < cutoff) {
        fs.unlinkSync(fullPath);
      }
    } catch (_error) {
      // ignore cleanup failure
    }
  });
}

function write(level, message, meta = {}) {
  if (!shouldLog(level)) {
    return;
  }
  const line = `[${nowIso()}] [${level.toUpperCase()}] ${message}${stringifyMeta(meta)}`;
  if (logToStdout) {
    if (level === 'warn' || level === 'error') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }
  if (!logToFile) {
    return;
  }
  rotateStreamsIfNeeded();
  if (appStream) {
    appStream.write(`${line}\n`);
  }
  if (level === 'error' && errorStream) {
    errorStream.write(`${line}\n`);
  }
}

cleanupOldLogs();
setInterval(cleanupOldLogs, 6 * 60 * 60 * 1000).unref();

process.on('exit', () => {
  closeStreams();
});

module.exports = {
  debug(message, meta) {
    write('debug', message, meta);
  },
  info(message, meta) {
    write('info', message, meta);
  },
  warn(message, meta) {
    write('warn', message, meta);
  },
  error(message, meta) {
    write('error', message, meta);
  }
};
