const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { AyarHatasi, kimlikDeseni } = require('../validation');
const { atomikYaz } = require('../stores/atomik');
const { isSafeGuildBackupId } = require('../../Utils/Core/security');
const { PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = function register({ client, ekle, b, n, t, c, s, a }) {
  const manager = () => require('../../Utils/Backup/yedekManager');
  const file = (guild, suffix) => path.join(manager().YEDEK_KLASORU, `${guild.id}_${suffix}.yaml`);
  const readYaml = target => fs.existsSync(target) ? yaml.load(fs.readFileSync(target, 'utf8')) || {} : {};
  const backups = guild => manager().tumYedekleriListele().filter(id => isSafeGuildBackupId(id, guild.id)).map(id => {
    const stat = fs.statSync(path.join(manager().YEDEK_KLASORU, `${id}.yaml`));
    return { id, date: stat.mtimeMs, size: stat.size };
  }).sort((x, y) => y.date - x.date);
  const snapshot = async guild => {
    await guild.channels.fetch(); await guild.roles.fetch();
    let timestamp = Date.now();
    while (fs.existsSync(path.join(manager().YEDEK_KLASORU, `yedek_${guild.id}_${timestamp}.yaml`))) timestamp++;
    const id = `yedek_${guild.id}_${timestamp}`;
    const data = {
      sunucu: { id: guild.id, isim: guild.name, icon: guild.iconURL?.() },
      roller: [...guild.roles.cache.values()].filter(role => !role.managed && role.id !== guild.id).map(role => ({ id: role.id, name: role.name, color: role.hexColor, permissions: role.permissions.bitfield.toString(), position: role.position, mentionable: role.mentionable, hoist: role.hoist })),
      kanallar: [...guild.channels.cache.values()].filter(channel => !channel.isThread?.()).map(channel => ({ id: channel.id, name: channel.name, type: channel.type, parent: channel.parentId, position: channel.rawPosition, topic: channel.topic, nsfw: channel.nsfw, bitrate: channel.bitrate, userLimit: channel.userLimit, rateLimitPerUser: channel.rateLimitPerUser, permissionOverwrites: [...(channel.permissionOverwrites?.cache?.values() || [])].map(o => ({ id: o.id, type: o.type, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() })) })),
    };
    manager().yedekKaydet(id, data);
    return id;
  };
  const backupField = () => t('backupId', 'Sunucu yedeği', 100, { minLength: 1, dynamicOptions: 'backups' });
  const loadBackup = (guild, id) => {
    if (!isSafeGuildBackupId(id, guild.id) || !backups(guild).some(v => v.id === id)) throw new AyarHatasi('Bu sunucuya ait listelenen bir yedek seçin.');
    const data = manager().yedekOku(id);
    if (data?.sunucu?.id !== guild.id || !Array.isArray(data.roller) || !Array.isArray(data.kanallar)) throw new AyarHatasi('Yedek içeriği geçersiz veya başka sunucuya ait.');
    return data;
  };
  const read = guild => ({ enabled: fs.existsSync(file(guild, 'aktif')), ...manager().yedekPlaniniOku(guild.id), logChannelId: readYaml(file(guild, 'log')).kanalId || null });
  ekle('yedek', 'Yedek arşivi ve işlemler', 'Yedek', 'Sunucu yedeklerini planlayın, oluşturun ve geri yükleyin.', 'Utils/Backup/yedekManager.js', [b('enabled', 'Günlük sunucu yedeği etkin'), n('hour', 'Saat · İstanbul', 0, 23, 21), n('minute', 'Dakika', 0, 59, 0), c('logChannelId', 'Yedek rapor kanalı')], read, (guild, patch) => {
    const next = { ...read(guild), ...patch };
    manager().yedekPlaniniKaydet(guild.id, next);
    if (patch.enabled === true) atomikYaz(file(guild, 'aktif'), { aktif: true, updatedAt: Date.now() });
    if (patch.enabled === false && fs.existsSync(file(guild, 'aktif'))) fs.unlinkSync(file(guild, 'aktif'));
    if (Object.hasOwn(patch, 'logChannelId')) {
      if (patch.logChannelId) atomikYaz(file(guild, 'log'), { ...readYaml(file(guild, 'log')), kanalId: patch.logChannelId });
      else if (fs.existsSync(file(guild, 'log'))) fs.unlinkSync(file(guild, 'log'));
    }
  }, {
    note: 'Yapı yedekleri kanal ve rol düzenini içerir. Mesaj geçmişi ve üyelerin rol atamaları geri yüklenmez. Günlük bot dosyası ZIP planı ayrı modüldedir. Elle alınan yedekler de mevcut günlük arşiv temizleme kuralına tabidir.',
    details: guild => backups(guild).map(v => `${v.id} · ${new Date(v.date).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })} · ${Math.ceil(v.size / 1024)} KB`),
    options: guild => ({ backups: backups(guild).map(v => ({ value: v.id, label: `${new Date(v.date).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })} · ${v.id}` })) }),
    actions: [
      { id: 'create', label: 'Şimdi sunucu yedeği al', fields: [], run: async guild => ({ message: `Sunucu yapı yedeği oluşturuldu: ${await snapshot(guild)}` }) },
      { id: 'zip', label: 'Şimdi bot dosyalarını yedekle', description: 'Otomatik yedekleme planında seçili klasörün ZIP arşivini oluşturur. Bot genelindeki önceki günlük ZIP arşivleri mevcut saklama kuralına göre temizlenir.', fields: [], run: async () => {
        const target = await require('../../Utils/Backup/autoBackup').createZipBackup();
        return { message: `Bot dosyası yedeği oluşturuldu: ${path.basename(target)}` };
      } },
      { id: 'inspect', label: 'Yedek içeriğini göster', fields: [backupField()], run: async (guild, input) => {
        const data = loadBackup(guild, input.backupId);
        return { message: `${data.sunucu.isim}: ${data.roller.length} rol, ${data.kanallar.length} kanal.\nRoller: ${data.roller.map(r => r.name).join(', ')}\nKanallar: ${data.kanallar.map(c => c.name).join(', ')}` };
      } },
      { id: 'delete', label: 'Seçili yedeği sil', danger: true, confirm: 'Seçili sunucu yedeği kalıcı olarak silinecek.', fields: [backupField(), b('confirmed', 'Seçili yedeğin kalıcı silinmesini onaylıyorum')], run: async (guild, input) => {
        if (!input.confirmed) throw new AyarHatasi('Silme onayını işaretleyin.');
        loadBackup(guild, input.backupId); manager().yedekSil(input.backupId);
        return { message: 'Seçili yedek silindi.' };
      } },
      { id: 'restore', label: 'Seçili yedeği geri yükle', danger: true, description: 'Mevcut kanalları ve botun yönetebildiği rolleri siler, seçili yedekten yeniden oluşturur. Kanal mesajları geri alınamaz. Önce mevcut yapının güvenlik yedeği alınır. Onay için bu sunucunun adını yazın.', fields: [backupField(), t('confirmation', 'Sunucu adını yazarak onaylayın', 100, { minLength: 1 })], run: async (guild, input) => {
        if (input.confirmation !== guild.name) throw new AyarHatasi('Onay için sunucunun adını tam olarak yazın.');
        if (!guild.members.me?.permissions.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])) throw new AyarHatasi('Botta Kanalları Yönet ve Rolleri Yönet izinleri gerekli.');
        const data = loadBackup(guild, input.backupId);
        const types = [0, 2, 4, 5, 13, 15, 16];
        try {
          for (const role of data.roller) { if (!role.name || typeof role.name !== 'string') throw new Error(); BigInt(role.permissions || '0'); }
          for (const channel of data.kanallar) {
            if (!channel.name || !types.includes(channel.type)) throw new Error();
            for (const overwrite of channel.permissionOverwrites || []) { if (!kimlikDeseni.test(overwrite.id)) throw new Error(); BigInt(overwrite.allow); BigInt(overwrite.deny); }
          }
        } catch { throw new AyarHatasi('Yedek doğrulanamadı. Sunucuda değişiklik yapılmadı.'); }
        const safetyId = await snapshot(guild);
        try {
          for (const channel of [...guild.channels.cache.values()]) await channel.delete('Dashboard yedek geri yükleme');
          for (const role of [...guild.roles.cache.values()].filter(r => r.id !== guild.id && !r.managed && r.editable)) await role.delete('Dashboard yedek geri yükleme');
          const roles = new Map([[guild.id, guild.id]]); const categories = new Map();
          for (const role of [...data.roller].sort((a, b) => b.position - a.position)) {
            if (role.id && guild.roles.cache.has(role.id)) { roles.set(role.id, role.id); continue; }
            const created = await guild.roles.create({ name: role.name, color: role.color, permissions: BigInt(role.permissions || '0'), mentionable: !!role.mentionable, hoist: !!role.hoist, reason: 'Dashboard yedek geri yükleme' });
            if (role.id) roles.set(role.id, created.id);
          }
          const channels = [...data.kanallar].sort((a, b) => (a.type !== ChannelType.GuildCategory) - (b.type !== ChannelType.GuildCategory) || a.position - b.position);
          for (const channel of channels) {
            const overwrites = (channel.permissionOverwrites || []).filter(o => o.type === 1 || roles.has(o.id) || guild.roles.cache.has(o.id)).map(o => ({ ...o, id: roles.get(o.id) || o.id, allow: BigInt(o.allow), deny: BigInt(o.deny) }));
            const created = await guild.channels.create({ name: channel.name, type: channel.type, position: channel.position, parent: categories.get(channel.parent), topic: channel.topic || undefined, nsfw: channel.nsfw, bitrate: channel.bitrate, userLimit: channel.userLimit, rateLimitPerUser: channel.rateLimitPerUser, permissionOverwrites: overwrites, reason: 'Dashboard yedek geri yükleme' });
            if (channel.type === ChannelType.GuildCategory) categories.set(channel.id, created.id);
          }
        } catch { throw new AyarHatasi(`Geri yükleme kısmen uygulandı ve durduruldu. Discord izinlerini kontrol edin. İşlem öncesi güvenlik yedeği: ${safetyId}`, 502); }
        return { message: `Yapı geri yüklendi. İşlem öncesi güvenlik yedeği: ${safetyId}. Yeni kanal ve rol kimlikleri nedeniyle modüllerdeki seçimlerinizi güncelleyin.` };
      } },
    ],
  });
  const general = require('../../Utils/Core/generalSettings');
  ekle('genel', 'Genel bot ayarları', 'Genel Ayarlar', 'Bot durumunu, sahip kimliğini ve olay filtrelerini panelden yönetin.', 'Settings/.env', [s('BotStatus', 'Bot durumu', [['online', 'Çevrimiçi'], ['idle', 'Boşta'], ['dnd', 'Rahatsız etmeyin'], ['invisible', 'Görünmez']]), t('sahipID', 'Bot sahibinin kullanıcı kimliği', 20, { minLength: 17 }), a('BlacklistServers.SunucuIDleri', 'Olayları yok sayılacak sunucu IDleri', t('guildId', 'Sunucu kimliği', 20, { minLength: 17 }), 500), b('BlacklistServers.BotOlaylariniYoksay', 'Bot hesaplarından gelen olayları yok say')], () => {
    const values = general.read();
    return { ...values, BlacklistServers: { ...values.BlacklistServers, SunucuIDleri: (values.BlacklistServers?.SunucuIDleri || []).filter(id => kimlikDeseni.test(id)) } };
  }, (guild, patch) => {
    if (patch.sahipID !== undefined && !kimlikDeseni.test(patch.sahipID)) throw new AyarHatasi('Geçerli bir sahip kullanıcı kimliği girin.');
    if (patch.BlacklistServers?.SunucuIDleri?.some(id => !kimlikDeseni.test(id))) throw new AyarHatasi('Geçerli sunucu kimlikleri girin.');
    return general.update(patch, client);
  }, { scope: 'global', note: 'Bot durumu ve olay filtreleri anında uygulanır. Sahip kimliği, yalnızca bot sahibine açık işlemlerin yetkilisini değiştirir. Bu ayarlar botun tüm sunucularında geçerlidir.' });
};