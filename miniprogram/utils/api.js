const { API_BASE } = require('../config');

let authToken = '';

function setAuthToken(token) {
  authToken = token || '';
}

function getAuthToken() {
  return authToken;
}

function makeUrl(path) {
  return `${API_BASE}${path}`;
}

function request(path, { method = 'GET', data = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const hasBody = data !== null && data !== undefined;
    const finalHeaders = {
      ...headers
    };
    if (hasBody) {
      finalHeaders['content-type'] = 'application/json';
    }
    if (authToken) {
      finalHeaders.Authorization = `Bearer ${authToken}`;
    }

    wx.request({
      url: makeUrl(path),
      method,
      timeout: 10000,
      data: hasBody ? data : undefined,
      header: finalHeaders,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        const message = (res.data && res.data.message) || '请求失败';
        reject(new Error(message));
      },
      fail: (err) => {
        reject(new Error((err && err.errMsg) || '网络请求失败'));
      }
    });
  });
}

module.exports = {
  API_BASE,
  makeUrl,
  request,
  setAuthToken,
  getAuthToken
};
