const path = require('node:path');
const { createHash } = require('node:crypto');
const Jimp = require('jimp');
const { createJsonStore } = require('../../Utils/Core/safeJsonStore');
const { AyarHatasi } = require('../validation');

const MAX_AVATAR_BYTES = 300 * 1024;
const AVATAR_SIZE = 256;
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');

async function normalizeAvatar(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_AVATAR_BYTES / 3) * 4 + 22 || !value.startsWith('data:image/png;base64,')) {
    throw new AyarHatasi('Avatar en fazla 300 KB boyutunda bir PNG görseli olmalı.');
  }
  const encoded = value.slice(22);
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.length < 33 || buffer.length > MAX_AVATAR_BYTES || buffer.toString('base64') !== encoded || !buffer.subarray(0, 8).equals(PNG_SIGNATURE) || buffer.readUInt32BE(8) !== 13 || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new AyarHatasi('Avatar geçerli bir PNG görseli olmalı.');
  }
  const width = buffer.readUInt32BE(16); const height = buffer.readUInt32BE(20);
  if (!width || !height || width > AVATAR_SIZE || height > AVATAR_SIZE) throw new AyarHatasi('Avatar en fazla 256 × 256 piksel olmalı.');
  if (buffer[28] !== 0) throw new AyarHatasi('Avatar PNG biçimi desteklenmiyor. Görseli panelden yeniden seçin.');
  let offset = 8; let hasData = false; let hasEnd = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset); const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (length > buffer.length - offset - 12 || (type === 'IHDR' && offset !== 8)) throw new AyarHatasi('Avatar PNG yapısı geçersiz.');
    offset += length + 12;
    if (type === 'IDAT') hasData = true;
    if (type === 'IEND') { hasEnd = length === 0; break; }
  }
  if (!hasData || !hasEnd || offset !== buffer.length) throw new AyarHatasi('Avatar PNG dosyası eksik veya geçersiz.');
  let image;
  try { image = await Jimp.read(buffer); }
  catch { throw new AyarHatasi('Avatar görseli okunamadı. Başka bir görsel seçin.'); }
  if (image.bitmap.width !== width || image.bitmap.height !== height) throw new AyarHatasi('Avatar boyutları geçersiz.');
  image.cover(AVATAR_SIZE, AVATAR_SIZE);
  return `data:image/png;base64,${(await image.getBufferAsync(Jimp.MIME_PNG)).toString('base64')}`;
}

function createProfileStore(file = path.join(__dirname, '../../Database/Sistem/dashboardProfiles.json')) {
  const store = createJsonStore(file);
  const key = username => createHash('sha256').update(username).digest('hex');
  return {
    read(username) { return { avatar: store.get(key(username))?.avatar || null }; },
    write(username, avatar) {
      store.update(data => { data[key(username)] = { avatar }; });
      return { avatar };
    },
  };
}

module.exports = { createProfileStore, normalizeAvatar };