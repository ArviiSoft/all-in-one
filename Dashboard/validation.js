const { PermissionFlagsBits } = require('discord.js');
class AyarHatasi extends Error {
  constructor(mesaj, durum = 400) { super(mesaj); this.status = durum; }
}
const kimlikDeseni = /^\d{17,20}$/;
const unicodeEmojiler = ['⭐', '🌟', '✨', '❤️', '🔥', '👍', '👎', '❌', '💯', '🎉', '💜', '✅', '👀', '😂', '🚀'];
function alanOku(nesne, yol) { return yol.split('.').reduce((deger, anahtar) => deger?.[anahtar], nesne); }
function alanYaz(nesne, yol, deger) {
  const parcalar = yol.split('.');
  let hedef = nesne;
  for (const parca of parcalar.slice(0, -1)) {
    if (['__proto__', 'constructor', 'prototype'].includes(parca)) throw new AyarHatasi('Geçersiz alan.');
    hedef = hedef[parca] ||= {};
  }
  hedef[parcalar.at(-1)] = deger;
}
function emojiListesi(client, guild) {
  const liste = new Map(unicodeEmojiler.map(emoji => [emoji, { id: emoji, name: emoji }]));
  for (const emoji of [...(guild.emojis?.cache?.values() || []), ...(client.application?.emojis?.cache?.values() || [])]) {
    const id = `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
    liste.set(id, { id, name: emoji.name });
  }
  return [...liste.values()];
}
function degerDogrula(alan, deger, guild, client) {
  const hata = mesaj => { throw new AyarHatasi(`${alan.label}: ${mesaj}`); };
  if (deger === null && alan.nullable) return null;
  if (alan.type === 'boolean') { if (typeof deger !== 'boolean') hata('açık veya kapalı olmalı.'); return deger; }
  if (alan.type === 'number') {
    if (!Number.isSafeInteger(deger) || deger < alan.min || deger > alan.max) hata(`${alan.min}–${alan.max} arasında tam sayı olmalı.`);
    return deger;
  }
  if (alan.type === 'array') {
    if (!Array.isArray(deger) || deger.length > alan.max || deger.length < (alan.min || 0)) hata(`en az ${alan.min || 0}, en fazla ${alan.max} seçim yapın.`);
    const dizi = deger.map(d => degerDogrula(alan.item, d, guild, client));
    if (new Set(dizi).size !== dizi.length) hata('aynı seçim tekrarlanamaz.');
    return dizi;
  }
  if (alan.type === 'list') {
    if (!Array.isArray(deger) || deger.length > alan.max) hata(`en fazla ${alan.max} kayıt eklenebilir.`);
    return deger.map(kayit => {
      if (!kayit || typeof kayit !== 'object' || Array.isArray(kayit)) hata('geçersiz kayıt.');
      if (Object.keys(kayit).some(k => !alan.fields.some(a => a.key === k))) hata('bilinmeyen alan.');
      return Object.fromEntries(alan.fields.map(a => [a.key, degerDogrula(a, kayit[a.key], guild, client)]));
    });
  }
  if (typeof deger !== 'string') hata('geçerli bir değer gerekli.');
  if (alan.type === 'user' && !kimlikDeseni.test(deger)) hata('17–20 haneli bir Discord kullanıcı ID’si girin.');
  if (['channel', 'role'].includes(alan.type)) {
    if (!kimlikDeseni.test(deger)) hata('listeden seçim yapın.');
    const nesne = alan.type === 'channel' ? guild.channels.cache.get(deger) : guild.roles.cache.get(deger);
    if (!nesne) hata('seçim bu sunucuda bulunamadı.');
    if (alan.type === 'channel' && !(alan.channelTypes || [0, 5]).includes(nesne.type)) hata('kanal türü uygun değil.');
    if (alan.type === 'role' && (nesne.id === guild.id || nesne.managed)) hata('bu rol seçilemez.');
    if (alan.assignable && !guild.members.me) hata('botun rol bilgisi henüz yüklenmedi. Tekrar deneyin.');
    if (alan.assignable && !guild.members.me.permissions?.has(PermissionFlagsBits.ManageRoles)) hata('botun Rolleri Yönet izni gerekli.');
    if (alan.assignable && nesne.position >= guild.members.me.roles.highest.position) hata('rol botun en yüksek rolünün altında olmalı.');
    return deger;
  }
  if (alan.type === 'emoji' && !(alan.unicodeOnly ? unicodeEmojiler.includes(deger) : emojiListesi(client, guild).some(e => e.id === deger))) hata('listeden kullanılabilir bir emoji seçin.');
  if (alan.type === 'select' && !alan.options.some(o => o.value === deger)) hata('listeden seçim yapın.');
  if (deger.length > (alan.maxLength || 2000) || deger.length < (alan.minLength || 0)) hata('metin uzunluğu geçersiz.');
  if (alan.tokens) for (const eslesme of deger.matchAll(/\{([^{}]+)\}/g)) if (!alan.tokens.includes(eslesme[1])) hata(`bilinmeyen değişken: {${eslesme[1]}}`);
  return deger;
}
function yamaDogrula(modul, yama, guild, client) {
  if (!yama || typeof yama !== 'object' || Array.isArray(yama) || !Object.keys(yama).length) throw new AyarHatasi('Değişiklik bulunamadı.');
  const sonuc = {};
  for (const [anahtar, deger] of Object.entries(yama)) {
    const alan = modul.fields.find(a => a.key === anahtar);
    if (!alan) throw new AyarHatasi('Bilinmeyen ayar alanı.');
    alanYaz(sonuc, anahtar, degerDogrula(alan, deger, guild, client));
  }
  return sonuc;
}
function gorunum(modul, veri) {
  return Object.fromEntries(modul.fields.map(alan => {
    let deger = alanOku(veri, alan.key) ?? alan.default ?? (alan.nullable ? null : alan.type === 'boolean' ? false : ['list', 'array'].includes(alan.type) ? [] : '');
    if (alan.type === 'list') deger = deger.map(kayit => gorunum({ fields: alan.fields }, kayit));
    return [alan.key, deger];
  }));
}
module.exports = { AyarHatasi, kimlikDeseni, unicodeEmojiler, alanOku, alanYaz, emojiListesi, yamaDogrula, gorunum };
