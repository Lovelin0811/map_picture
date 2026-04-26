// 环境配置，优先读 config.local.js（不入库，含IP等敏感信息）
// 没有 config.local.js 时默认 http://127.0.0.1:3000
// config.local.js 示例：
//   module.exports = {
//     API_BASE: 'http://你的服务器地址:3000'
//   };

let local = {};
try { local = require('./config.local.js'); } catch (e) {}

const API_BASE = local.API_BASE || 'http://127.0.0.1:3000';

module.exports = { API_BASE };
