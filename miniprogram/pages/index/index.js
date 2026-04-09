const { fetchProvinceStats } = require('../../utils/photo-store');
const { PROVINCES, findProvinceByTapPoint } = require('../../utils/provinces');
const { API_BASE } = require('../../config');

function getProvinceLabelOffset(name, halfWidth) {
  const defaults = { anchorX: -halfWidth, anchorY: -10 };
  const custom = {
    香港: { anchorX: -halfWidth + 22, anchorY: -8 },
    澳门: { anchorX: -halfWidth - 22, anchorY: 10 }
  };
  return custom[name] || defaults;
}

function getProvinceVisualCenter(province) {
  const base = {
    lat: (province.bbox.minLat + province.bbox.maxLat) / 2,
    lng: (province.bbox.minLng + province.bbox.maxLng) / 2
  };
  const tweak = {
    甘肃: { dLat: -0.25, dLng: 1.8 },
    内蒙古: { dLat: -1.7, dLng: -0.2 },
    河北: { dLat: -1.2, dLng: -1.5 },
    北京: { dLat: -0.25, dLng: -0.3 },
    天津: { dLat: -0.35, dLng: 0.45 }
  };
  const t = tweak[province.name];
  if (!t) {
    return base;
  }
  return {
    lat: base.lat + t.dLat,
    lng: base.lng + t.dLng
  };
}

