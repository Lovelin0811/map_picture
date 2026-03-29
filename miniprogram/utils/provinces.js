const PROVINCES = [
  { name: '北京', center: { lat: 39.90, lng: 116.40 }, bbox: { minLat: 39.4, maxLat: 41.1, minLng: 115.4, maxLng: 117.6 } },
  { name: '天津', center: { lat: 39.13, lng: 117.20 }, bbox: { minLat: 38.5, maxLat: 40.3, minLng: 116.6, maxLng: 118.1 } },
  { name: '河北', center: { lat: 38.04, lng: 114.51 }, bbox: { minLat: 36.0, maxLat: 42.7, minLng: 113.4, maxLng: 119.9 } },
  { name: '山西', center: { lat: 37.87, lng: 112.55 }, bbox: { minLat: 34.5, maxLat: 40.7, minLng: 110.2, maxLng: 114.6 } },
  { name: '内蒙古', center: { lat: 40.82, lng: 111.65 }, bbox: { minLat: 37.4, maxLat: 53.4, minLng: 97.2, maxLng: 126.1 } },
  { name: '辽宁', center: { lat: 41.80, lng: 123.43 }, bbox: { minLat: 38.7, maxLat: 43.5, minLng: 118.8, maxLng: 125.8 } },
  { name: '吉林', center: { lat: 43.88, lng: 125.32 }, bbox: { minLat: 40.8, maxLat: 46.3, minLng: 121.6, maxLng: 131.3 } },
  { name: '黑龙江', center: { lat: 45.75, lng: 126.63 }, bbox: { minLat: 43.4, maxLat: 53.6, minLng: 121.2, maxLng: 135.1 } },
  { name: '上海', center: { lat: 31.23, lng: 121.47 }, bbox: { minLat: 30.6, maxLat: 31.9, minLng: 120.8, maxLng: 122.1 } },
  { name: '江苏', center: { lat: 32.06, lng: 118.79 }, bbox: { minLat: 30.8, maxLat: 35.3, minLng: 116.3, maxLng: 121.9 } },
  { name: '浙江', center: { lat: 30.27, lng: 120.15 }, bbox: { minLat: 27.0, maxLat: 31.2, minLng: 118.0, maxLng: 123.1 } },
  { name: '安徽', center: { lat: 31.86, lng: 117.28 }, bbox: { minLat: 29.4, maxLat: 34.7, minLng: 114.9, maxLng: 119.7 } },
  { name: '福建', center: { lat: 26.08, lng: 119.30 }, bbox: { minLat: 23.5, maxLat: 28.4, minLng: 115.8, maxLng: 120.7 } },
  { name: '江西', center: { lat: 28.68, lng: 115.89 }, bbox: { minLat: 24.5, maxLat: 30.2, minLng: 113.4, maxLng: 118.6 } },
  { name: '山东', center: { lat: 36.65, lng: 117.00 }, bbox: { minLat: 34.4, maxLat: 38.4, minLng: 114.8, maxLng: 122.7 } },
  { name: '河南', center: { lat: 34.76, lng: 113.65 }, bbox: { minLat: 31.3, maxLat: 36.4, minLng: 110.3, maxLng: 116.7 } },
  { name: '湖北', center: { lat: 30.59, lng: 114.30 }, bbox: { minLat: 29.0, maxLat: 33.3, minLng: 108.3, maxLng: 116.1 } },
  { name: '湖南', center: { lat: 28.23, lng: 112.93 }, bbox: { minLat: 24.6, maxLat: 30.1, minLng: 108.8, maxLng: 114.3 } },
  { name: '广东', center: { lat: 23.13, lng: 113.26 }, bbox: { minLat: 20.1, maxLat: 25.5, minLng: 109.6, maxLng: 117.4 } },
  { name: '广西', center: { lat: 22.82, lng: 108.32 }, bbox: { minLat: 20.9, maxLat: 26.4, minLng: 104.5, maxLng: 112.1 } },
  { name: '海南', center: { lat: 20.03, lng: 110.35 }, bbox: { minLat: 18.0, maxLat: 20.3, minLng: 108.6, maxLng: 111.1 } },
  { name: '重庆', center: { lat: 29.56, lng: 106.55 }, bbox: { minLat: 28.1, maxLat: 32.2, minLng: 105.2, maxLng: 110.2 } },
  { name: '四川', center: { lat: 30.67, lng: 104.06 }, bbox: { minLat: 26.0, maxLat: 34.3, minLng: 97.3, maxLng: 108.5 } },
  { name: '贵州', center: { lat: 26.65, lng: 106.71 }, bbox: { minLat: 24.6, maxLat: 29.2, minLng: 103.6, maxLng: 109.6 } },
  { name: '云南', center: { lat: 25.04, lng: 102.71 }, bbox: { minLat: 21.1, maxLat: 29.3, minLng: 97.5, maxLng: 106.2 } },
  { name: '西藏', center: { lat: 29.65, lng: 91.13 }, bbox: { minLat: 26.8, maxLat: 36.5, minLng: 78.3, maxLng: 99.1 } },
  { name: '陕西', center: { lat: 34.27, lng: 108.95 }, bbox: { minLat: 31.7, maxLat: 39.6, minLng: 105.5, maxLng: 111.3 } },
  { name: '甘肃', center: { lat: 36.06, lng: 103.83 }, bbox: { minLat: 32.5, maxLat: 42.8, minLng: 92.2, maxLng: 108.8 } },
  { name: '青海', center: { lat: 36.62, lng: 101.78 }, bbox: { minLat: 31.4, maxLat: 39.4, minLng: 89.4, maxLng: 103.1 } },
  { name: '宁夏', center: { lat: 38.47, lng: 106.27 }, bbox: { minLat: 35.2, maxLat: 39.4, minLng: 104.3, maxLng: 107.7 } },
  { name: '新疆', center: { lat: 43.79, lng: 87.61 }, bbox: { minLat: 34.3, maxLat: 49.3, minLng: 73.5, maxLng: 96.4 } },
  { name: '台湾', center: { lat: 25.03, lng: 121.56 }, bbox: { minLat: 21.8, maxLat: 25.4, minLng: 119.3, maxLng: 122.1 } },
  { name: '香港', center: { lat: 22.32, lng: 114.17 }, bbox: { minLat: 22.1, maxLat: 22.6, minLng: 113.8, maxLng: 114.5 } },
  { name: '澳门', center: { lat: 22.20, lng: 113.55 }, bbox: { minLat: 22.1, maxLat: 22.3, minLng: 113.5, maxLng: 113.6 } }
];

