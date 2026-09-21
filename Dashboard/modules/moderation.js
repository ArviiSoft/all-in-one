'use strict';

const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PermissionFlagsBits: P, OverwriteType } = require('discord.js');
const { createJsonStore } = require('../../Utils/Core/safeJsonStore');
const { AyarHatasi } = require('../validation');

const storePath = 'Güvenlik ve Moderasyon/dashboardModerasyon.json';
const store = createJsonStore(path.join(__dirname, '../../Database', storePath));
const locks = createJsonStore(path.join(__dirname, '../../Database/Güvenlik ve Moderasyon/kanalKilitleri.json'));
const message = text => ({ message: text });
const confirm = input => { if (input.confirmed !== true) throw new AyarHatasi('İşlemi uygulamak için onay kutusunu işaretleyin.'); };
async function botFor(guild, permissions) {
  await guild.roles.fetch();
  const bot = await guild.members.fetchMe({ force: true });
  if (!bot.permissions.has(permissions)) throw new AyarHatasi('Botun bu işlem için gerekli Discord izinleri eksik.');
  return bot;
}
async function memberFor(guild, id, bot, capability) {
  const member = await guild.members.fetch({ user: id, force: true }).catch(error => {
    if (error.code === 10007) return null;
    throw error;
  });
  if (!member || member.guild.id !== guild.id) throw new AyarHatasi('Kullanıcı bu sunucuda bulunamadı.');
  if (id === guild.ownerId || id === bot.id || member.roles.highest.comparePositionTo(bot.roles.highest) >= 0) {
    throw new AyarHatasi('Sunucu sahibi, botun kendisi veya botla eşit / daha yüksek rollü bir üye hedeflenemez.');
  }
  if (capability && !member[capability]) throw new AyarHatasi('Botun rolü veya hedef üyenin izinleri bu işleme uygun değil.');
  return member;
}
async function channelFor(guild, id, bot, permissions) {
  const channel = await guild.channels.fetch(id, { force: true });
  if (!channel || channel.guildId !== guild.id || ![0, 5].includes(channel.type)) throw new AyarHatasi('Bu sunucudan bir metin veya duyuru kanalı seçin.');
  if (!channel.permissionsFor(bot)?.has([P.ViewChannel, ...permissions])) throw new AyarHatasi('Botun seçili kanaldaki izinleri yetersiz.');
  return channel;
}
async function roleFor(guild, id, bot) {
  const role = await guild.roles.fetch(id, { force: true });
  if (!role || role.guild.id !== guild.id || role.id === guild.id || role.managed || role.comparePositionTo(bot.roles.highest) >= 0) {
    throw new AyarHatasi('Botun rolünden aşağıda, yönetilebilir bir rol seçin.');
  }
  return role;
}
async function notify(member, guild, config, text) {
  if (!config.notifyMember) return '';
  try { await member.send({ content: `${guild.name}: ${text}`, allowedMentions: { parse: [] } }); return ''; }
  catch { return ' Kullanıcıya özel mesaj ulaştırılamadı.'; }
}
async function banList(guild) {
  const bans = [];
  let after;
  while (true) {
    const page = await guild.bans.fetch({ limit: 1000, ...(after ? { after } : {}) });
    bans.push(...page.values());
    if (page.size < 1000) return bans;
    const next = [...page.keys()].reduce((a, b) => BigInt(a) > BigInt(b) ? a : b);
    if (next === after) throw new AyarHatasi('Yasak listesi tamamlanamadı. Tekrar deneyin.');
    after = next;
  }
}

