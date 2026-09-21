const path = require('path');
const { createJsonStore } = require('../Core/safeJsonStore');
const store = createJsonStore(path.join(__dirname, '../../Database/Ses Sistemleri/tempVoice.json'));

function getConfig() { return store.loadData(); }
function updateConfig(patch) {
  return store.update(data => {
    Object.assign(data, patch);
    return { ...data };
  });
}

module.exports = { getConfig, updateConfig };