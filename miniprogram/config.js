const API_BASE_BY_ENV = {
  // 本机开发者工具
  dev: 'http://127.0.0.1:3000',
  // 真机调试（请改成当前电脑局域网 IP）
  device: 'http://192.168.10.4:3000',
  // 阿里云 ECS（备案后改为 https://lovelin.com.cn）
  prod: 'http://47.116.214.42:3000'
};

// 只改这一行就能切环境：dev | device | prod
const API_ENV = 'prod';

module.exports = {
  API_ENV,
  API_BASE_BY_ENV,
  API_BASE: API_BASE_BY_ENV[API_ENV] || API_BASE_BY_ENV.device
};
