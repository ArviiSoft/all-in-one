'use strict';

const { PermissionFlagsBits: P } = require('discord.js');
const { AyarHatasi } = require('../validation');
const { createJsonStore } = require('../../Utils/Core/safeJsonStore');
const activeDB = require('../../Utils/Engagement/aktifDB');
const activeCommand = require('../../Commands/Sunucu/aktif-üye');
const { GUNLER, ayarlaZamanlama, parseSaat, saatMetni } = require('../../Utils/Engagement/aktifUyeZamanlama');
const horoscope = require('../../Utils/Engagement/burcSistemi');

function activeData(guild, installed = false) {
  const data = activeDB.loadData();
  if (data.guild && data.guild !== guild.id) throw new AyarHatasi('Aktif üye sistemi başka bir sunucuda kurulu. Önce o sunucudan sistemi kapatın.');
  if (installed && !(data.guild === guild.id && data.kanal && data.rol && data.mesaj && data.thread)) throw new AyarHatasi('Önce yayın kanalı ve ödül rolünü kaydederek aktif üye sistemini kurun.');
  return data;
}

async function textChannel(guild, id, permissions) {
  const channel = guild.channels.cache.get(id) || await guild.channels.fetch(id);
  if (!channel || channel.guildId !== guild.id || ![0, 5].includes(channel.type)) throw new AyarHatasi('Bu sunucudan bir yazı veya duyuru kanalı seçin.');
  if (!channel.permissionsFor(guild.members.me)?.has(permissions)) throw new AyarHatasi('Botun yayın kanalındaki gerekli izinleri eksik.');
  return channel;
}

function awardRole(guild, id) {
  const role = guild.roles.cache.get(id);
  if (!role || role.id === guild.id || role.managed || role.position >= guild.members.me.roles.highest.position) throw new AyarHatasi('Ödül rolü bulunamadı veya bot tarafından yönetilemiyor.');
  if (!guild.members.me.permissions.has(P.ManageRoles)) throw new AyarHatasi('Botun Rolleri Yönet izni gerekli.');
  return role;
}

async function clearAward(guild, id, exceptId) {
  if (!id || !guild.roles.cache.has(id)) return;
  const role = awardRole(guild, id);
  const members = await guild.members.fetch();
  for (const member of members.values()) {
    if (member.id !== exceptId && member.roles.cache.has(id)) await member.roles.remove(role, 'Dashboard: aktif üye ödül rolü güncellendi.');
  }
}

async function refreshActive(guild, data) {
  const channel = await textChannel(guild, data.kanal, [P.ViewChannel, P.SendMessages, P.ReadMessageHistory]);
  let message;
  try { message = await channel.messages.fetch(data.mesaj); }
  catch (error) { if (error.code !== 10008) throw error; }
  if (!message) throw new AyarHatasi('Sıralama mesajı bulunamadı. Mesajı yeniden oluştur işlemini kullanın.');
  await activeCommand.editActiveMessage(message, data, guild);
}

