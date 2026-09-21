'use strict';
const fs = require('../../Utils/Core/databaseFs');
const path = require('node:path');
const { atomikYaz } = require('./atomik');

function createCommunityStore(root = path.resolve(__dirname, '../../Database')) {
  function file(name) { return path.join(root, name); }
  function read(name) {
    try {
      const data = JSON.parse(fs.readFileSync(file(name), 'utf8'));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('Topluluk ayar dosyası bir nesne olmalı.');
      return data;
    }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }
  function get(name, guildId) { return read(name)[guildId] || {}; }
  function update(name, guildId, updater) {
    const data = read(name);
    const draft = { ...data[guildId] };
    updater(draft);
    data[guildId] = draft;
    fs.mkdirSync(path.dirname(file(name)), { recursive: true });
    atomikYaz(file(name), data);
    return draft;
  }
  function updateRoot(name, updater) {
    const data = read(name);
    updater(data);
    atomikYaz(file(name), data);
    return data;
  }
  return { read, get, update, updateRoot };
}
module.exports = { createCommunityStore };