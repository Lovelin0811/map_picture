const {
  getPhotosByProvince,
  getFoldersByProvince,
  createFolder,
  deleteFolder,
  assignPhotoToFolder,
  uploadPhoto,
  removePhoto,
  downloadPhotoToTemp,
  formatDate
} = require('../../utils/photo-store');

const UNCLASSIFIED_KEY = 'unclassified';

Page({
  data: {
    placeTitle: '省份相册',
    province: '',
    allPhotos: [],
    photos: [],
    folders: [],
    selectedFolderId: 'all',
    unclassifiedCount: 0,
    currentPage: 1,
    pageSize: 30,
    hasMore: true,
    loadingMore: false,
    folderEditorVisible: false,
    pendingFolderName: '',
    selectionMode: false,
    selectedPhotoIds: []
  },

  onLoad(options) {
    const placeTitle = options.title ? decodeURIComponent(options.title) : '省份相册';
    const province = options.province ? decodeURIComponent(options.province) : '';

    this.setData({
      placeTitle,
      province
    });
    this.thumbnailCache = {};
    this.thumbnailFailed = {};
  },

  async onShow() {
    await this.refreshAllData();
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore) {
      return;
    }
    this.refreshPhotos(false);
  },

  async refreshAllData() {
    await Promise.all([this.refreshFolders(), this.refreshPhotos(true)]);
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

  async refreshPhotos(reset = false) {
    const { province, currentPage, pageSize, allPhotos, loadingMore } = this.data;
    if (!province) {
      this.setData({ allPhotos: [], photos: [], hasMore: false, loadingMore: false });
      return;
    }
    if (!reset && loadingMore) {
      return;
    }

    const nextPage = reset ? 1 : currentPage + 1;
    if (!reset) {
      this.setData({ loadingMore: true });
    }

    try {
      const payload = await getPhotosByProvince(province, {
        page: nextPage,
        pageSize
      });
      const incoming = (payload.items || []).map((item) => ({
        ...item,
        timeText: formatDate(item.createdAt)
      }));
      const merged = reset ? incoming : [...allPhotos, ...incoming];
      const dedupMap = new Map();
      merged.forEach((item) => {
        dedupMap.set(Number(item.id), item);
      });
      const mergedPhotos = Array.from(dedupMap.values()).sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
      const unclassifiedCount = mergedPhotos.filter((item) => !item.folderId).length;

      this.setData(
        {
          allPhotos: mergedPhotos,
          unclassifiedCount,
          currentPage: nextPage,
          hasMore: !!payload.hasMore,
          loadingMore: false
        },
        () => {
          this.applyPhotoFilter();
          this.preparePhotoThumbnails();
        }
      );
    } catch (error) {
      this.setData({ loadingMore: false });
      wx.showToast({ title: '加载照片失败', icon: 'none' });
    }
  },

  async preparePhotoThumbnails() {
    const visible = (this.data.photos || []).slice(0, 36);
    if (!visible.length) {
      return;
    }

    let changed = false;
    await Promise.all(
      visible.map(async (item) => {
        const photoId = Number(item.id);
        if (!photoId || this.thumbnailCache[photoId]) {
          return;
        }
        const localPath = await this.downloadToTempPath(photoId);
        if (localPath) {
          this.thumbnailCache[photoId] = localPath;
          // 下载成功，清除失败标记
          if (this.thumbnailFailed && this.thumbnailFailed[photoId]) {
            delete this.thumbnailFailed[photoId];
          }
          changed = true;
        } else {
          // 记录下载失败
          if (!this.thumbnailFailed) {
            this.thumbnailFailed = {};
          }
          this.thumbnailFailed[photoId] = true;
          changed = true;
        }
      })
    );

    if (changed) {
      this.applyPhotoFilter();
    }
  },

  downloadToTempPath(photoId) {
    return downloadPhotoToTemp(photoId);
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
      const medias = await this.chooseImages();
      if (!medias || !medias.length) {
        return;
      }

      const isUnclassified = selectedFolderId === UNCLASSIFIED_KEY;
      const targetFolderId = selectedFolderId === 'all' || isUnclassified ? null : Number(selectedFolderId);
      const targetFolder = folders.find((item) => String(item.id) === String(selectedFolderId));
      let successCount = 0;
      for (const media of medias) {
        if (!media || !media.tempFilePath) {
          continue;
        }
        try {
          await uploadPhoto(media.tempFilePath, province, targetFolderId);
          successCount += 1;
        } catch (_error) {}
      }
      if (!successCount) {
        wx.showToast({ title: '上传失败', icon: 'none' });
        return;
      }

      await this.refreshAllData();
      wx.showToast({
        title: targetFolder
          ? `已上传${successCount}张到${targetFolder.name}`
          : isUnclassified
            ? `已上传${successCount}张到未分类`
            : `已上传${successCount}张`,
        icon: 'success'
      });
    } catch (error) {
      const message = error && error.errMsg ? error.errMsg : '保存失败';
      if (!String(message).includes('cancel')) {
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    }
  },

  onPhotoTap(e) {
    const { id, path } = e.currentTarget.dataset;
    if (this.data.selectionMode) {
      this.togglePhotoSelection(id);
      return;
    }
    // 缩略图加载失败时，点击重试下载
    const photoId = Number(id);
    if (this.thumbnailFailed && this.thumbnailFailed[photoId]) {
      this.retryThumbnail(photoId);
      return;
    }
    this.onPreview(path);
  },

  async retryThumbnail(photoId) {
    wx.showLoading({ title: '加载中', mask: true });
    const localPath = await this.downloadToTempPath(photoId);
    wx.hideLoading();
    if (localPath) {
      this.thumbnailCache[photoId] = localPath;
      delete this.thumbnailFailed[photoId];
      this.applyPhotoFilter();
      // 加载成功后直接预览
      this.onPreview(localPath);
    } else {
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' });
    }
  },

  onPreview(path) {
    if (!path) {
      return;
    }
    const all = this.data.photos.map((item) => item.displayPath).filter(Boolean);
    wx.previewImage({ current: path, urls: all.length ? all : [path] });
  },

  togglePhotoSelection(id) {
    const photoId = Number(id);
    if (!Number.isInteger(photoId) || photoId <= 0) {
      return;
    }
    const selected = new Set(this.data.selectedPhotoIds || []);
    if (selected.has(photoId)) {
      selected.delete(photoId);
    } else {
      selected.add(photoId);
    }
    this.setData({ selectedPhotoIds: Array.from(selected) }, () => this.applyPhotoFilter());
  },

  enterSelectionMode(initialPhotoId) {
    const selected = [];
    const id = Number(initialPhotoId);
    if (Number.isInteger(id) && id > 0) {
      selected.push(id);
    }
    this.setData(
      {
        selectionMode: true,
        selectedPhotoIds: selected
      },
      () => this.applyPhotoFilter()
    );
  },

  exitSelectionMode() {
    this.setData(
      {
        selectionMode: false,
        selectedPhotoIds: []
      },
      () => this.applyPhotoFilter()
    );
  },

  onCancelSelectionMode() {
    this.exitSelectionMode();
  },

  async onPhotoLongPress(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) {
      return;
    }
    if (this.data.selectionMode) {
      this.togglePhotoSelection(id);
      return;
    }
    this.enterSelectionMode(id);
  },

  onBatchDeletePhotos() {
    const ids = (this.data.selectedPhotoIds || []).filter((id) => Number.isInteger(id) && id > 0);
    if (!ids.length) {
      wx.showToast({ title: '请先选择照片', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '批量删除照片',
      content: `确定删除已选中的 ${ids.length} 张照片吗？`,
      success: async (res) => {
        if (!res.confirm) {
          return;
        }
        const results = await Promise.allSettled(ids.map((id) => removePhoto(id)));
        const successCount = results.filter((item) => item.status === 'fulfilled').length;
        await this.refreshAllData();
        this.exitSelectionMode();
        if (successCount === ids.length) {
          wx.showToast({ title: `已删除${successCount}张`, icon: 'success' });
          return;
        }
        wx.showToast({ title: `删除成功${successCount}/${ids.length}`, icon: 'none' });
      }
    });
  },

  onBatchMoveToFolder() {
    const ids = (this.data.selectedPhotoIds || []).filter((id) => Number.isInteger(id) && id > 0);
    if (!ids.length) {
      wx.showToast({ title: '请先选择照片', icon: 'none' });
      return;
    }
    const { folders } = this.data;
    const folderOptions = folders.map((item) => item.name);
    const options = ['移出文件夹', ...folderOptions];
    wx.showActionSheet({
      itemList: options,
      success: async (res) => {
        const folderId = res.tapIndex === 0 ? null : folders[res.tapIndex - 1].id;
        const results = await Promise.allSettled(ids.map((id) => assignPhotoToFolder(id, folderId)));
        const successCount = results.filter((item) => item.status === 'fulfilled').length;
        await this.refreshAllData();
        this.exitSelectionMode();
        if (successCount === ids.length) {
          wx.showToast({ title: `已移动${successCount}张`, icon: 'success' });
          return;
        }
        wx.showToast({ title: `移动成功${successCount}/${ids.length}`, icon: 'none' });
      }
    });
  },

  onSelectFolder(e) {
    const folderId = String((e.currentTarget.dataset && e.currentTarget.dataset.folderId) || 'all');
    this.setData({ selectedFolderId: folderId }, () => {
      this.applyPhotoFilter();
      this.preparePhotoThumbnails();
    });
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
    const selectedSet = new Set((this.data.selectedPhotoIds || []).map((id) => Number(id)));

    const withUi = (items) =>
      items.map((item) => {
        const photoId = Number(item.id);
        const cached = this.thumbnailCache[photoId];
        const loadFailed = this.thumbnailFailed && this.thumbnailFailed[photoId];
        return {
          ...item,
          displayPath: cached || '',
          loadFailed: !!loadFailed,
          checked: selectedSet.has(photoId)
        };
      });

    if (selectedFolderId === 'all') {
      this.setData({ photos: withUi(allPhotos) });
      return;
    }
    if (selectedFolderId === UNCLASSIFIED_KEY) {
      this.setData({
        photos: withUi(allPhotos.filter((item) => !item.folderId))
      });
      return;
    }
    const targetId = Number(selectedFolderId);
    this.setData({
      photos: withUi(allPhotos.filter((item) => Number(item.folderId || 0) === targetId))
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
        () => {
          this.applyPhotoFilter();
          this.preparePhotoThumbnails();
        }
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

  chooseImages() {
    return new Promise((resolve, reject) => {
      wx.chooseMedia({
        count: 9,
        mediaType: ['image'],
        sourceType: ['camera', 'album'],
        success: (res) => {
          const files = (res.tempFiles || []).map((file) => ({ tempFilePath: file.tempFilePath })).filter((file) =>
            file && file.tempFilePath
          );
          resolve(files);
        },
        fail: reject
      });
    });
  }
});