module.exports = function registerModeration({ client, ekle, b, n, t, c, r, s }) {
  const user = (key = 'userId', label = 'Kullanıcı ID', nullable = false) => ({ key, label, type: 'user', maxLength: 20, nullable, default: nullable ? null : '', hint: 'Discord’da kullanıcıya sağ tıklayıp ID’sini kopyalayın (Geliştirici Modu açık olmalı).' });
  const reason = () => t('reason', 'İşlem sebebi', 400, { hint: 'Boş bırakırsanız kaydettiğiniz varsayılan sebep kullanılır.' });
  const approved = () => ({ ...b('confirmed', 'Seçtiğim hedefe bu işlemin uygulanmasını onaylıyorum'), resetAfterRun: true });
  const channel = () => c('channelId', 'Kanal', false);
  const defaultReason = () => t('defaultReason', 'Varsayılan işlem sebebi', 400, { minLength: 1, default: 'Dashboard üzerinden moderasyon işlemi' });
  const dm = () => b('notifyMember', 'Kullanıcıya özel mesajla bildir', true);
  const optionalNumber = (key, label, min, max) => ({ ...n(key, label, min, max, null), nullable: true, hint: `Boşsa kaydedilmiş ayar kullanılır. ${min}–${max} arasında tam sayı.` });

  function register(id, label, command, description, fields, actions, extra = {}) {
    const allFields = [b('enabled', 'Dashboard işlemleri etkin', true), ...fields];
    const config = guild => ({ ...Object.fromEntries(allFields.map(f => [f.key, f.default ?? null])), ...store.get(guild.id)?.[id] });
    ekle(id, label, 'Güvenlik ve Moderasyon', description, storePath, allFields, config,
      (guild, patch) => store.update(data => { const value = data[guild.id] ||= {}; value[id] = { ...value[id], ...patch }; }), {
        command, pattern: 'Discord API',
        note: 'Bu ayarlar dashboard işlemleri için geçerlidir. Hedefi aşağıdaki işlem formunda seçin. Discord komutlarının kullanım izinleri Discord üzerinden yönetilir.',
        ...extra,
        actions: actions.map(action => ({ ...action, run: async (guild, input, actor = {}) => {
          const settings = config(guild);
          if (!settings.enabled) throw new AyarHatasi('Önce dashboard işlemlerini etkinleştirip kaydedin.');
          const audit = `Dashboard · ${actor.username || 'Yönetici'} · ${input.reason?.trim() || settings.defaultReason || command}`.slice(0, 512);
          try { return await action.run(guild, input, settings, audit, actor); }
          catch (error) {
            const errors = { 10003: 'Kanal artık bulunamıyor.', 10007: 'Üye bu sunucuda bulunamadı.', 10013: 'Discord hesabı bulunamadı.', 10026: 'Bu kullanıcı için yasak bulunamadı.', 50001: 'Botun bu kaynağa erişimi yok.', 50013: 'Discord işlemi reddetti. Botun izinlerini ve rol sırasını kontrol edin.' };
            if (errors[error.code]) throw new AyarHatasi(errors[error.code]);
            throw error;
          }
        } })),
      });
  }

  const banAction = force => ({ id: 'ban', label: force ? 'ID ile yasakla' : 'Üyeyi yasakla', danger: true,
    description: force ? 'Sunucuda bulunmayan bir Discord hesabını da ID ile yasaklayabilirsiniz.' : 'Seçili üyeyi sunucudan yasaklar.',
    fields: [user(), reason(), approved()], run: async (g, input, config, audit) => {
      confirm(input);
      const bot = await botFor(g, [P.BanMembers]);
      let member;
      if (force) {
        if ([g.ownerId, bot.id].includes(input.userId)) throw new AyarHatasi('Bu kullanıcı yasaklanamaz.');
        const existing = await g.members.fetch({ user: input.userId, force: true }).catch(error => { if (error.code === 10007) return null; throw error; });
        if (existing) member = await memberFor(g, input.userId, bot, 'bannable');
        await client.users.fetch(input.userId);
      } else member = await memberFor(g, input.userId, bot, 'bannable');
      const existingBan = await g.bans.fetch({ user: input.userId, force: true }).catch(error => { if (error.code === 10026) return null; throw error; });
      if (existingBan) throw new AyarHatasi('Kullanıcı zaten yasaklı.');
      await g.members.ban(input.userId, { reason: audit, deleteMessageSeconds: config.deleteMessageSeconds || 0 });
      const notice = member ? await notify(member, g, config, `Yasaklandınız. Sebep: ${input.reason?.trim() || config.defaultReason}`) : '';
      return message(`${input.userId} yasaklandı.${notice}`);
    } });
  register('ban', 'Ban', 'ban', 'Üyeleri yasaklayın, yasakları kaldırın ve yönetin.', [defaultReason(), dm(), n('deleteMessageSeconds', 'Ban sırasında silinecek mesaj geçmişi · saniye', 0, 604800, 0)], [
    banAction(false),
    { id: 'unban', label: 'Yasağı kaldır', fields: [user(), reason()], run: async (g, input, config, audit) => {
      await botFor(g, [P.BanMembers]); await g.members.unban(input.userId, audit); return message(`${input.userId} için yasak kaldırıldı.`);
    } },
    { id: 'list', label: 'Yasakları listele', fields: [n('page', 'Sayfa', 1, 100000, 1)], run: async (g, input) => {
      await botFor(g, [P.BanMembers]); const bans = await banList(g);
      const start = (input.page - 1) * 20;
      return message(`Toplam ${bans.length} yasak. Sayfa ${input.page}.\n${bans.slice(start, start + 20).map(ban => `${ban.user.username} (${ban.user.id}) · ${ban.reason || 'Sebep belirtilmemiş'}`).join('\n')}`);
    } },
    { id: 'clear', label: 'Tüm yasakları kaldır', danger: true, description: 'Sunucudaki bütün yasakları kaldırır. Kullanıcılar yeniden katılabilir.', fields: [t('confirmation', 'Onaylamak için sunucu adını yazın', 100), approved()], run: async (g, input, config, audit) => {
      confirm(input); if (input.confirmation !== g.name) throw new AyarHatasi('Onay için sunucunun adını eksiksiz yazın.');
      await botFor(g, [P.BanMembers]); const bans = await banList(g); let done = 0;
      for (const ban of bans) { try { await g.members.unban(ban.user.id, audit); done++; } catch {} }
      return message(`${done} yasak kaldırıldı; ${bans.length - done} işlem başarısız oldu.`);
    } },
  ]);
  register('forceban', 'Forceban', 'forceban', 'Sunucu dışındaki hesapları kullanıcı ID’si ile yasaklayın.', [defaultReason()], [banAction(true)]);
  register('kick', 'Kick', 'kick', 'Üyeleri sebep belirterek sunucudan çıkarın.', [defaultReason(), dm()], [
    { id: 'kick', label: 'Üyeyi sunucudan çıkar', danger: true, fields: [user(), reason(), approved()], run: async (g, input, config, audit) => {
      confirm(input); const bot = await botFor(g, [P.KickMembers]); const member = await memberFor(g, input.userId, bot, 'kickable');
      await member.kick(audit); return message(`${member.id} sunucudan çıkarıldı.${await notify(member, g, config, `Sunucudan çıkarıldınız. Sebep: ${input.reason?.trim() || config.defaultReason}`)}`);
    } },
  ]);
  register('nickname-degistir', 'Nickname değiştir', 'nickname-değiştir', 'Üyelerin sunucudaki isimlerini değiştirin veya sıfırlayın.', [defaultReason()], [
    { id: 'set', label: 'İsmi değiştir', fields: [user(), t('nickname', 'Yeni isim', 32, { hint: 'Sunucu ismini sıfırlamak için boş bırakın.' }), reason()], run: async (g, input, config, audit) => {
      const bot = await botFor(g, [P.ManageNicknames]); const member = await memberFor(g, input.userId, bot, 'manageable');
      await member.setNickname(input.nickname.trim() || null, audit); return message(input.nickname.trim() ? 'Üyenin sunucudaki ismi değiştirildi.' : 'Üyenin sunucu ismi sıfırlandı.');
    } },
  ]);
  for (const remove of [false, true]) register(remove ? 'rol-al' : 'rol-ver', remove ? 'Rol al' : 'Rol ver', remove ? 'rol-al' : 'rol-ver', remove ? 'Bir üyeden seçili rolü kaldırın.' : 'Bir üyeye seçili rolü verin.', [defaultReason()], [
    { id: 'apply', label: remove ? 'Rolü kaldır' : 'Rolü ver', fields: [user(), r('roleId', 'Rol', false), reason()], run: async (g, input, config, audit) => {
      const bot = await botFor(g, [P.ManageRoles]); const role = await roleFor(g, input.roleId, bot); const member = await memberFor(g, input.userId, bot, 'manageable');
      await member.roles[remove ? 'remove' : 'add'](role, audit); return message(`${member.id}: ${role.name} rolü ${remove ? 'kaldırıldı' : 'verildi'}.`);
    } },
  ]);
  register('toplu-rol', 'Toplu rol', 'toplu-rol', 'Üyelere veya botlara topluca rol verin ya da rollerini kaldırın.', [defaultReason()], [
    { id: 'apply', label: 'Toplu rol işlemini uygula', danger: true, description: 'Sunucudaki üye sayısına göre işlem uzun sürebilir. Sonuçta başarılı, atlanan ve başarısız işlemler gösterilir.',
      fields: [s('operation', 'İşlem', [['add', 'Rol ver'], ['remove', 'Rol al']]), s('target', 'Hedef', [['members', 'Üyeler'], ['bots', 'Botlar']]), r('roleId', 'Rol', false), reason(), approved()], run: async (g, input, config, audit) => {
        confirm(input); const bot = await botFor(g, [P.ManageRoles]); const role = await roleFor(g, input.roleId, bot); const members = await g.members.fetch();
        let done = 0, skipped = 0, failed = 0;
        for (const member of members.values()) {
          if (member.user.bot !== (input.target === 'bots')) continue;
          if ([g.ownerId, bot.id].includes(member.id) || !member.manageable || member.roles.highest.comparePositionTo(bot.roles.highest) >= 0 || member.roles.cache.has(role.id) === (input.operation === 'add')) { skipped++; continue; }
          try { await member.roles[input.operation](role, audit); done++; } catch { failed++; }
        }
        return message(`${done} üyede işlem tamamlandı; ${skipped} üye atlandı; ${failed} işlem başarısız oldu.`);
      } },
  ]);
  register('timeout', 'Timeout', 'timeout', 'Üyelere süreli iletişim kısıtlaması uygulayın veya kısıtlamayı kaldırın.', [defaultReason(), n('durationSeconds', 'Varsayılan timeout süresi · saniye', 1, 2419200, 600)], [
    { id: 'apply', label: 'Timeout uygula', fields: [user(), optionalNumber('durationSeconds', 'Süre · saniye', 1, 2419200), reason()], run: async (g, input, config, audit) => {
      const bot = await botFor(g, [P.ModerateMembers]); const member = await memberFor(g, input.userId, bot, 'moderatable');
      const seconds = input.durationSeconds ?? config.durationSeconds; await member.timeout(seconds * 1000, audit); return message(`${seconds} saniyelik timeout uygulandı.`);
    } },
    { id: 'remove', label: 'Timeout kaldır', fields: [user(), reason()], run: async (g, input, config, audit) => {
      const bot = await botFor(g, [P.ModerateMembers]); const member = await memberFor(g, input.userId, bot, 'moderatable');
      await member.timeout(null, audit); return message('Timeout kaldırıldı.');
    } },
  ]);
  register('temizle', 'Mesaj temizle', 'temizle', 'Kanaldaki son mesajları topluca veya kullanıcıya göre temizleyin.', [n('count', 'Varsayılan mesaj sayısı', 1, 100, 10)], [
    { id: 'clear', label: 'Mesajları temizle', danger: true, description: 'Son 100 mesaj taranır. İki haftadan eski ve sabitlenmiş mesajlar korunur.', fields: [channel(), optionalNumber('count', 'Mesaj sayısı', 1, 100), user('userId', 'Yalnızca bu kullanıcı (isteğe bağlı)', true), approved()], run: async (g, input, config) => {
      confirm(input); const bot = await botFor(g, []); const ch = await channelFor(g, input.channelId, bot, [P.ManageMessages, P.ReadMessageHistory]);
      const recent = await ch.messages.fetch({ limit: 100 }); const count = input.count ?? config.count;
      const selected = recent.filter(m => !m.pinned && m.createdTimestamp > Date.now() - 14 * 86400000 + 5000 && (!input.userId || m.author.id === input.userId)).first(count);
      if (!selected.length) return message('Silinmeye uygun mesaj bulunamadı.');
      const deleted = await ch.bulkDelete(selected, true); return message(`${deleted.size} mesaj silindi.`);
    } },
  ]);
  register('yavasmod', 'Yavaşmod', 'yavaşmod', 'Kanalın mesaj gönderme aralığını ayarlayın veya yavaş modu kapatın.', [defaultReason(), n('seconds', 'Varsayılan yavaş mod · saniye', 0, 21600, 5)], [
    { id: 'apply', label: 'Yavaş modu uygula', fields: [channel(), optionalNumber('seconds', 'Bekleme süresi · saniye', 0, 21600), reason()], run: async (g, input, config, audit) => {
      const bot = await botFor(g, []); const ch = await channelFor(g, input.channelId, bot, [P.ManageChannels]); const seconds = input.seconds ?? config.seconds;
      await ch.setRateLimitPerUser(seconds, audit); return message(seconds ? `Yavaş mod ${seconds} saniye olarak ayarlandı.` : 'Yavaş mod kapatıldı.');
    } },
  ]);
  register('kanal-kilitle', 'Kanal kilitle', 'kanal-kilit', 'Kanalları kilitleyin ve önceki mesaj izinlerini geri yükleyin.', [defaultReason()], [
    { id: 'lock', label: 'Kanalı kilitle', fields: [channel(), reason()], run: async (g, input, config, audit) => {
      const bot = await botFor(g, []); const ch = await channelFor(g, input.channelId, bot, [P.ManageRoles]); const key = `${g.id}:${ch.id}`;
      if (locks.get(key)) throw new AyarHatasi('Bu kanal için kilit kaydı var. Önce kilidi açın.');
      const records = [...ch.permissionOverwrites.cache.values()].filter(o => o.id === g.id || o.allow.has(P.SendMessages)).map(o => ({ id: o.id, type: o.type, send: o.allow.has(P.SendMessages) ? true : o.deny.has(P.SendMessages) ? false : null }));
      if (!records.some(o => o.id === g.id)) records.push({ id: g.id, type: OverwriteType.Role, send: null });
      locks.set(key, { records });
      try { for (const row of records) await ch.permissionOverwrites.edit(row.id, { SendMessages: false }, { type: row.type, reason: audit }); }
      catch { throw new AyarHatasi('Bazı izinler değiştirilemedi. Kaydedilen izinleri geri yüklemek için Kanal kilidini aç işlemini kullanın.'); }
      return message('Kanal kilitlendi. Yönetici izinli hesaplar kilidi aşabilir.');
    } },
    { id: 'unlock', label: 'Kanal kilidini aç', fields: [channel(), reason()], run: async (g, input, config, audit) => {
      const bot = await botFor(g, []); const ch = await channelFor(g, input.channelId, bot, [P.ManageRoles]); const key = `${g.id}:${ch.id}`; const saved = locks.get(key);
      if (!saved) throw new AyarHatasi('Bu kanal dashboard üzerinden kilitlenmemiş; geri yüklenecek izin kaydı yok.');
      for (const row of saved.records) await ch.permissionOverwrites.edit(row.id, { SendMessages: row.send }, { type: row.type, reason: audit });
      locks.delete(key); return message('Kanalın kilit öncesindeki mesaj izinleri geri yüklendi.');
    } },
  ]);
  register('nuke', 'Nuke', 'nuke', 'Bir kanalı yeniden oluşturup eski kanalın mesajlarını silin.', [defaultReason()], [
    { id: 'reset', label: 'Kanalı sıfırla', danger: true, description: 'Kanalın mesajları kalıcı olarak silinir. Yeni kanalın ID’si değişir; kanala bağlı bot ayarlarını güncellemeniz gerekir.', fields: [channel(), t('confirmation', 'Onaylamak için kanal adını yazın', 100), reason(), approved()], run: async (g, input, config, audit) => {
      confirm(input); const bot = await botFor(g, []); const ch = await channelFor(g, input.channelId, bot, [P.ManageChannels, P.ManageRoles]);
      if (input.confirmation !== ch.name) throw new AyarHatasi('Onay için kanalın adını eksiksiz yazın.');
      if ([g.rulesChannelId, g.publicUpdatesChannelId].includes(ch.id)) throw new AyarHatasi('Topluluk kuralları ve güncelleme kanalları sıfırlanamaz.');
      const clone = await ch.clone({ reason: audit });
      try { await clone.setPosition(ch.rawPosition, { reason: audit }); await ch.delete(audit); }
      catch {
        try { await clone.delete('Başarısız dashboard sıfırlaması geri alındı'); }
        catch { throw new AyarHatasi(`Eski kanal silinemedi. Oluşturulan kopya da kaldırılamadı: ${clone.id}. Kanalları kontrol edin.`); }
        throw new AyarHatasi('Kanal silinemedi; oluşturulan kopya geri alındı.');
      }
      locks.delete(`${g.id}:${ch.id}`);
      return message(`Kanal sıfırlandı. Yeni kanal: #${clone.name} (${clone.id}). Kanalı kullanan ayarları güncelleyin.`);
    } },
  ]);

  const warnings = require('../../Commands/Moderasyon/uyarı');
  register('uyari', 'Uyarı', 'uyarı', 'Süreli veya kalıcı uyarı verin, kayıtları listeleyin ve silin.', [defaultReason(), dm(), n('durationSeconds', 'Varsayılan uyarı süresi · saniye (0 = kalıcı)', 0, 31536000, 0)], [
    { id: 'add', label: 'Uyarı ver', fields: [user(), reason(), optionalNumber('durationSeconds', 'Uyarı süresi · saniye (0 = kalıcı)', 0, 31536000)], run: async (g, input, config, audit, actor) => {
      const bot = await botFor(g, [P.ModerateMembers]); const member = await memberFor(g, input.userId, bot, 'manageable');
      const seconds = input.durationSeconds ?? config.durationSeconds;
      if (seconds > 0 && seconds < 5) throw new AyarHatasi('Süreli uyarı en az 5 saniye olmalı.');
      const data = warnings.readGuildWarnings(g.id); const createdAt = Date.now();
      const record = { id: randomUUID().replaceAll('-', ''), reason: input.reason.trim() || config.defaultReason, moderatorId: null, source: 'dashboard', moderatorName: actor.username || 'Yönetici', createdAt, durationMs: seconds ? seconds * 1000 : null, expiresAt: seconds ? createdAt + seconds * 1000 : null };
      (data[input.userId] ||= []).push(record); warnings.writeGuildWarnings(g.id, data);
      return message(`Uyarı kaydedildi. Aktif uyarı sayısı: ${data[input.userId].length}.${await notify(member, g, config, `Uyarı aldınız. Sebep: ${record.reason}`)}`);
    } },
    { id: 'list', label: 'Uyarıları listele', fields: [user(), n('page', 'Sayfa', 1, 100000, 1)], run: async (g, input) => {
      const rows = warnings.readGuildWarnings(g.id)[input.userId] || []; const start = (input.page - 1) * 10;
      return message(`Toplam ${rows.length} aktif uyarı. Sayfa ${input.page}.\n${rows.slice(start, start + 10).map((w, i) => `${start + i + 1}. ${w.reason} · ${w.expiresAt ? new Date(w.expiresAt).toLocaleString('tr-TR') : 'Kalıcı'} · ID: ${w.id}`).join('\n')}`);
    } },
    { id: 'delete', label: 'Uyarıyı sil', danger: true, fields: [user(), t('warningId', 'Uyarı ID', 100, { minLength: 1, hint: 'Uyarıları listele işlemindeki ID’yi girin.' }), approved()], run: async (g, input) => {
      confirm(input); const data = warnings.readGuildWarnings(g.id); const rows = data[input.userId] || []; const index = rows.findIndex(w => w.id === input.warningId);
      if (index < 0) throw new AyarHatasi('Uyarı bulunamadı veya süresi doldu.');
      rows.splice(index, 1); warnings.writeGuildWarnings(g.id, data); return message('Uyarı silindi.');
    } },
    { id: 'clear', label: 'Üyenin uyarılarını temizle', danger: true, fields: [user(), approved()], run: async (g, input) => {
      confirm(input); const data = warnings.readGuildWarnings(g.id); const count = data[input.userId]?.length || 0; delete data[input.userId]; warnings.writeGuildWarnings(g.id, data); return message(`${count} uyarı silindi.`);
    } },
    { id: 'import-legacy', label: 'Eski uyarıları bu sunucuya aktar', danger: true,
      description: 'Sunucu bilgisi içermeyen eski uyarıların tamamını seçili sunucuya bağlar. Bu kayıtların bu sunucuya ait olduğundan emin olun.',
      fields: [t('confirmation', 'Aktarım için sunucu adını yazın', 100), approved()], run: async (g, input) => {
        confirm(input); if (input.confirmation !== g.name) throw new AyarHatasi('Aktarım için sunucunun adını eksiksiz yazın.');
        return message(`${warnings.importLegacyWarnings(g.id)} eski uyarı bu sunucuya aktarıldı.`);
      } },
  ], {
    note: 'Uyarılar Discord komutuyla ortak ve sunucuya özel tutulur. Sunucu bilgisi olmayan eski kayıtlar korunur; Eski uyarıları bu sunucuya aktar işlemiyle ilgili sunucuya bağlanabilir.',
    details: () => [`Sunucuya bağlanmayı bekleyen eski uyarı: ${warnings.legacyWarningCount()}`],
    validate: patch => { if (patch.durationSeconds > 0 && patch.durationSeconds < 5) throw new AyarHatasi('Süreli uyarı en az 5 saniye olmalı.'); },
  });
};