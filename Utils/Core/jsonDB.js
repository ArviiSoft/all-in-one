const path = require('path');
const { createJsonStore } = require('./safeJsonStore');

const filePath = path.join(__dirname, '../../Database/Ses Sistemleri/sesMesajVeri.json');
const store = createJsonStore(filePath);

module.exports = store;