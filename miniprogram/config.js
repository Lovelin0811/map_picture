const API_BASE_BY_ENV = {
  // 本机开发者工具
  dev: 'http://127.0.0.1:3000',
  // 真机调试（请改成当前电脑局域网 IP）
  device: '',
  // 阿里云 ECS（备案后改为 https://lovelin.com.cn）
  prod: 'https://lovelin.com.cn'
};

// 本地配置覆盖（config.local.js 不入库，存放 IP 等敏感信息）
let localConfig = {};
try {
  localConfig = require('./config.local.js');
} catch (e) { /* 没有本地配置则忽略 */ }

if (localConfig.API_BASE_BY_ENV) {
  Object.assign(API_BASE_BY_ENV, localConfig.API_BASE_BY_ENV);
}

const API_ENV = localConfig.API_ENV || 'prod';

module.exports = {
  API_ENV,
  API_BASE_BY_ENV,
  API_BASE: API_BASE_BY_ENV[API_ENV] || API_BASE_BY_ENV.device
};
