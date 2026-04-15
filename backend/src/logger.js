const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const levelName = String(process.env.LOG_LEVEL || 'info').toLowerCase();
const currentLevel = LEVELS[levelName] || LEVELS.info;

function shouldLog(level) {
  return (LEVELS[level] || LEVELS.info) >= currentLevel;
}

function nowIso() {
  return new Date().toISOString();
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

function write(level, message, meta = {}) {
  if (!shouldLog(level)) {
    return;
  }
  const line = `[${nowIso()}] [${level.toUpperCase()}] ${message}${stringifyMeta(meta)}`;
  if (level === 'warn') {
    process.stderr.write(`${line}\n`);
    return;
  }
  if (level === 'error') {
    process.stderr.write(`${line}\n`);
    return;
  }
  process.stdout.write(`${line}\n`);
}

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
