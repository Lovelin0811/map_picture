const { manualLogin, clearSession } = require('./utils/auth');

App({
  globalData: {
    auth: {
      status: 'idle',
      session: null,
      error: ''
    }
  },

  onLaunch() {
    clearSession();
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

  logout() {
    clearSession();
    this.globalData.auth.status = 'idle';
    this.globalData.auth.session = null;
    this.globalData.auth.error = '';
  }
});
