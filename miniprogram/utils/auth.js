const AUTH_STORAGE_KEY = 'wx_auth_session_v2';
const { API_BASE, makeUrl, request, setAuthToken, getAuthToken } = require('./api');

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: resolve,
      fail: reject
    });
  });
}

function normalizeAvatarUrl(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }
  if (url.startsWith('wxfile://')) {
    return '';
  }
  return url.endsWith('/0') ? `${url.slice(0, -2)}/132` : url;
}

function toDisplayAvatarUrl(url) {
  const normalized = normalizeAvatarUrl(url);
  if (!normalized) {
    return '';
  }
  if (/^https?:\/\//.test(normalized)) {
    return normalized;
  }
  if (normalized.startsWith('/')) {
    return `${API_BASE}${normalized}`;
  }
  return normalized;
}

function isWxTempAvatar(url) {
  return typeof url === 'string' && url.startsWith('wxfile://');
}

function uploadAvatar(filePath) {
  const token = getAuthToken();
  if (!filePath || !token) {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: makeUrl('/api/auth/avatar'),
      filePath,
      name: 'file',
      timeout: 20000,
      header: {
        Authorization: `Bearer ${token}`
      },
      success: (res) => {
        let payload = {};
        try {
          payload = typeof res.data === 'string' ? JSON.parse(res.data || '{}') : res.data || {};
        } catch (_error) {
          reject(new Error('头像上传响应解析失败'));
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(payload);
          return;
        }
        reject(new Error((payload && payload.message) || '头像上传失败'));
      },
      fail: (err) => {
        reject(new Error((err && err.errMsg) || '头像上传失败'));
      }
    });
  });
}

async function manualLogin(profile = {}) {
  const loginRes = await wxLogin();
  if (!loginRes || !loginRes.code) {
    throw new Error('微信登录失败，未获取到 code');
  }

  const payload = await request('/api/auth/wechat-login', {
    method: 'POST',
    data: {
      code: loginRes.code,
      nickName: profile.nickName || '',
      avatarUrl: isWxTempAvatar(profile.avatarUrl) ? '' : normalizeAvatarUrl(profile.avatarUrl || '')
    }
  });

  const session = {
    token: payload.token,
    expiresAt: payload.expiresAt,
    openId: payload.user && payload.user.openId,
    nickName: (payload.user && payload.user.nickName) || '',
    avatarUrl: toDisplayAvatarUrl((payload.user && payload.user.avatarUrl) || '')
  };

  setAuthToken(session.token);
  if (isWxTempAvatar(profile.avatarUrl)) {
    try {
      const uploadPayload = await uploadAvatar(profile.avatarUrl);
      if (uploadPayload && uploadPayload.avatarUrl) {
        session.avatarUrl = toDisplayAvatarUrl(uploadPayload.avatarUrl);
      }
    } catch (_error) {
      // 头像上传失败不阻塞登录，保留昵称与会话能力。
    }
  }
  wx.setStorageSync(AUTH_STORAGE_KEY, session);
  return session;
}

function restoreSession() {
  const cached = wx.getStorageSync(AUTH_STORAGE_KEY);
  if (cached && cached.token) {
    const normalizedSession = {
      ...cached,
      avatarUrl: toDisplayAvatarUrl(cached.avatarUrl || '')
    };
    setAuthToken(cached.token);
    wx.setStorageSync(AUTH_STORAGE_KEY, normalizedSession);
    return normalizedSession;
  }
  setAuthToken('');
  return null;
}

function clearSession() {
  const cached = wx.getStorageSync(AUTH_STORAGE_KEY);
  if (cached && cached.token) {
    setAuthToken(cached.token);
    request('/api/auth/logout', { method: 'POST' }).catch(() => {});
  }
  setAuthToken('');
  wx.removeStorageSync(AUTH_STORAGE_KEY);
}

module.exports = {
  manualLogin,
  clearSession,
  restoreSession
};
