'use strict';

const path = require('path');
const { createJsonStore } = require('../Core/safeJsonStore');

const store = createJsonStore(path.join(__dirname, '../../Database/Sunucu Yönetimi/destek.json'));
const snapshots = new WeakMap();
const clone = value => JSON.parse(JSON.stringify(value));
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function applyChanges(current, before, after) {
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    if (!Object.hasOwn(after, key) || after[key] === undefined) { delete current[key]; continue; }
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    if (isRecord(after[key]) && (before[key] === undefined || isRecord(before[key]))) {
      if (!isRecord(current[key])) current[key] = {};
      applyChanges(current[key], before[key] || {}, after[key]);
    } else {
      current[key] = clone(after[key]);
    }
  }
}

function loadDB() {
  const data = store.loadData();
  snapshots.set(data, clone(data));
  return data;
}

function saveDB(data) {
  const before = snapshots.get(data);
  if (!before) throw new TypeError('Destek verisi kaydedilmeden önce yüklenmeli.');
  store.update(current => applyChanges(current, before, data));
  snapshots.set(data, clone(data));
}

module.exports = { loadDB, saveDB };