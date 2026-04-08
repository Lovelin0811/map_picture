const {
  getPhotosByProvince,
  getFoldersByProvince,
  createFolder,
  deleteFolder,
  assignPhotoToFolder,
  uploadPhoto,
  removePhoto,
  formatDate
} = require('../../utils/photo-store');

Page({
  data: {
    placeTitle: '省份相册',
    province: '',
    allPhotos: [],
    photos: [],
    folders: [],
    selectedFolderId: 'all',
    folderEditorVisible: false,
    pendingFolderName: ''
  },

  onLoad(options) {
    const placeTitle = options.title ? decodeURIComponent(options.title) : '省份相册';
    const province = options.province ? decodeURIComponent(options.province) : '';

    this.setData({
      placeTitle,
      province
    });
    this.thumbnailCache = {};
  },

  async onShow() {
    await this.refreshAllData();
  },

  async refreshAllData() {
    await Promise.all([this.refreshFolders(), this.refreshPhotos()]);
  },

  async refreshFolders() {
    const { province } = this.data;
    if (!province) {
      this.setData({ folders: [] });
      return;
    }
    try {
      const folders = await getFoldersByProvince(province);
      this.setData({
        folders: folders.map((item) => ({
          ...item,
          folderKey: String(item.id)
        }))
      });
    } catch (error) {
      wx.showToast({ title: '加载文件夹失败', icon: 'none' });
    }
  },

  async refreshPhotos() {
    const { province } = this.data;
    if (!province) {
      this.setData({ allPhotos: [], photos: [] });
      return;
    }
    try {
      const photos = await getPhotosByProvince(province);
      const allPhotos = photos.map((item) => ({
        ...item,
        timeText: formatDate(item.createdAt),
        displayPath: item.filePath
      }));
      this.setData({ allPhotos }, () => {
        this.applyPhotoFilter();
        this.preparePhotoThumbnails();
      });
    } catch (error) {
      wx.showToast({ title: '加载照片失败', icon: 'none' });
    }
  },

  async onAddPhoto() {
    const { province, selectedFolderId, folders } = this.data;
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

      const targetFolderId = selectedFolderId === 'all' ? null : Number(selectedFolderId);
      const targetFolder = folders.find((item) => String(item.id) === String(selectedFolderId));
      await uploadPhoto(media.tempFilePath, province, targetFolderId);

      await this.refreshAllData();
      wx.showToast({
        title: targetFolder ? `已添加到${targetFolder.name}` : '已添加',
        icon: 'success'
      });
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

    const all = this.data.photos.map((item) => item.displayPath || item.filePath);
    wx.previewImage({ current: path, urls: all });
  },

  async preparePhotoThumbnails() {
    const source = this.data.allPhotos || [];
    if (!source.length) {
      return;
    }
    const updated = await Promise.all(
      source.map(async (item) => {
        const remotePath = item.filePath;
        if (!remotePath) {
          return item;
        }
        if (this.thumbnailCache[remotePath]) {
          return {
            ...item,
            displayPath: this.thumbnailCache[remotePath]
          };
        }
        const localPath = await this.downloadToTempPath(remotePath);
        if (localPath) {
          this.thumbnailCache[remotePath] = localPath;
        }
        return {
          ...item,
          displayPath: localPath || remotePath
        };
      })
    );
    this.setData({ allPhotos: updated }, () => this.applyPhotoFilter());
  },

  downloadToTempPath(url) {
    return new Promise((resolve) => {
      wx.downloadFile({
        url,
        timeout: 10000,
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
            resolve(res.tempFilePath);
            return;
          }
          resolve('');
        },
        fail: () => resolve('')
      });
    });
  },

  async onPhotoLongPress(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) {
      return;
    }
    wx.showActionSheet({
      itemList: ['移动到文件夹', '删除照片'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.chooseFolderForPhoto(id);
          return;
        }
        this.confirmDeletePhoto(id);
      }
    });
  },

  confirmDeletePhoto(id) {
    wx.showModal({
      title: '删除照片',
      content: '确定删除这张照片吗？',
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        removePhoto(id)
          .then(() => this.refreshAllData())
          .catch((error) =>
            wx.showToast({
              title: (error && error.message) || '删除失败',
              icon: 'none'
            })
          );
      }
    });
  },

  chooseFolderForPhoto(photoId) {
    const { folders } = this.data;
    const folderOptions = folders.map((item) => item.name);
    const options = ['移出文件夹', ...folderOptions];

    wx.showActionSheet({
      itemList: options,
      success: async (res) => {
        try {
          const folderId = res.tapIndex === 0 ? null : folders[res.tapIndex - 1].id;
          await assignPhotoToFolder(photoId, folderId);
          await this.refreshAllData();
          wx.showToast({ title: '已更新', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: '移动失败', icon: 'none' });
        }
      }
    });
  },

  onSelectFolder(e) {
    const folderId = String((e.currentTarget.dataset && e.currentTarget.dataset.folderId) || 'all');
    this.setData({ selectedFolderId: folderId }, () => this.applyPhotoFilter());
  },

  onFolderLongPress(e) {
    const folderId = Number(e.currentTarget.dataset && e.currentTarget.dataset.folderId);
    const folderName = String((e.currentTarget.dataset && e.currentTarget.dataset.folderName) || '');
    if (!Number.isInteger(folderId) || folderId <= 0) {
      return;
    }
    wx.showActionSheet({
      itemList: ['保存照片（移到全部）', '不保存照片（一起删除）'],
      success: (res) => {
        const keepPhotos = res.tapIndex === 0;
        this.confirmDeleteFolder(folderId, folderName, keepPhotos);
      }
    });
  },

  confirmDeleteFolder(folderId, folderName, keepPhotos) {
    const actionText = keepPhotos ? '保留照片并移动到全部' : '删除文件夹内所有照片';
    wx.showModal({
      title: '删除文件夹',
      content: `确认删除“${folderName || '该文件夹'}”？\n将会${actionText}。`,
      success: async (res) => {
        if (!res.confirm) {
          return;
        }
        try {
          await deleteFolder(folderId, { keepPhotos });
          const needResetSelected = String(this.data.selectedFolderId) === String(folderId);
          if (needResetSelected) {
            this.setData({ selectedFolderId: 'all' });
          }
          await this.refreshAllData();
          wx.showToast({ title: '文件夹已删除', icon: 'success' });
        } catch (error) {
          wx.showToast({
            title: (error && error.message) || '删除文件夹失败',
            icon: 'none'
          });
        }
      }
    });
  },

  applyPhotoFilter() {
    const { allPhotos, selectedFolderId } = this.data;
    if (selectedFolderId === 'all') {
      this.setData({ photos: allPhotos });
      return;
    }
    const targetId = Number(selectedFolderId);
    this.setData({
      photos: allPhotos.filter((item) => Number(item.folderId || 0) === targetId)
    });
  },

  onToggleFolderEditor() {
    this.setData({
      folderEditorVisible: !this.data.folderEditorVisible
    });
  },

  onFolderNameInput(e) {
    this.setData({
      pendingFolderName: (e && e.detail && e.detail.value) || ''
    });
  },

  async onCreateFolder() {
    const { province, pendingFolderName } = this.data;
    const name = String(pendingFolderName || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入文件夹名称', icon: 'none' });
      return;
    }
    try {
      const folder = await createFolder(province, name);
      await this.refreshFolders();
      this.setData(
        {
          selectedFolderId: String(folder.id),
          pendingFolderName: '',
          folderEditorVisible: false
        },
        () => this.applyPhotoFilter()
      );
      wx.showToast({ title: '已创建', icon: 'success' });
    } catch (error) {
      const message = (error && error.message) || '';
      if (message.includes('已存在')) {
        wx.showToast({ title: '文件夹已存在', icon: 'none' });
        return;
      }
      wx.showToast({ title: '创建失败', icon: 'none' });
    }
  },

  onCancelCreateFolder() {
    this.setData({
      folderEditorVisible: false,
      pendingFolderName: ''
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
