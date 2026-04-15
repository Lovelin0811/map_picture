const { manualLogin, clearSession, restoreSession } = require('./utils/auth');

App({
  globalData: {
    auth: {
      status: 'idle',
      session: null,
      error: ''
    },
    loginPromise: null
  },

  setAuthState({ status, session, error }) {
    if (status !== undefined) {
      this.globalData.auth.status = status;
    }
    if (session !== undefined) {
      this.globalData.auth.session = session;
    }
    if (error !== undefined) {
      this.globalData.auth.error = error;
    }
  },

  onLaunch() {
    const session = restoreSession();
    this.setAuthState({
      status: session ? 'success' : 'idle',
      session,
      error: ''
    });
  },

  async loginWithWechat(profile = {}) {
    if (this.globalData.loginPromise) {
      return this.globalData.loginPromise;
    }

    this.setAuthState({ status: 'loading', error: '' });
    this.globalData.loginPromise = manualLogin(profile)
      .then((session) => {
        this.setAuthState({
          status: 'success',
          session,
          error: ''
        });
        return session;
      })
      .catch((error) => {
        this.setAuthState({
          status: 'failed',
          session: null,
          error: (error && (error.message || error.errMsg)) || '微信登录失败'
        });
        throw error;
      })
      .finally(() => {
        this.globalData.loginPromise = null;
      });

    return this.globalData.loginPromise;
  },

  logout() {
    clearSession();
    this.setAuthState({
      status: 'idle',
      session: null,
      error: ''
    });
  }
});