Page({
  data: {
    latitude: 35.8617,
    longitude: 104.1954,
    markers: [],
    hasLocationPermission: true,
    authStatus: 'idle',
    authText: '点击登录',
    avatarUrl: '',
    loginPanelVisible: false,
    pendingAvatarUrl: '',
    pendingNickName: ''
  },

  onLoad() {
    this.syncAuthState();
    this.ensureLocationAndLoadMap();
  },

  async onShow() {
    await this.loadMarkers();
    this.syncAuthState();
  },

  async ensureLocationAndLoadMap() {
    await this.loadMarkers();
    const granted = await this.requestLocationPermission();
    if (!granted) {
      this.setData({ hasLocationPermission: false });
      return;
    }

    this.setData({ hasLocationPermission: true });
  },

  async loadMarkers() {
    const countMap = {};
    if (this.isLoggedIn()) {
      try {
        const stats = await fetchProvinceStats();
        stats.forEach((item) => {
          countMap[item.province] = Number(item.count || 0);
        });
      } catch (error) {
        // Ignore marker stats error and keep province-only labels.
      }
    }

    const markers = PROVINCES.map((province, index) => {
      const labelText = countMap[province.name] ? `${province.name}${countMap[province.name]}` : province.name;
      const halfWidth = Math.round(labelText.length * 3.4);
      const offset = getProvinceLabelOffset(province.name, halfWidth);
      const center = getProvinceVisualCenter(province);
      return {
        id: index,
        province: province.name,
        latitude: center.lat,
        longitude: center.lng,
        iconPath: '/assets/marker.png',
        width: 10,
        height: 10,
        label: {
          content: labelText,
          bgColor: '#ffffff',
          borderRadius: 8,
          color: '#111827',
          fontSize: 12,
          padding: 4,
          anchorX: offset.anchorX,
          anchorY: offset.anchorY
        }
      };
    });

    this.setData({ markers });
  },

  onLabelTap(e) {
    const markerId = e.detail.markerId !== undefined ? e.detail.markerId : e.detail.id;
    this.navigateByMarkerId(markerId);
  },

  onMarkerTap(e) {
    const { markerId } = e.detail;
    this.navigateByMarkerId(markerId);
  },

  onMapTap(e) {
    if (!this.isLoggedIn()) {
      this.showLoginRequiredToast();
      return;
    }
    const { latitude, longitude } = e.detail;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return;
    }
    const province = findProvinceByTapPoint(latitude, longitude);
    if (!province) {
      return;
    }
    this.navigateToProvince(province.name);
  },

  navigateByMarkerId(markerId) {
    const marker = this.data.markers.find((item) => item.id === markerId);
    if (!marker) {
      return;
    }
    this.navigateToProvince(marker.province);
  },

  navigateToProvince(provinceName) {
    if (!this.isLoggedIn()) {
      this.showLoginRequiredToast();
      return;
    }
    wx.navigateTo({
      url: `/pages/place/index?province=${encodeURIComponent(provinceName)}&title=${encodeURIComponent(
        `${provinceName}图库`
      )}`
    });
  },

  isLoggedIn() {
    return this.data.authStatus === 'success';
  },

  showLoginRequiredToast() {
    wx.showToast({ title: '当前未登录，请登录后再上传', icon: 'none' });
  },

  syncAuthState() {
    const app = getApp();
    const auth = app.globalData.auth || {};
    const session = auth.session || {};
    let authText = '点击登录';
    if (auth.status === 'success') {
      authText = session.nickName ? `已登录：${session.nickName}` : '已登录';
    } else if (auth.status === 'loading') {
      authText = '登录中...';
    } else if (auth.status === 'failed') {
      authText = '登录失败，请重试';
    }
    this.setData(
      {
        authStatus: auth.status || 'idle',
        authText,
        avatarUrl: session.avatarUrl || ''
      },
      () => {
        this.loadMarkers();
      }
    );
  },

  async onTapLogin() {
    if (this.data.authStatus === 'loading' || this.data.authStatus === 'success') {
      return;
    }
    this.setData({ loginPanelVisible: true });
  },

  onChooseAvatar(e) {
    const avatarUrl = (e && e.detail && e.detail.avatarUrl) || '';
    this.setData({ pendingAvatarUrl: avatarUrl });
  },

  onNicknameInput(e) {
    const nickName = (e && e.detail && e.detail.value) || '';
    this.setData({ pendingNickName: nickName });
  },

  async onConfirmLogin() {
    const { pendingAvatarUrl, pendingNickName } = this.data;
    if (!pendingAvatarUrl) {
      wx.showToast({ title: '请先选择头像', icon: 'none' });
      return;
    }
    if (!pendingNickName) {
      wx.showToast({ title: '请先填写昵称', icon: 'none' });
      return;
    }
    const app = getApp();
    try {
      await app.loginWithWechat({ avatarUrl: pendingAvatarUrl, nickName: pendingNickName });
      wx.showToast({ title: '登录成功', icon: 'success' });
      this.setData({ loginPanelVisible: false });
    } catch (error) {
      const authError = (app.globalData.auth && app.globalData.auth.error) || '';
      const message = (error && (error.message || error.errMsg)) || authError || '登录失败';
      wx.showModal({
        title: '登录失败诊断',
        content: `错误: ${message}\n接口: ${API_BASE}`,
        showCancel: false
      });
    }
    this.syncAuthState();
  },

  onCancelLogin() {
    this.setData({ loginPanelVisible: false });
  },

  onLogout() {
    const app = getApp();
    app.logout();
    this.setData({
      loginPanelVisible: false,
      pendingAvatarUrl: '',
      pendingNickName: ''
    });
    this.syncAuthState();
    wx.showToast({ title: '已退出登录', icon: 'none' });
  },

  async requestLocationPermission() {
    const auth = await this.getLocationAuthSetting();
    if (auth === true) {
      return true;
    }
    if (auth === undefined) {
      return this.authorizeLocation();
    }
    return this.openSettingForLocation();
  },

  getLocationAuthSetting() {
    return new Promise((resolve) => {
      wx.getSetting({
        success: (res) => resolve(res.authSetting['scope.userLocation']),
        fail: () => resolve(undefined)
      });
    });
  },

  authorizeLocation() {
    return new Promise((resolve) => {
      wx.authorize({
        scope: 'scope.userLocation',
        success: () => resolve(true),
        fail: () => resolve(false)
      });
    });
  },

  openSettingForLocation() {
    return new Promise((resolve) => {
      wx.showModal({
        title: '需要定位权限',
        content: '请开启定位权限，以便进入小程序后自动定位到当前位置。',
        confirmText: '去设置',
        success: (res) => {
          if (!res.confirm) {
            resolve(false);
            return;
          }

          wx.openSetting({
            success: (settingRes) => resolve(!!settingRes.authSetting['scope.userLocation']),
            fail: () => resolve(false)
          });
        },
        fail: () => resolve(false)
      });
    });
  }
});
