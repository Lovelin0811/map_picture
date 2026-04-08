const { request, makeUrl, getAuthToken } = require('./api');

function buildProtectedPhotoUrl(photoId) {
  return makeUrl(`/api/photos/file/${photoId}`);
}

function fetchProvinceStats() {
  return request('/api/photos/stats', { method: 'GET' });
}

function mapPhotoRow(item) {
  return {
    id: item.id,
    province: item.province,
    filePath: buildProtectedPhotoUrl(item.id),
    createdAt: item.createdAt,
    folderId: item.folderId ? Number(item.folderId) : null,
    folderName: item.folderName || ''
  };
}

function getPhotosByProvince(provinceName, { page = 1, pageSize = 30 } = {}) {
  const query =
    `province=${encodeURIComponent(provinceName)}` +
    `&page=${encodeURIComponent(page)}` +
    `&pageSize=${encodeURIComponent(pageSize)}`;
  return request(`/api/photos?${query}`, { method: 'GET' }).then((payload) => {
    if (Array.isArray(payload)) {
      return {
        items: payload.map(mapPhotoRow),
        page,
        pageSize,
        total: payload.length,
        hasMore: false
      };
    }
    const items = ((payload && payload.items) || []).map(mapPhotoRow);
    return {
      items,
      page: Number((payload && payload.page) || page),
      pageSize: Number((payload && payload.pageSize) || pageSize),
      total: Number((payload && payload.total) || items.length),
      hasMore: !!(payload && payload.hasMore)
    };
  });
}

function getFoldersByProvince(provinceName) {
  return request(`/api/folders?province=${encodeURIComponent(provinceName)}`, { method: 'GET' }).then((rows) =>
    rows.map((item) => ({
      id: Number(item.id),
      province: item.province,
      name: item.name,
      count: Number(item.count || 0)
    }))
  );
}

function createFolder(province, name) {
  return request('/api/folders', {
    method: 'POST',
    data: { province, name }
  }).then((item) => ({
    id: Number(item.id),
    province: item.province,
    name: item.name,
    count: Number(item.count || 0)
  }));
}

function deleteFolder(folderId, { keepPhotos = true } = {}) {
  return request(`/api/folders/${folderId}`, {
    method: 'DELETE',
    data: { keepPhotos: !!keepPhotos }
  });
}

function assignPhotoToFolder(photoId, folderId) {
  return request(`/api/photos/${photoId}/folder`, {
    method: 'PATCH',
    data: { folderId: folderId || null }
  });
}

function uploadPhoto(filePath, province, folderId = null) {
  const token = getAuthToken();
  const formData = { province };
  if (folderId !== null && folderId !== undefined && folderId !== '') {
    formData.folderId = String(folderId);
  }
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: makeUrl('/api/photos/upload'),
      filePath,
      name: 'file',
      formData,
      header: {
        Authorization: token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        try {
          const data = JSON.parse(res.data || '{}');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              id: data.id,
              province: data.province,
              filePath: buildProtectedPhotoUrl(data.id),
              createdAt: data.createdAt,
              folderId: data.folderId ? Number(data.folderId) : null
            });
            return;
          }
          reject(new Error(data.message || '上传失败'));
        } catch (error) {
          reject(new Error('上传响应解析失败'));
        }
      },
      fail: reject
    });
  });
}

function removePhoto(photoId) {
  return request(`/api/photos/${photoId}`, { method: 'DELETE' });
}

function downloadPhotoToTemp(photoId) {
  const token = getAuthToken();
  return new Promise((resolve) => {
    wx.downloadFile({
      url: buildProtectedPhotoUrl(photoId),
      timeout: 10000,
      header: token
        ? {
            Authorization: `Bearer ${token}`
          }
        : {},
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
}

function formatDate(timestamp) {
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = {
  fetchProvinceStats,
  getPhotosByProvince,
  getFoldersByProvince,
  createFolder,
  deleteFolder,
  assignPhotoToFolder,
  uploadPhoto,
  removePhoto,
  downloadPhotoToTemp,
  formatDate
};
