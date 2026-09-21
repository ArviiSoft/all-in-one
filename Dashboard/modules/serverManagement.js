'use strict';

const path = require('path');
const { PermissionFlagsBits: P, MessageFlags } = require('discord.js');
const { createJsonStore } = require('../../Utils/Core/safeJsonStore');
const { AyarHatasi } = require('../validation');

const storeFor = file => createJsonStore(path.join(__dirname, '../../Database', file));
const clone = value => JSON.parse(JSON.stringify(value));
const absent = error => [10003, 10008].includes(error?.code);
function unique(values, label) {
  if (new Set(values).size !== values.length) throw new AyarHatasi(`${label} birden fazla kez eklenemez.`);
}
function url(value, label) {
  if (!value) return '';
  try { const parsed = new URL(value); if (['http:', 'https:'].includes(parsed.protocol)) return parsed.href; } catch {}
  throw new AyarHatasi(`${label} geçerli bir HTTP veya HTTPS bağlantısı olmalı.`);
}
async function channelFor(guild, id, permissions = [P.ViewChannel, P.SendMessages]) {
  const channel = guild.channels.cache.get(id) || await guild.channels.fetch(id);
  if (!channel || channel.guildId !== guild.id) throw new AyarHatasi('Kanal bu sunucuda bulunamadı.');
  if (permissions.length && !channel.permissionsFor(guild.members.me)?.has(permissions)) {
    throw new AyarHatasi(`${channel.name || id}: botun gerekli kanal izinleri eksik.`);
  }
  return channel;
}
async function storedMessage(guild, channelId, messageId) {
  if (!channelId || !messageId) return null;
  try {
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId);
    if (!channel) return null;
    if (channel.guildId !== guild.id) throw new AyarHatasi('Kanal bu sunucuda bulunamadı.');
    return await channel.messages.fetch(messageId);
  }
  catch (error) { if (absent(error)) return null; throw error; }
}
async function removeMessage(guild, channelId, messageId) {
  const message = await storedMessage(guild, channelId, messageId);
  if (message) await message.delete();
}