function findProvinceByPoint(latitude, longitude) {
  const candidates = PROVINCES.filter(
    (province) =>
      latitude >= province.bbox.minLat &&
      latitude <= province.bbox.maxLat &&
      longitude >= province.bbox.minLng &&
      longitude <= province.bbox.maxLng
  );

  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  return candidates.reduce((best, current) => {
    const bestDist =
      Math.pow(latitude - best.center.lat, 2) + Math.pow(longitude - best.center.lng, 2);
    const currentDist =
      Math.pow(latitude - current.center.lat, 2) + Math.pow(longitude - current.center.lng, 2);
    return currentDist < bestDist ? current : best;
  });
}

const TAP_HIT_EXPAND = {
  上海: { lat: 0.35, lng: 0.35 },
  香港: { lat: 0.25, lng: 0.25 },
  澳门: { lat: 0.22, lng: 0.22 },
  北京: { lat: 0.25, lng: 0.25 },
  天津: { lat: 0.25, lng: 0.25 }
};

function inExpandedBbox(province, latitude, longitude) {
  const expand = TAP_HIT_EXPAND[province.name];
  if (!expand) {
    return false;
  }
  return (
    latitude >= province.bbox.minLat - expand.lat &&
    latitude <= province.bbox.maxLat + expand.lat &&
    longitude >= province.bbox.minLng - expand.lng &&
    longitude <= province.bbox.maxLng + expand.lng
  );
}

function distanceToCenter(province, latitude, longitude) {
  return Math.pow(latitude - province.center.lat, 2) + Math.pow(longitude - province.center.lng, 2);
}

function findProvinceByTapPoint(latitude, longitude) {
  const strict = findProvinceByPoint(latitude, longitude);
  if (strict) {
    return strict;
  }

  const expandedCandidates = PROVINCES.filter((province) => inExpandedBbox(province, latitude, longitude));
  if (expandedCandidates.length > 0) {
    return expandedCandidates.reduce((best, current) =>
      distanceToCenter(current, latitude, longitude) < distanceToCenter(best, latitude, longitude)
        ? current
        : best
    );
  }

  return null;
}

module.exports = {
  PROVINCES,
  findProvinceByPoint,
  findProvinceByTapPoint
};
