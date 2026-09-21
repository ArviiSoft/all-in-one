const fs = require('../Core/databaseFs');
const path = require('path');
const { DEFAULT_ZAMANLAMA, normalizeZamanlama } = require('./aktifUyeZamanlama');

const filePath = path.join(__dirname, '../../Database/Üye Verileri/aktifUye.json');

const DEFAULT_DATA = Object.freeze({
  guild: null,
  kanal: null,
  mesaj: null,
  thread: null,
  rol: null,
  aktifUye: null,
  birinci: { id: null, puan: 0 },
  oncekiHafta: { id: null, puan: 0 },
  streaks: {},
  rekorlar: [],
  streakRekorlar: [],
  zamanlama: DEFAULT_ZAMANLAMA,
});

function createDefaultData() {
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function loadData() {
  if (!fs.existsSync(filePath)) return createDefaultData();
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    const parsed = JSON.parse(raw || '{}');
    return {
      ...createDefaultData(),
      ...parsed,
      birinci: { ...DEFAULT_DATA.birinci, ...parsed.birinci },
      oncekiHafta: { ...DEFAULT_DATA.oncekiHafta, ...parsed.oncekiHafta },
      streaks: parsed.streaks && typeof parsed.streaks === 'object' ? parsed.streaks : {},
      rekorlar: Array.isArray(parsed.rekorlar) ? parsed.rekorlar : [],
      streakRekorlar: Array.isArray(parsed.streakRekorlar) ? parsed.streakRekorlar : [],
      zamanlama: normalizeZamanlama(parsed.zamanlama),
    };
  } catch {
    return createDefaultData();
  }
}

function saveData(data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function get(key) {
  const data = loadData();
  return data[key];
}

function set(key, value) {
  const data = loadData();
  data[key] = value;
  saveData(data);
}

function add(key, value) {
  const data = loadData();
  if (!data[key]) data[key] = 0;
  data[key] += value;
  saveData(data);
}

function deleteKey(key) {
  const data = loadData();
  delete data[key];
  saveData(data);
}

function all() {
  return Object.entries(loadData()).map(([key, value]) => ({ key, value }));
}

function resetStatistics(data = loadData()) {
  for (const key of Object.keys(data)) {
    if (key.startsWith('puan_')) delete data[key];
  }

  data.aktifUye = null;
  data.birinci = { id: null, puan: 0 };
  data.oncekiHafta = { id: null, puan: 0 };
  data.streaks = {};
  data.rekorlar = [];
  data.streakRekorlar = [];
  return data;
}

function clearData() {
  saveData({});
}

module.exports = {
  all,
  clearData,
  createDefaultData,
  delete: deleteKey,
  filePath,
  get,
  loadData,
  resetStatistics,
  saveData,
  set,
  add,
};
