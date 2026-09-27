const store = require('../../Utils/ModMail/modmailStore');
const { saveConfig } = require('../../Utils/ModMail/modmailConfig');
const { describeConflicts, disableAnonymous } = require('../../Utils/ModMail/dmConflicts');
const { closeSession, claimSession, replyFromDashboard, requireStaff } = require('../../Utils/ModMail/modmailService');
const { canViewChannel } = require('../guildAccess');
const { AyarHatasi } = require('../validation');

module.exports = function register({ client, ekle, b, c, r, t, n }) {
  const ticketField = t('channelId', 'Talep kanal ID', 20, { minLength: 17, hint: 'Aşağıdaki açık talepler listesindeki kanal ID değerini girin.' });
  async function ticket(guild, channelId, actor, member) {
    const session = store.getSession(channelId);
    if (!session || session.guildId !== guild.id) throw new AyarHatasi('Talep bu sunucuda bulunamadı.');
    if (member) {
      await requireStaff(guild, member.id, session);
      const channel = guild.channels.cache.get(channelId);
      if (channel && !canViewChannel(guild, member, channel)) throw new AyarHatasi('Talep kanalına erişim yetkiniz yok.', 403);
    }
    return actor.userId || null;
  }
  ekle('modmail', 'ModMail', 'Sunucu Yönetimi', 'Üyelerin DM mesajlarını özel destek kanallarından yanıtlayın; transcript kayıtlarını tek panelden yönetin.', 'Utils/ModMail/modmailStore.js', [
    b('enabled', 'ModMail etkin'), c('categoryId', 'Talep kategorisi', true, [4]), c('logChannelId', 'Transcript log kanalı', true, [0]),
    { ...r('staffRoleId', 'ModMail yetkili rolü'), assignable: false },
    t('welcomeMessage', 'Karşılama mesajı', 1000, { minLength: 1, multiline: true, default: store.DEFAULT_CONFIG.welcomeMessage }),
    t('closeMessage', 'Kapanış mesajı', 1000, { minLength: 1, multiline: true, default: store.DEFAULT_CONFIG.closeMessage }),
    n('maxOpenTickets', 'En fazla açık talep', 1, 50, 30),
  ], guild => store.getConfig(guild.id), (guild, patch) => saveConfig(guild, patch), {
    command: 'modmail', pattern: 'Discord API',
    note: 'Önce DM kullanan Anonim Sohbet sistemi, kuyruğu ve açık sohbetleri kapatılmalıdır. Kontrol bot genelindedir. ModMail kapatılınca yeni talep alınmaz; mevcut talepler tamamlanabilir. Kapanışta HTML transcript, Components V2 log kartının içinde dosya olarak gösterilir. Yetkili kanalında // ile başlayan iç notlar DM ve transcript dışında kalır.',
    details: (guild, member) => [
      ...describeConflicts(client).map(value => `Önce kapatılmalı: ${value}`),
      `Açık talep sayısı: ${store.listSessions(guild.id).length}`,
      ...store.listSessions(guild.id).filter(session => !member || !guild.channels.cache.has(session.channelId) || canViewChannel(guild, member, guild.channels.cache.get(session.channelId)))
        .map(session => `${session.channelId} · Üye: ${session.userId} · ${session.status === 'open' ? 'Açık' : 'Kapanış yeniden denenmeli'} · ${session.messages.filter(m => m.delivered).length} mesaj`),
    ],
    actions: [
      { id: 'reset', label: 'ModMail ayarlarını sıfırla', danger: true, confirm: 'ModMail kapatılıp tüm ayarları sıfırlansın mı? Önce açık talepleri kapatmalısınız.', fields: [],
        run: async guild => {
          if (store.listSessions(guild.id).length) throw new AyarHatasi('Önce açık ModMail taleplerini kapatın.');
          await saveConfig(guild, { ...store.DEFAULT_CONFIG });
          return { message: 'ModMail ayarları sıfırlandı.' };
        } },
      { id: 'disable-anonymous', label: 'Çakışan Anonim Sohbeti kapat', danger: true,
        confirm: 'Bu sunucunun Anonim Sohbet paneli, açık sohbetleri ve bekleme kuyruğu kapatılsın mı?', fields: [],
        run: async guild => { await disableAnonymous(guild); return { message: 'Bu sunucunun Anonim Sohbet sistemi kapatıldı. ModMail ayarlarını kaydederek sistemi açabilirsiniz.' }; } },
      { id: 'claim', label: 'Talebi üstlen', fields: [ticketField], run: async (guild, input, actor, member) => {
        const userId = await ticket(guild, input.channelId, actor, member);
        if (!userId) throw new AyarHatasi('Talebi üstlenmek için Discord hesabıyla giriş yapın.');
        await claimSession(guild, input.channelId, userId);
        return { message: 'Talebi üstlendiniz.' };
      } },
      { id: 'reply', label: 'Üyeye yanıt gönder', fields: [ticketField, t('message', 'Yanıt', 1800, { minLength: 1, multiline: true })],
        run: async (guild, input, actor, member) => {
          const userId = await ticket(guild, input.channelId, actor, member);
          if (!userId) throw new AyarHatasi('Yanıt göndermek için Discord hesabıyla giriş yapın.');
          await replyFromDashboard(guild, input.channelId, userId, input.message);
          return { message: 'Yanıt üyeye DM üzerinden iletildi ve transcript kaydına eklendi.' };
        } },
      { id: 'close', label: 'Talebi kapat ve transcript kaydet', danger: true, confirm: 'Transcript kaydedildikten sonra talep kanalı silinsin mi?',
        fields: [ticketField, t('reason', 'Kapatma nedeni', 500, { minLength: 1, multiline: true })],
        run: async (guild, input, actor, member) => {
          const userId = await ticket(guild, input.channelId, actor, member);
          const result = await closeSession(guild, input.channelId, userId, input.reason);
          return { message: `Talep kapatıldı, transcript log kanalına kaydedildi.${result.dmDelivered ? '' : ' Üyeye DM gönderilemedi.'}` };
        } },
    ],
  });
};
