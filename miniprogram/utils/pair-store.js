const { request } = require('./api');

function getPairStatus() {
  return request('/api/pair/status', { method: 'GET' });
}

function createPairInvite() {
  return request('/api/pair/invite', { method: 'POST' });
}

function acceptPairInvite(code) {
  return request('/api/pair/accept', {
    method: 'POST',
    data: { code: String(code || '').trim() }
  });
}

function unbindPair() {
  return request('/api/pair/unbind', { method: 'POST' });
}

module.exports = {
  getPairStatus,
  createPairInvite,
  acceptPairInvite,
  unbindPair
};
