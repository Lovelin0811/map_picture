const AUTH_STORAGE_KEY = 'wx_auth_session_v2';
const { request, setAuthToken } = require('./api');

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
  return url.endsWith('/0') ? `${url.slice(0, -2)}/132` : url;
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
      avatarUrl: normalizeAvatarUrl(profile.avatarUrl || '')
    }
  });

  const session = {
    token: payload.token,
    expiresAt: payload.expiresAt,
    openId: payload.user && payload.user.openId,
    nickName: (payload.user && payload.user.nickName) || '',
    avatarUrl: normalizeAvatarUrl((payload.user && payload.user.avatarUrl) || '')
  };

  setAuthToken(session.token);
  wx.setStorageSync(AUTH_STORAGE_KEY, session);
  return session;
}

function buildSessionByPayload(baseSession, payload = {}) {
  const user = payload.user || {};
  return {
    token: (baseSession && baseSession.token) || '',
    expiresAt: (baseSession && baseSession.expiresAt) || 0,
    openId: user.openId || (baseSession && baseSession.openId) || '',
    nickName: user.nickName || (baseSession && baseSession.nickName) || '',
    avatarUrl: normalizeAvatarUrl(user.avatarUrl || (baseSession && baseSession.avatarUrl) || '')
  };
}

function getCachedSession() {
  const cached = wx.getStorageSync(AUTH_STORAGE_KEY);
  if (cached && cached.token) {
    return cached;
  }
  return null;
}

async function updateProfile(profile = {}) {
  const baseSession = getCachedSession();
  if (!baseSession || !baseSession.token) {
    throw new Error('未登录');
  }
  setAuthToken(baseSession.token);
  const payload = await request('/api/auth/profile', {
    method: 'PATCH',
    data: {
      nickName: profile.nickName || '',
      avatarUrl: normalizeAvatarUrl(profile.avatarUrl || '')
    }
  });
  const nextSession = buildSessionByPayload(baseSession, payload);
  wx.setStorageSync(AUTH_STORAGE_KEY, nextSession);
  return nextSession;
}

function restoreSession() {
  const cached = wx.getStorageSync(AUTH_STORAGE_KEY);
  if (cached && cached.token) {
    setAuthToken(cached.token);
    return cached;
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
  updateProfile,
  clearSession,
  restoreSession
};
