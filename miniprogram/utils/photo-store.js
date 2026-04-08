const { request, makeUrl, getAuthToken } = require('./api');

function buildProtectedPhotoUrl(photoId) {
  const token = getAuthToken();
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
  return makeUrl(`/api/photos/file/${photoId}${tokenQuery}`);
}

function fetchProvinceStats() {
  return request('/api/photos/stats', { method: 'GET' });
}

function getPhotosByProvince(provinceName) {
  return request(`/api/photos?province=${encodeURIComponent(provinceName)}`, { method: 'GET' }).then((rows) =>
    rows.map((item) => ({
      id: item.id,
      province: item.province,
      filePath: buildProtectedPhotoUrl(item.id),
      createdAt: item.createdAt,
      folderId: item.folderId ? Number(item.folderId) : null,
      folderName: item.folderName || ''
    }))
  );
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

function assignPhotoToFolder(photoId, folderId) {
  return request(`/api/photos/${photoId}/folder`, {
    method: 'PATCH',
    data: { folderId: folderId || null }
  });
}

function uploadPhoto(filePath, province) {
  const token = getAuthToken();
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: makeUrl('/api/photos/upload'),
      filePath,
      name: 'file',
      formData: { province },
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
              createdAt: data.createdAt
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
  assignPhotoToFolder,
  uploadPhoto,
  removePhoto,
  formatDate
};
