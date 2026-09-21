const fs = require('../Utils/Core/databaseFs').promises;
const path = require('node:path');

function connectedActive(id, values) {
  const v = values || {};
  switch (id) {
    case 'automod': return Object.values(v).some(rule => rule?.enabled === true);
    case 'starboard': return Boolean(v.enabled && v.channelId);
    case 'aktif-uye': return Boolean(v.channelId && v.roleId);
    case 'burc': return Boolean(v.kanal && v.gonderilecekBurclar?.length);
    case 'giris-cikis': return Boolean(v.aktif && (v.giris?.kanal || v.cikis?.kanal));
    case 'itiraf': return Boolean(v.aktif && v.itirafKanal);
    case 'durum-rol': return Boolean(v.tag && v.rolId);
    case 'abonelik': return Boolean(v.kanal && v.yetkili && v.rol);
    case 'yetkili-basvuru': return Boolean(v.basvuruKanal && v.basvuruMesaj);
    case 'oto-publish': case 'ghost-ping': case 'oto-thread': case 'sureli-mesaj': case 'alinti-rol':
      return Boolean(v.channels?.length);
    case 'mesaja-emoji': case 'medya-görsel': case 'medya-video':
      return Boolean(v.channels?.some(channel => channel.enabled));
    default:
      if (typeof v.enabled === 'boolean') return v.enabled;
      throw new Error('Modül için sistem durumu tanımlanmadı.');
  }
}

async function readModuleStatuses(registry, guild, client) {
  const files = new Map();
  const read = file => {
    if (!files.has(file)) files.set(file, fs.readFile(path.join(__dirname, '../Database', file), 'utf8')
      .then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return {}; throw error; }));
    return files.get(file);
  };
  const config = async file => (await read(file))?.[guild.id] || {};
  const hasChannel = id => Boolean(id && guild.channels.cache.has(id));
  const values = value => Object.values(value || {});
  const pending = {
    'emoji-ekle': () => guild.members.me?.permissions.has(require('discord.js').PermissionFlagsBits.ManageGuildExpressions),
    sticky: async () => Object.entries(await read('Sunucu Yönetimi/sticky.json'))
      .some(([id, record]) => record && (record.guildId ? record.guildId === guild.id : hasChannel(id)) && hasChannel(id)),
    yonlendirme: async () => (await config('Sunucu Yönetimi/kanalaYonlendirme.json')).yönlendirmeler
      ?.some(rule => hasChannel(rule.kaynakId) && hasChannel(rule.hedefId)),
    'clan-tag': async () => values((await config('Sunucu Yönetimi/clanTag.json')).tags).some(Boolean),
    'emoji-rol': async () => values((await config('Sunucu Yönetimi/emojiRol.json')).messages)
      .some(message => hasChannel(message.channelId) && values(message.pairs).some(Boolean)),
    destek: async () => {
      const v = await config('Sunucu Yönetimi/destek.json');
      return v.enabled !== false && hasChannel(v.supportChannel) && v.supportRole && v.categoryId;
    },
    'ses-panelleri': async () => {
      const v = await config('Ses Sistemleri/sesPanelleri.json');
      return ['uyeKanalId', 'aktifUyeKanalId', 'sestekiUyeKanalId', 'rekorKanalId', 'durumKanalId', 'takvimKanalId', 'saatKanalId'].some(key => hasChannel(v[key]));
    },
    'random-medya': async () => values(await config('Eğlence ve Etkileşim/randomMedia.json')).some(v => hasChannel(v?.channelId)),
    honeypot: async () => Object.keys((await config('Güvenlik ve Moderasyon/honeypot.json')).channels || {}).some(hasChannel),
    audit: async () => { const v = await config('Güvenlik ve Moderasyon/auditLog.json'); return v.enabled === true && hasChannel(v.channelId); },
    'temp-voice': async () => { const v = await read('Ses Sistemleri/tempVoice.json'); return v.enabled !== false && v.guildId === guild.id && hasChannel(v.voiceChannelId); },
    'ses-kanali': async () => hasChannel((await read('Ses Sistemleri/sesKanali.json')).aktifSesKanali),
    boost: async () => {
      const v = await config('Boost/boostTracking.json');
      return (v.enabled === true && hasChannel(v.channelId)) || (v.thanks?.enabled === true && hasChannel(v.thanks.channelId));
    },

    youtube: async () => { const v = (await config('Abonelik/aboneSetup.json')).youtube || {}; return v.aktif === true && (v.webhookUrl || v.webhook) && hasChannel(v.bildirimKanal) && v.kaynakKanallar?.length; },
    haber: async () => { const v = await config('Bildirimler ve Sosyal Medya/haberSistemi.json'); return v.enabled !== false && hasChannel(v.kanal) && v.url; },
    'dogum-gunu': async () => { const v = await config('Üye Verileri/dogumGunleri_ayarlar.json'); return v.enabled !== false && hasChannel(v.kanalId) && v.rolId; },
    'eski-yeni': async () => {
      const v = await config('Üye Verileri/eskiYeniUye.json');
      return (hasChannel(v.eskiUyeKanal) && v.eskiUyeMesaj) || (hasChannel(v.yeniUyeKanal) && v.yeniUyeMesaj);
    },
    anonim: async () => { const v = await config('Eğlence ve Etkileşim/anonimSohbet.json'); return hasChannel(v.channelId) && v.messageId; },
    ani: async () => hasChannel((await config('Eğlence ve Etkileşim/aniDefteriAyar.json')).kanalId),
    iltifat: async () => { const v = await config('Eğlence ve Etkileşim/iltifatVeri.json'); return v.status === true && hasChannel(v.channelId); },
    oyunlar: async () => {
      const v = await config('Eğlence ve Etkileşim/oyunKanallari.json');
      return ['sayi', 'bom', 'kelime', 'tuttu', 'sayiTahmini', 'hizliYaz', 'adamAsmaca'].some(key => hasChannel(v[key]));
    },
    'bot-log': async () => { const v = await config('Sistem/botLog.json'); return v.enabled !== false && hasChannel(v.kanalId) && v.webhookURL; },
    yedek: async () => (await registry.find(m => m.id === 'yedek').read(guild)).enabled,

    yardim: () => client.isReady(),
    genel: () => client.isReady(),
  };
  return Object.fromEntries(await Promise.all(registry.map(async module => {
    try {
      let active;
      if (pending[module.id]) {
        active = await pending[module.id]();
      } else {
        active = connectedActive(module.id, await module.read(guild));
      }
      return [module.id, Boolean(active)];
    } catch {

      return [module.id, null];
    }
  })));
}

module.exports = { readModuleStatuses };