module.exports = function registerServerManagement(ctx) {
  const { client, ekle, b, t, c, r, e, s, a, l } = ctx;
  const roleReference = (key, label, nullable = true) => ({ ...r(key, label, nullable), assignable: false });

  require('./serverCommands')(ctx);

  const sticky = require('../../Utils/Engagement/stickyStore');
  const stickyCommand = require('../../Commands/Sunucu/sticky-message');
  const stickyView = record => ({
    messageType: record.embed ? 'embed' : 'text', content: record.content || '',
    title: record.embed?.title || '', description: record.embed?.description || '',
    footer: record.embed?.footer || '', image: record.embed?.image || '', thumbnail: record.embed?.thumbnail || '',
  });
  ekle('sticky', 'Yapışkan mesajlar', 'Sunucu Yönetimi', 'Kanal başına metin veya embed hazırlayın; sabit mesajı hemen yayımlayın ve güncelleyin.', 'Utils/Engagement/stickyStore.js', [
    l('channels', 'Yapışkan mesajlar', [c('channelId', 'Kanal', false), s('messageType', 'Mesaj biçimi', [['text', 'Metin'], ['embed', 'Embed']]),
      t('content', 'Mesaj', 2000, { multiline: true }), t('title', 'Embed başlığı', 256), t('description', 'Embed açıklaması', 4000, { multiline: true }),
      t('footer', 'Embed alt bilgisi', 2048), t('image', 'Görsel bağlantısı', 1000), t('thumbnail', 'Küçük görsel bağlantısı', 1000)], 500),
  ], g => ({ channels: sticky.getGuildStickyEntries(g).map(({ channelId, record }) => ({ channelId, ...stickyView(record) })) }), async (g, patch) => {
    if (!patch.channels) return;
    unique(patch.channels.map(v => v.channelId), 'Aynı kanal');
    const prepared = [];
    for (const row of patch.channels) {
      const draft = { mode: 'dashboard', messageType: row.messageType, content: row.content.trim(), embed: {
        title: row.title, description: row.description, footer: row.footer, image: url(row.image, 'Görsel'), thumbnail: url(row.thumbnail, 'Küçük görsel'),
      } };
      if (draft.messageType === 'text' && !draft.content) throw new AyarHatasi('Sabit mesaj boş bırakılamaz.');
      if (draft.messageType === 'embed' && !Object.values(draft.embed).some(Boolean)) throw new AyarHatasi('Embed içeriği boş bırakılamaz.');
      if (row.title.length + row.description.length + row.footer.length > 6000) throw new AyarHatasi('Embed metni toplam 6.000 karakteri aşamaz.');
      const channel = await channelFor(g, row.channelId, [P.ViewChannel, P.SendMessages, P.ReadMessageHistory]);
      stickyCommand.validateTargetChannel(channel, g, draft.messageType);
      prepared.push({ draft, channel });
    }
    for (const { draft, channel } of prepared) {
      await stickyCommand.saveStickyFromDashboard(channel, g, draft, client.user.id);
    }
    for (const entry of sticky.getGuildStickyEntries(g)) {
      if (!patch.channels.some(v => v.channelId === entry.channelId)) await stickyCommand.removeStickyChannel(g, entry.channelId, { strict: true });
    }
  }, { command: 'sticky-message', pattern: 'Discord API', note: 'Kaydetmek yeni mesajı gönderir, mevcut mesajı düzenler. Listeden kaldırılan yapışkan mesajlar silinir.', actions: [
    { id: 'refresh', label: 'Mesajı yeniden gönder', description: 'Seçili kanaldaki yapışkan mesajı en alta taşır.', fields: [c('channelId', 'Kanal', false)], run: async (g, input) => {
      const record = sticky.loadStickyData()[input.channelId];
      if (!sticky.recordBelongsToGuild(input.channelId, record, g)) throw new AyarHatasi('Bu kanalda sabit mesaj ayarlı değil.');
      const channel = await channelFor(g, input.channelId, [P.ViewChannel, P.SendMessages, P.ReadMessageHistory]);
      stickyCommand.validateTargetChannel(channel, g, record.embed ? 'embed' : 'text');
      await stickyCommand.refreshStickyMessage(channel);
      return { message: 'Sabit mesaj yeniden gönderildi.' };
    } },
  ] });

  const redirect = storeFor('Sunucu Yönetimi/kanalaYonlendirme.json');
  const embedOptions = [['title', 'Başlık'], ['description', 'Açıklama'], ['footer', 'Alt bilgi'], ['image', 'Görsel'], ['thumbnail', 'Küçük görsel'], ['fields', 'Alanlar'], ['url', 'Bağlantı'], ['color', 'Renk']];
  ekle('yonlendirme', 'Kanal yönlendirme', 'Sunucu Yönetimi', 'Kaynak ve hedef kanalları, etiket rolünü ve aktarılacak embed alanlarını seçin.', 'Database/Sunucu Yönetimi/kanalaYonlendirme.json', [
    l('channels', 'Yönlendirmeler', [c('kaynakId', 'Kaynak kanal', false), c('hedefId', 'Hedef kanal', false), roleReference('rolId', 'Etiket rolü'), ...embedOptions.map(([key, label]) => b(key, `Embed · ${label}`, true))], 500),
  ], g => ({ channels: (redirect.get(g.id)?.yönlendirmeler || []).map(v => ({ kaynakId: v.kaynakId, hedefId: v.hedefId, rolId: v.rolId || null, ...Object.fromEntries(embedOptions.map(([key]) => [key, v.embedAyar?.[key] === true])) })) }), async (g, patch) => {
    if (!patch.channels) return;
    unique(patch.channels.map(v => v.kaynakId), 'Aynı kaynak kanal');
    for (const row of patch.channels) {
      if (row.kaynakId === row.hedefId) throw new AyarHatasi('Kaynak ve hedef kanal farklı olmalı.');
      await channelFor(g, row.kaynakId, [P.ViewChannel]);
      await channelFor(g, row.hedefId, [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles]);
    }
    redirect.update(data => {
      const current = data[g.id] ||= {};
      current.yönlendirmeler = patch.channels.map(row => ({
        ...(current.yönlendirmeler || []).find(v => v.kaynakId === row.kaynakId), kaynakId: row.kaynakId, hedefId: row.hedefId, rolId: row.rolId,
        embedAyar: Object.fromEntries(embedOptions.map(([key]) => [key, row[key]])),
      }));
    });
  }, { command: 'kanal-yönlendirme', pattern: 'B' });

  const clan = storeFor('Sunucu Yönetimi/clanTag.json');
  const normalizeTag = value => value.normalize('NFC').replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).trim().toUpperCase();
  ekle('clan-tag', 'Clan tag → rol', 'Sunucu Yönetimi', 'Clan tag eşleşmelerini ve iki ayrı kayıt kanalını yönetin.', 'Database/Sunucu Yönetimi/clanTag.json', [
    l('tags', 'Etiket ve rol eşleşmeleri', [t('tag', 'Clan tag', 32, { minLength: 1 }), r('roleId', 'Verilecek rol', false)], 500), c('logChannel', 'Rol değişikliği kayıt kanalı'), c('generalLogChannel', 'Genel etiket kayıt kanalı'),
  ], g => { const v = clan.get(g.id) || {}; return { ...v, tags: Object.entries(v.tags || {}).map(([tag, roleId]) => ({ tag, roleId })) }; }, (g, patch) => {
    const next = { ...patch };
    if (patch.tags) {
      if (patch.tags.length && !g.members.me.permissions.has(P.ManageRoles)) throw new AyarHatasi('Botun Rolleri Yönet izni gerekli.');
      const entries = patch.tags.map(v => [normalizeTag(v.tag), v.roleId]);
      if (entries.some(([tag]) => !tag || ['__PROTO__', 'CONSTRUCTOR', 'PROTOTYPE'].includes(tag))) throw new AyarHatasi('Geçerli bir Clan tag yazın.');
      unique(entries.map(([tag]) => tag), 'Aynı etiket');
      next.tags = Object.fromEntries(entries);
    }
    clan.update(data => { Object.assign(data[g.id] ||= {}, next); });
  }, { command: 'clan-tag-rol', pattern: 'B', actions: [{ id: 'sync', label: 'Üye rollerini eşitle', description: 'Mevcut üyelerin görünen klan etiketlerine göre kayıtlı rolleri uygular.', fields: [], run: async g => {
    const tags = clan.get(g.id)?.tags || {};
    if (Object.keys(tags).length && !g.members.me.permissions.has(P.ManageRoles)) throw new AyarHatasi('Botun Rolleri Yönet izni gerekli.');
    for (const id of new Set(Object.values(tags))) {
      const role = g.roles.cache.get(id);
      if (!role || role.managed || role.id === g.id || role.position >= g.members.me.roles.highest.position) throw new AyarHatasi('Clan rollerinden biri silinmiş veya bot tarafından yönetilemiyor. Önce eşleşmeleri güncelleyin.');
    }
    const members = await g.members.fetch();
    let changed = 0;
    for (const member of members.values()) {
      if (member.user.bot) continue;
      const primary = member.user.primaryGuild;
      const desired = primary?.identityEnabled !== false && primary?.tag ? tags[normalizeTag(primary.tag)] : null;
      for (const id of new Set(Object.values(tags))) {
        if (id !== desired && member.roles.cache.has(id)) { await member.roles.remove(id, 'Panel: Clan tag eşitleme'); changed++; }
      }
      if (desired && !member.roles.cache.has(desired)) { await member.roles.add(desired, 'Panel: Clan tag eşitleme'); changed++; }
    }
    return { message: `${changed} rol değişikliği uygulandı.` };
  } }] });

  const reaction = storeFor('Sunucu Yönetimi/emojiRol.json');
  const emojiKey = value => value.match(/^<a?:[^:>]+:(\d+)>$/u)?.[1] || value;
  const emojiDisplay = (g, key) => { const found = g.emojis?.cache?.get(key) || client.application?.emojis?.cache?.get(key); return found ? `<${found.animated ? 'a' : ''}:${found.name}:${key}>` : key; };
  ekle('emoji-rol', 'Emoji rolleri', 'Sunucu Yönetimi', 'Mesajları seçin, emoji ve rol eşleşmelerini ekleyin. Tepkiler otomatik uygulanır.', 'Database/Sunucu Yönetimi/emojiRol.json', [
    c('logChannel', 'Rol kayıt kanalı'), l('messages', 'Rol mesajları', [c('channelId', 'Mesaj kanalı', false, [0, 5, 10, 11, 12]), t('messageId', 'Mesaj kimliği', 20, { minLength: 17, hint: 'Yeni mesajı aşağıdaki işlemden oluşturabilirsiniz.' }),
      l('pairs', 'Emoji ve rol eşleşmeleri', [e('emoji', 'Emoji'), r('roleId', 'Rol', false)], 10)], 100),
  ], g => { const v = reaction.get(g.id) || {}; return { logChannel: v.logChannel || null, messages: Object.entries(v.messages || {}).map(([messageId, row]) => ({ messageId, channelId: row.channelId, pairs: Object.entries(row.pairs || {}).map(([emoji, roleId]) => ({ emoji: emojiDisplay(g, emoji), roleId })) })) }; }, async (g, patch) => {
    const old = reaction.get(g.id) || {};
    let messages;
    if (patch.messages) {
      if (patch.messages.some(row => row.pairs.length) && !g.members.me.permissions.has(P.ManageRoles)) throw new AyarHatasi('Botun Rolleri Yönet izni gerekli.');
      unique(patch.messages.map(v => v.messageId), 'Aynı mesaj');
      messages = {};
      const resolved = [];
      for (const row of patch.messages) {
        if (!/^\d{17,20}$/.test(row.messageId)) throw new AyarHatasi('Geçerli bir mesaj kimliği yazın.');
        unique(row.pairs.map(v => emojiKey(v.emoji)), 'Aynı emoji');
        const channel = await channelFor(g, row.channelId, [P.ViewChannel, P.ReadMessageHistory, P.AddReactions]);
        const message = await channel.messages.fetch(row.messageId);
        messages[row.messageId] = { ...old.messages?.[row.messageId], channelId: row.channelId, pairs: Object.fromEntries(row.pairs.map(v => [emojiKey(v.emoji), v.roleId])) };
        resolved.push({ row, message });
      }
      for (const { row, message } of resolved) for (const pair of row.pairs) await message.react(pair.emoji);
      for (const [id, previous] of Object.entries(old.messages || {})) {
        const removed = Object.keys(previous.pairs || {}).filter(key => !messages[id]?.pairs?.[key] || messages[id]?.channelId !== previous.channelId);
        if (!removed.length) continue;
        const message = await storedMessage(g, previous.channelId, id);
        for (const key of removed) { const found = message?.reactions.cache.find(v => (v.emoji.id || v.emoji.name) === key); if (found?.me) await found.users.remove(client.user.id); }
      }
    }
    reaction.update(data => {
      const current = data[g.id] ||= {};
      if (patch.logChannel !== undefined) current.logChannel = patch.logChannel;
      if (messages) {
        current.messages = messages;
        const activeId = current.activeMessage?.messageId;
        const nextId = messages[activeId] ? activeId : Object.keys(messages)[0];
        current.activeMessage = nextId ? { messageId: nextId, channelId: messages[nextId].channelId } : null;
      }
    });
  }, { command: 'emoji-rol', pattern: 'Discord API', actions: [{ id: 'publish', label: 'Yeni rol mesajı oluştur', description: 'Mesajı yayımlar ve eşleşme eklemek üzere listeye kaydeder.', fields: [c('channelId', 'Kanal', false), t('content', 'Mesaj', 2000, { minLength: 1, multiline: true })], run: async (g, input) => {
    const message = await (await channelFor(g, input.channelId)).send({ content: input.content, allowedMentions: { parse: [] } });
    reaction.update(data => { const current = data[g.id] ||= {}; (current.messages ||= {})[message.id] = { channelId: input.channelId, pairs: {} }; current.activeMessage = { messageId: message.id, channelId: input.channelId }; });
    return { message: 'Rol mesajı oluşturuldu. Listedeki mesaja emoji ve rol eşleşmeleri ekleyebilirsiniz.', messageId: message.id };
  } }] });

  const support = storeFor('Sunucu Yönetimi/destek.json');
  const supportFields = [b('enabled', 'Yeni destek talepleri etkin', true), c('supportChannel', 'Destek paneli kanalı'), roleReference('supportRole', 'Destek ekibi rolü'), c('logChannel', 'Transkript kayıt kanalı'), c('categoryId', 'Destek kategorisi', true, [4])];
  const supportReady = config => config.supportChannel && config.supportRole && config.logChannel && config.categoryId;
  const publishSupport = async g => {
    const config = support.get(g.id) || {};
    if (!supportReady(config)) throw new AyarHatasi('Önce panel kanalı, ekip rolü, transkript kanalı ve kategoriyi kaydedin.');
    const channel = await channelFor(g, config.supportChannel, [P.ViewChannel, P.SendMessages, P.ReadMessageHistory]);
    const payload = await require('../../Utils/Tickets/ticketTranscript').createSupportPanelPayload(g, client);
    const existing = await storedMessage(g, config.panelChannelId, config.panelMessageId);
    const message = existing && config.panelChannelId === channel.id ? await existing.edit(payload) : await channel.send(payload);
    support.update(data => { Object.assign(data[g.id] ||= {}, { panelChannelId: channel.id, panelMessageId: message.id }); });
    if (existing && existing.id !== message.id) await existing.delete();
    return { message: 'Destek paneli yayımlandı.', messageId: message.id };
  };
  ekle('destek', 'Destek sistemi', 'Sunucu Yönetimi', 'Destek panelini, ekip rolünü, bilet kategorisini ve transkript kanalını yönetin.', 'Database/Sunucu Yönetimi/destek.json', supportFields,
    g => { const v = support.get(g.id) || {}; return { ...v, enabled: v.enabled !== false && Boolean(supportReady(v)) }; }, async (g, patch) => {
      const current = support.get(g.id) || {};
      const next = { ...current, ...patch };
      if (next.enabled && !supportReady(next)) throw new AyarHatasi('Etkinleştirmek için panel kanalı, destek rolü, transkript kanalı ve kategori seçin.');
      if (next.supportChannel) await channelFor(g, next.supportChannel);
      if (next.logChannel) await channelFor(g, next.logChannel, [P.ViewChannel, P.SendMessages, P.AttachFiles]);
      if (next.categoryId) await channelFor(g, next.categoryId, [P.ViewChannel, P.ManageChannels]);
      support.update(data => { Object.assign(data[g.id] ||= {}, patch); });
    }, { command: 'destek-sistemi', pattern: 'Discord API', note: 'Ayarlar mevcut açık talepleri ve transkript verilerini korur. Paneli yayımlamak için aşağıdaki işlemi kullanın.', actions: [{ id: 'publish', label: 'Destek panelini yayımla / güncelle', description: 'Kaydedilen kanala destek oluşturma düğmesini gönderir.', fields: [], run: publishSupport }] });

  const counters = storeFor('Ses Sistemleri/sesPanelleri.json');
  const counterCommand = require('../../Commands/Kurulumlu/ses-panelleri');
  const clock = require('../../Utils/Voice/sesPanelClock');
  const counterDefinitions = [...counterCommand.panelDefinitions, { value: 'takvim', dataKey: 'takvimKanalId', label: 'Takvim', channelName: () => counterCommand.getDateChannelName() }, { value: 'saat', dataKey: 'saatKanalId', label: 'Saat', channelName: () => clock.getClockChannelName() }];
  const refreshCounters = async (g, config) => {
    unique(counterDefinitions.map(v => config[v.dataKey]).filter(Boolean), 'Aynı sayaç kanalı');
    const prepared = [];
    for (const item of counterDefinitions) if (config[item.dataKey]) prepared.push({ item, channel: await channelFor(g, config[item.dataKey], [P.ManageChannels]) });
    for (const { item, channel } of prepared) {
      const name = item.channelName(g, config);
      if (channel.name !== name) await channel.setName(name, 'Panel: sunucu sayacı');
    }
    return config;
  };
  ekle('ses-panelleri', 'Sunucu sayaçları', 'Sunucu Yönetimi', 'Sayaç, takvim ve saat kanallarını seçin veya panelden oluşturun.', 'Database/Ses Sistemleri/sesPanelleri.json', [
    ...counterDefinitions.map(v => c(v.dataKey, `${v.label} kanalı`, true, [2, 13])),
  ], g => counters.get(g.id) || {}, async (g, patch) => {
    const next = await refreshCounters(g, { ...(counters.get(g.id) || {}), ...patch });
    counters.update(data => { const current = data[g.id] ||= {}; Object.assign(current, patch); if (Number.isFinite(next.rekorSayi)) current.rekorSayi = Math.max(current.rekorSayi || 0, next.rekorSayi); });
  }, { command: 'ses-panelleri', pattern: 'Discord API', note: 'Kaydetmek kanal adlarını günceller. Seçimi kaldırmak sayacı durdurur; kanal korunur.', actions: [
    { id: 'create', label: 'Sayaç kanalları oluştur', description: 'Seçilen sayaçlardan henüz ayarlanmayanlar için ses kanalları açar.', fields: [a('types', 'Oluşturulacak sayaçlar', s('type', 'Sayaç', counterDefinitions.map(v => [v.value, v.label])), 7, 1), c('categoryId', 'Kategori', true, [4])], run: async (g, input) => {
      if (!g.members.me.permissions.has(P.ManageChannels)) throw new AyarHatasi('Botun Kanalları Yönet izni gerekli.');
      if (input.categoryId) await channelFor(g, input.categoryId, [P.ViewChannel, P.ManageChannels]);
      let created = 0;
      for (const item of counterDefinitions.filter(v => input.types.includes(v.value))) {
        const current = counters.get(g.id) || {};
        if (current[item.dataKey] && g.channels.cache.has(current[item.dataKey])) continue;
        const channel = await g.channels.create({ name: item.channelName(g, current), type: 2, parent: input.categoryId || undefined, permissionOverwrites: [{ id: g.id, deny: [P.Connect] }], reason: 'Panel: sunucu sayacı' });
        counters.update(data => { const v = data[g.id] ||= {}; v[item.dataKey] = channel.id; if (Number.isFinite(current.rekorSayi)) v.rekorSayi = Math.max(v.rekorSayi || 0, current.rekorSayi); });
        created++;
      }
      return { message: `${created} sayaç kanalı oluşturuldu.` };
    } },
    { id: 'refresh', label: 'Sayaçları güncelle', description: 'Seçili kanallardaki sayıları, saati ve tarihi şimdi yeniler.', fields: [], run: async g => {
      const next = await refreshCounters(g, clone(counters.get(g.id) || {}));
      counters.update(data => { if (Number.isFinite(next.rekorSayi)) { const v = data[g.id] ||= {}; v.rekorSayi = Math.max(v.rekorSayi || 0, next.rekorSayi); } });
      return { message: 'Sayaç kanalları güncellendi.' };
    } },
  ] });

  const honey = storeFor('Güvenlik ve Moderasyon/honeypot.json');
  const { buildHoneypotPanel } = require('../../Utils/Moderation/honeypot');
  ekle('honeypot', 'Honeypot', 'Güvenlik ve Moderasyon', 'Tuzak kanallarını ve kayıt kanalını belirleyin; uyarı panelleri otomatik yayımlanır.', 'Database/Güvenlik ve Moderasyon/honeypot.json', [
    a('channels', 'Tuzak kanalları', c('channelId', 'Kanal', false), 100), c('logChannelId', 'Kayıt kanalı'),
  ], g => { const v = honey.get(g.id) || {}; return { channels: Object.keys(v.channels || {}), logChannelId: v.logChannelId || null }; }, async (g, patch) => {
    const old = honey.get(g.id) || {};
    if (patch.logChannelId) await channelFor(g, patch.logChannelId);
    if (patch.channels) {
      if (patch.channels.length && !g.members.me.permissions.has(P.KickMembers)) throw new AyarHatasi('Honeypot için botun Üyeleri At izni gerekli.');
      const prepared = [];
      for (const id of patch.channels) prepared.push(await channelFor(g, id, [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageMessages, P.ManageThreads]));
      for (const channel of prepared) {
        const current = honey.get(g.id)?.channels?.[channel.id] || {};
        const payload = { components: [buildHoneypotPanel(g, current.kickCount || 0, client)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
        const existing = await storedMessage(g, channel.id, current.messageId);
        const message = existing ? await existing.edit(payload) : await channel.send(payload);
        honey.update(data => { const row = ((data[g.id] ||= {}).channels ||= {})[channel.id] ||= { kickCount: 0, createdBy: client.user.id, createdAt: Date.now() }; Object.assign(row, { messageId: message.id, updatedAt: Date.now() }); });
      }
      for (const [id, row] of Object.entries(old.channels || {})) if (!patch.channels.includes(id)) {
        await removeMessage(g, id, row.messageId);
        honey.update(data => { if (data[g.id]?.channels) delete data[g.id].channels[id]; });
      }
    }
    if (patch.logChannelId !== undefined) honey.update(data => { (data[g.id] ||= {}).logChannelId = patch.logChannelId; });
  }, { command: 'honeypot', pattern: 'Discord API', note: 'Kaydettiğiniz tuzak kanalına mesaj gönderen üyeler bot tarafından sunucudan atılır. Kanal kaldırıldığında koruma ve uyarı paneli kaldırılır.' });

  const audit = storeFor('Güvenlik ve Moderasyon/auditLog.json');
  const auditRuntime = require('../../Events/Guild/auditLog');
  ekle('audit', 'Denetim kayıtları', 'Güvenlik ve Moderasyon', 'Denetim olaylarını seçtiğiniz kanala kaydedin ve olay türlerini filtreleyin.', 'Database/Güvenlik ve Moderasyon/auditLog.json', [
    b('enabled', 'Denetim kayıtları etkin'), c('channelId', 'Kayıt kanalı'), a('eventTypes', 'Kaydedilecek olay türleri', s('event', 'Olay', Object.entries(auditRuntime.ACTION_LABELS)), 100),
  ], g => audit.get(g.id) || {}, async (g, patch) => {
    const next = { ...(audit.get(g.id) || {}), ...patch };
    if (next.enabled && !next.channelId) throw new AyarHatasi('Önce kayıt kanalı seçin.');
    if (next.channelId) await channelFor(g, next.channelId);
    if (next.enabled && !g.members.me.permissions.has(P.ViewAuditLog)) throw new AyarHatasi('Botun Denetim Kaydını Görüntüle izni gerekli.');
    audit.update(data => { Object.assign(data[g.id] ||= {}, patch, { updatedAt: Date.now() }); });
  }, { command: 'audit-log', pattern: 'B', note: 'Olay türü seçilmezse tüm denetim olayları kaydedilir.', actions: [{ id: 'test', label: 'Test kaydı gönder', description: 'Kayıt kanalına bağlantıyı doğrulayan bir test mesajı gönderir.', fields: [], run: async g => {
    const id = audit.get(g.id)?.channelId;
    if (!id) throw new AyarHatasi('Önce kayıt kanalı seçin.');
    await (await channelFor(g, id)).send({ content: '✅ Denetim kaydı bağlantısı panel üzerinden doğrulandı.', allowedMentions: { parse: [] } });
    return { message: 'Test kaydı gönderildi.' };
  } }] });
};