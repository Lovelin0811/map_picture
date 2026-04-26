// 环境配置，优先读 config.local.js（不入库，含IP等敏感信息）
// 没有 config.local.js 时用默认值
// config.local.js 示例：
//   module.exports = {
//     API_ENV: 'prod',
//     API_BASE: 'http://47.116.214.42:3000'
//   };

let local = {};
try { local = require('./config.local.js'); } catch (e) {}

const API_ENV = local.API_ENV || 'prod';
const API_BASE = local.API_BASE || 'https://lovelin.com.cn';

module.exports = { API_ENV, API_BASE };
