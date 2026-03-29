const { getPhotosByProvince, uploadPhoto, removePhoto, formatDate } = require('../../utils/photo-store');

Page({
  data: {
    placeTitle: '省份相册',
    province: '',
    photos: []
  },

  onLoad(options) {
    const placeTitle = options.title ? decodeURIComponent(options.title) : '省份相册';
    const province = options.province ? decodeURIComponent(options.province) : '';

    this.setData({
      placeTitle,
      province
    });
  },

  onShow() {
    this.refreshPhotos();
  },

  async refreshPhotos() {
    const { province } = this.data;
    if (!province) {
      this.setData({ photos: [] });
      return;
    }
    try {
      const photos = await getPhotosByProvince(province);
      this.setData({
        photos: photos.map((item) => ({
          ...item,
          timeText: formatDate(item.createdAt)
        }))
      });
    } catch (error) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async onAddPhoto() {
    const { province } = this.data;
    if (!province) {
      wx.showToast({ title: '省份无效', icon: 'none' });
      return;
    }
    const app = getApp();
    const auth = (app && app.globalData && app.globalData.auth) || {};
    if (auth.status !== 'success') {
      wx.showToast({ title: '当前未登录，请登录后再上传', icon: 'none' });
      return;
    }

    try {
      const media = await this.chooseImage();
      if (!media || !media.tempFilePath) {
        return;
      }

      await uploadPhoto(media.tempFilePath, province);

      await this.refreshPhotos();
      wx.showToast({ title: '已添加', icon: 'success' });
    } catch (error) {
      const message = error && error.errMsg ? error.errMsg : '保存失败';
      if (!String(message).includes('cancel')) {
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    }
  },

  onPreview(e) {
    const { path } = e.currentTarget.dataset;
    if (!path) {
      return;
    }

    const all = this.data.photos.map((item) => item.filePath);
    wx.previewImage({ current: path, urls: all });
  },

  onDelete(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) {
      return;
    }

    wx.showModal({
      title: '删除照片',
      content: '确定删除这张照片吗？',
      success: (res) => {
        if (!res.confirm) {
          return;
        }

        removePhoto(id)
          .then(() => this.refreshPhotos())
          .catch(() => wx.showToast({ title: '删除失败', icon: 'none' }));
      }
    });
  },

  chooseImage() {
    return new Promise((resolve, reject) => {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera', 'album'],
        success: (res) => {
          const file = res.tempFiles && res.tempFiles[0];
          resolve(file ? { tempFilePath: file.tempFilePath } : null);
        },
        fail: reject
      });
    });
  }
});