module.exports = function registerServerCommands(ctx) {
  const { client, ekle, t, c, r, s, a, l } = ctx;
  ekle('aktif-uye', 'Aktif üye', 'Sunucu Yönetimi', 'Haftalık aktif üye sistemini kurun, seçim zamanını ayarlayın ve ödül rolünü yönetin.', 'Database/Üye Verileri/aktifUye.json', [
    c('channelId', 'Yayın kanalı'), r('roleId', 'Ödül rolü'),
    s('day', 'Haftalık seçim günü', GUNLER.map((day, index) => [String(index), day])),
    t('time', 'Haftalık seçim saati', 5, { default: '00:00', minLength: 4, hint: 'SS:DD · Europe/Istanbul (Türkiye saati)' }),
  ], g => {
    const stored = activeDB.loadData();
    const data = stored.guild === g.id ? stored : activeDB.createDefaultData();
    return { channelId: data.kanal, roleId: data.rol, day: String(data.zamanlama.gun), time: saatMetni(data.zamanlama) };
  }, async (g, patch) => {
    const data = activeData(g);
    const time = patch.time === undefined ? {} : parseSaat(patch.time);
    if (!time) throw new AyarHatasi('Seçim saati 00:00–23:59 arasında SS:DD biçiminde olmalı.');
    const next = { ...data, guild: g.id, kanal: patch.channelId === undefined ? data.kanal : patch.channelId, rol: patch.roleId === undefined ? data.rol : patch.roleId,
      zamanlama: ayarlaZamanlama(data.zamanlama, { ...time, ...(patch.day === undefined ? {} : { gun: Number(patch.day) }), zamanDilimi: 'Europe/Istanbul' }) };
    if (!next.kanal || !next.rol) throw new AyarHatasi('Yayın kanalı ve ödül rolünü birlikte seçin. Kapatmak için Sistemi kapat işlemini kullanın.');
    await textChannel(g, next.kanal, [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.CreatePublicThreads, P.SendMessagesInThreads]);
    const role = awardRole(g, next.rol);
    const changedRole = data.rol && data.rol !== next.rol;
    if (changedRole && g.roles.cache.has(data.rol)) awardRole(g, data.rol);
    let winner;
    if (changedRole && data.aktifUye) {
      try { winner = await g.members.fetch(data.aktifUye); }
      catch (error) { if (error.code !== 10007) throw error; }
    }
    await activeCommand.installSystem({ guild: g, data: { ...data, zamanlama: next.zamanlama }, channelId: next.kanal, roleId: next.rol, preserveLatestData: true });
    if (changedRole) {
      try {
        await clearAward(g, data.rol);
        if (winner) await winner.roles.add(role, 'Dashboard: aktif üye ödül rolü değiştirildi.');
      } catch {
        const latest = activeData(g, true); latest.rol = data.rol; activeDB.saveData(latest);
        throw new AyarHatasi('Yayın ve zaman ayarları kaydedildi ancak ödül rolü devredilemedi. Önceki rol ayarı korundu; bot izinlerini kontrol edip yeniden kaydedin.');
      }
    }
  }, { command: 'aktif-üye', pattern: 'Discord API', note: 'Kaydetmek sıralama mesajını ve geçmiş thread’ini oluşturur veya günceller. Haftalık seçim Türkiye saatine göre yapılır. Mevcut sistem aynı anda tek sunucuda kurulabilir.',
    details: g => {
      const data = activeDB.loadData();
      if (data.guild && data.guild !== g.id) return ['Aktif üye sistemi başka bir sunucuda kurulu; bu sunucudan değiştirilemez.'];
      if (!data.mesaj) return ['Aktif üye sistemi henüz kurulmadı.'];
      return [`Aktif üye: ${data.aktifUye || 'Henüz seçilmedi'}`, `Sıralama mesajı: https://discord.com/channels/${g.id}/${data.kanal}/${data.mesaj}`, `Geçmiş thread’i: ${data.thread}`];
    }, actions: [
      { id: 'refresh', label: 'Sıralamayı yenile', fields: [], run: async g => { await refreshActive(g, activeData(g, true)); return { message: 'Sıralama mesajı güncellendi.' }; } },
      { id: 'recreate', label: 'Mesajı yeniden oluştur', description: 'Yeni sıralama mesajı ve geçmiş thread’i oluşturur; puanları korur.', fields: [], run: async g => {
        const data = activeData(g, true); awardRole(g, data.rol);
        await textChannel(g, data.kanal, [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.CreatePublicThreads, P.SendMessagesInThreads]);
        await activeCommand.installSystem({ guild: g, data, channelId: data.kanal, roleId: data.rol, forceNew: true, preserveLatestData: true });
        return { message: 'Sıralama mesajı ve geçmiş thread’i yeniden oluşturuldu.' };
      } },
      { id: 'select', label: 'Aktif üyeyi seç', description: 'Ödül rolünü seçtiğiniz üyeye devreder.', fields: [{ key: 'userId', label: 'Üye kimliği', type: 'user', maxLength: 20 }], run: async (g, input) => {
        const data = activeData(g, true); const role = awardRole(g, data.rol);
        let member;
        try { member = await g.members.fetch(input.userId); }
        catch (error) { if (error.code !== 10007) throw error; }
        if (!member || member.user.bot) throw new AyarHatasi('Bu sunucudan bot olmayan bir üye seçin.');
        await clearAward(g, role.id, member.id);
        await member.roles.add(role, 'Dashboard: aktif üye yönetici tarafından seçildi.');
        const latest = activeData(g, true); latest.aktifUye = member.id; activeDB.saveData(latest);
        try { await refreshActive(g, latest); }
        catch { return { message: 'Aktif üye seçildi ve rol verildi. Sıralama mesajı güncellenemedi; mesajı yeniden oluşturun.' }; }
        return { message: 'Aktif üye seçildi, ödül rolü ve sıralama güncellendi.' };
      } },
      { id: 'reset', label: 'Verileri sıfırla', description: 'Puanları, kazananları ve rekorları temizler; kanal, rol ve zaman ayarlarını korur.', danger: true, confirm: 'Tüm aktif üye puanları, kazananlar ve rekorlar silinsin mi? Kanal, rol ve zaman ayarları korunur.', fields: [], run: async g => {
        const data = activeData(g, true); await clearAward(g, data.rol);
        const latest = activeDB.resetStatistics(activeData(g, true)); activeDB.saveData(latest);
        try { await refreshActive(g, latest); }
        catch { return { message: 'Veriler sıfırlandı. Sıralama mesajı güncellenemedi; mesajı yeniden oluşturun.' }; }
        return { message: 'Puanlar, kazananlar ve rekorlar sıfırlandı. Kurulum korundu.' };
      } },
      { id: 'shutdown', label: 'Sistemi kapat', description: 'Kurulumu ve istatistikleri siler, ödül rolünü geri alır ve geçmiş thread’ini arşivler.', danger: true, confirm: 'Aktif üye kurulumu, puanlar ve rekorlar silinsin mi? Ödül rolü geri alınır ve geçmiş thread’i arşivlenir.', fields: [], run: async g => {
        const data = activeData(g, true); await clearAward(g, data.rol);
        const warnings = await activeCommand.shutdownSystem(g, data, client.user.id);
        return { message: `Aktif üye sistemi kapatıldı.${warnings.length ? ` Uyarı: ${warnings.join(', ')}.` : ''}` };
      } },
    ],
  });

  const horoscopeStore = createJsonStore(horoscope.AYAR_DOSYASI);
  const signOptions = horoscope.BURCLAR.map(sign => [sign.key, `${sign.symbol} ${sign.name}`]);
  ekle('burc', 'Burç sistemi', 'Sunucu Yönetimi', 'Günlük yorumların yayın kanalını, gönderilecek burçları ve etiket rollerini seçin.', 'Database/Eğlence ve Etkileşim/burcAyar.json', [
    c('kanal', 'Yayın kanalı'), { ...a('gonderilecekBurclar', 'Gönderilecek burçlar', s('sign', 'Burç', signOptions), 12), default: signOptions.map(([key]) => key) },
    l('roller', 'Burç ve etiket rolü eşleşmeleri', [s('sign', 'Burç', signOptions), { ...r('roleId', 'Etiket rolü', false), assignable: false }], 12),
  ], g => { const config = horoscope.getGuildBurcSetting(g.id); return { ...config, roller: Object.entries(config.roller).map(([sign, roleId]) => ({ sign, roleId })) }; }, async (g, patch) => {
    if (patch.roller && new Set(patch.roller.map(row => row.sign)).size !== patch.roller.length) throw new AyarHatasi('Aynı burç birden fazla kez eklenemez.');
    const channelId = patch.kanal === undefined ? horoscope.getGuildBurcSetting(g.id).kanal : patch.kanal;
    if (channelId) await textChannel(g, channelId, [P.ViewChannel, P.SendMessages, P.EmbedLinks]);
    horoscopeStore.update(data => {
      const current = data[g.id] ||= {};
      Object.assign(current, patch, patch.roller ? { roller: Object.fromEntries(patch.roller.map(row => [row.sign, row.roleId])) } : {});
    });
  }, { command: 'burç-ayarla', pattern: 'B', note: 'Yorumlar her gün Türkiye saatiyle 12:00’de gönderilir. Kanalı temizleyerek veya burç seçimlerini kaldırarak gönderimi durdurabilirsiniz. Roller yalnızca etiketlemek için kullanılır.', actions: [
    { id: 'send-now', label: 'Son yorumları gönder', fields: [], run: async g => {
      const config = horoscope.getGuildBurcSetting(g.id);
      if (!config.kanal || !config.gonderilecekBurclar.length) throw new AyarHatasi('Önce yayın kanalı ve en az bir burç seçin.');
      await textChannel(g, config.kanal, [P.ViewChannel, P.SendMessages, P.EmbedLinks]);
      let result;
      try { result = await require('../../Utils/Engagement/burcGönderici').sendLatestHoroscopesToGuild(g, config); }
      catch (error) { throw new AyarHatasi(error.message); }
      return { message: `Seçili ${result.requested} burçtan ${result.messages} tanesinin yorumu gönderildi.` };
    } },
    { id: 'reset', label: 'Burç ayarlarını sıfırla', danger: true, confirm: 'Yayın kanalı, burç seçimleri ve tüm rol eşleşmeleri sıfırlansın mı?', fields: [], run: async g => {
      horoscopeStore.delete(g.id); return { message: 'Burç ayarları sıfırlandı.' };
    } },
  ] });

  const emojiPermission = g => {
    if (!g.members.me.permissions.has(P.ManageGuildExpressions)) throw new AyarHatasi('Botun Emojileri ve Çıkartmaları Yönet izni gerekli.');
  };
  const emojiName = name => {
    if (!/^[a-zA-Z0-9_]{2,32}$/.test(name)) throw new AyarHatasi('Emoji adı 2–32 karakter olmalı; yalnızca harf, rakam ve alt çizgi içerebilir.');
    return name;
  };
  const serverEmoji = async (g, id) => {
    emojiPermission(g);
    if (!/^\d{17,20}$/.test(id)) throw new AyarHatasi('Listeden bir sunucu emojisi seçin.');
    let emoji;
    try { emoji = await g.emojis.fetch(id); }
    catch (error) { if (error.code !== 10014) throw error; }
    if (!emoji || emoji.guild.id !== g.id) throw new AyarHatasi('Emoji bu sunucuda bulunamadı.');
    return emoji;
  };
  const emojiField = () => t('emojiId', 'Sunucu emojisi', 20, { minLength: 17, dynamicOptions: 'serverEmojis', resetAfterRun: true });
  ekle('emoji-ekle', 'Emoji ekle/kaldır', 'Sunucu Yönetimi', 'Özel emojileri sunucuya ekleyin, adlarını değiştirin veya silin.', 'Discord/guild-emojis', [],
    () => ({}), () => { throw new AyarHatasi('Emoji yönetimi için aşağıdaki işlemleri kullanın.'); }, {
      command: 'emoji-ekle', pattern: 'Discord API', note: 'Ekleme alanına Discord özel emojilerini <:isim:kimlik> veya <a:isim:kimlik> biçiminde yapıştırın. Bir işlemde en fazla 50 farklı emoji eklenebilir.',
      details: g => [`Sunucuda ${g.emojis.cache.filter(emoji => !emoji.animated).size} sabit, ${g.emojis.cache.filter(emoji => emoji.animated).size} hareketli emoji var.`],
      options: g => ({ serverEmojis: [...g.emojis.cache.values()].map(emoji => ({ value: emoji.id, label: `${emoji.name}${emoji.animated ? ' (hareketli)' : ''}` })) }),
      actions: [
        { id: 'add', label: 'Emojileri ekle', description: 'Yapıştırdığınız sabit ve hareketli özel emojileri seçili sunucuya yükler.', fields: [t('emojis', 'Eklenecek özel emojiler', 4000, { minLength: 1, multiline: true, resetAfterRun: true, hint: 'Örnek: <:merhaba:123456789012345678> <a:kutlama:223456789012345678>' })], run: async (g, input) => {
          emojiPermission(g);
          const matches = [...input.emojis.matchAll(/<(a)?:([a-zA-Z0-9_]{2,32}):(\d{17,20})>/g)];
          const entries = [...new Map(matches.map(match => [match[3], match])).values()];
          if (!entries.length || entries.length > 50 || input.emojis.replace(/<(a)?:([a-zA-Z0-9_]{2,32}):(\d{17,20})>/g, '').trim()) throw new AyarHatasi('Yalnızca geçerli özel emojileri aralarında boşluk bırakarak girin (en fazla 50).');
          const added = [], failed = [];
          for (const [, animated, name, id] of entries) {
            try {
              const emoji = await g.emojis.create({ name, attachment: `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=512&quality=lossless`, reason: 'Dashboard: emoji eklendi.' });
              added.push(emoji.name);
            } catch { failed.push(name); }
          }
          if (!added.length) throw new AyarHatasi('Emojiler eklenemedi. Sunucunun emoji kapasitesini, bot izinlerini ve kaynak emojileri kontrol edin.');
          return { message: `${added.length} emoji eklendi: ${added.join(', ')}.${failed.length ? ` Eklenemeyenler: ${failed.join(', ')}. Kapasite ve kaynak emojileri kontrol edin.` : ''}` };
        } },
        { id: 'rename', label: 'Emoji adını değiştir', description: 'Sunucudan bir emoji seçin ve yeni adını yazın.', fields: [emojiField(), t('name', 'Yeni emoji adı', 32, { minLength: 2, resetAfterRun: true })], run: async (g, input) => {
          const name = emojiName(input.name.trim()); const emoji = await serverEmoji(g, input.emojiId);
          await emoji.edit({ name, reason: 'Dashboard: emoji adı değiştirildi.' });
          return { message: `Emoji adı ${name} olarak değiştirildi.` };
        } },
        { id: 'delete', label: 'Emojiyi sil', description: 'Seçtiğiniz emojiyi onayınızın ardından sunucudan kaldırır.', danger: true, confirm: 'Seçili emoji sunucudan silinsin mi?', fields: [emojiField()], run: async (g, input) => {
          const emoji = await serverEmoji(g, input.emojiId); await emoji.delete('Dashboard: emoji silindi.');
          return { message: `${emoji.name} emojisi silindi.` };
        } },
      ],
    });
};