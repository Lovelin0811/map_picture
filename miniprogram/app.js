const { manualLogin, updateProfile, clearSession, restoreSession } = require('./utils/auth');

App({
  globalData: {
    auth: {
      status: 'idle',
      session: null,
      error: ''
    }
  },

  onLaunch() {
    const session = restoreSession();
    this.globalData.auth.status = session ? 'success' : 'idle';
    this.globalData.auth.session = session;
    this.globalData.auth.error = '';
  },

  async loginWithWechat(profile = {}) {
    this.globalData.auth.status = 'loading';
    this.globalData.auth.error = '';
    try {
      const session = await manualLogin(profile);
      this.globalData.auth.status = 'success';
      this.globalData.auth.session = session;
      return session;
    } catch (error) {
      this.globalData.auth.status = 'failed';
      this.globalData.auth.session = null;
      this.globalData.auth.error = (error && (error.message || error.errMsg)) || '微信登录失败';
      throw error;
    }
  },

  async updateUserProfile(profile = {}) {
    try {
      const session = await updateProfile(profile);
      this.globalData.auth.status = 'success';
      this.globalData.auth.session = session;
      this.globalData.auth.error = '';
      return session;
    } catch (error) {
      this.globalData.auth.error = (error && (error.message || error.errMsg)) || '更新资料失败';
      throw error;
    }
  },

  logout() {
    clearSession();
    this.globalData.auth.status = 'idle';
    this.globalData.auth.session = null;
    this.globalData.auth.error = '';
  }
});
