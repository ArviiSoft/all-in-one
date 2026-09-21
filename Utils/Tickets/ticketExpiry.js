const { createTranscriptInfo, buildTranscriptLogPayload, buildTicketTranscriptHtml, transcriptFileName } = require('./ticketTranscript');
const { loadDB, saveDB } = require('./ticketStore');

async function kapat(client, guildId, channelId, openerId) {
  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    const ch = await guild.channels.fetch(channelId).catch(() => null);
    const db = loadDB();
    const expiryTs = Number(db[guildId]?.ticketExpiry?.[channelId]);
    if (db[guildId]?.activeTickets?.[openerId] !== channelId || !Number.isFinite(expiryTs) || Math.floor(Date.now() / 1000) < expiryTs) return;

    if (ch) {
      const logChannelId = db[guildId]?.logChannel;
      const logChannel = logChannelId ? await guild.channels.fetch(logChannelId).catch(() => null) : null;

      const messages = await ch.messages.fetch({ limit: 100 }).catch(() => null);
      if (messages) {
        const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        const transcriptInfo = await createTranscriptInfo({
          guild,
          channel: ch,
          messages: sorted,
          dbGuild: db[guildId],
          openerId,
          closerLabel: 'Otomatik Sistem'
        });
        const html = await buildTicketTranscriptHtml({ guild, channel: ch, messages: sorted, info: transcriptInfo });
        const fileName = transcriptFileName(transcriptInfo);

        if (logChannel) {
          const transcriptPayload = buildTranscriptLogPayload(transcriptInfo, fileName);
          await logChannel.send({
            ...transcriptPayload,
            files: [{ attachment: Buffer.from(html, 'utf-8'), name: fileName }]
          }).catch(() => null);
        }

        const openerMember = await guild.members.fetch(openerId).catch(() => null);
        if (openerMember) {
          const dmTranscriptPayload = buildTranscriptLogPayload(transcriptInfo, fileName);
          await openerMember.send({ ...dmTranscriptPayload, files: [{ attachment: Buffer.from(html, 'utf-8'), name: fileName }] }).catch(() => {});
        }
      }

      const vcId = db[guildId]?.voiceTickets?.[openerId];
      if (vcId) {
        const vc = await guild.channels.fetch(vcId).catch(() => null);
        if (vc) await vc.delete().catch(() => {});
        delete db[guildId].voiceTickets[openerId];
      }

      await ch.send('**Talep süresi dolduğu için otomatik kapatıldı.**').catch(() => {});
      setTimeout(() => ch.delete().catch(() => {}), 3000);
    }

    delete db[guildId].activeTickets[openerId];
    delete db[guildId].ticketExpiry[channelId];
    delete db[guildId].ticketDetails?.[channelId];
    saveDB(db);
  } catch (err) {
    console.error('🔴 [DESTEK] Otomatik kapanma hatası:', err);
  }
}

module.exports = function startTicketExpiryChecker(client) {
  let checking = false;
  setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      const db = loadDB();
      const now = Math.floor(Date.now() / 1000);

      for (const [guildId, guildData] of Object.entries(db)) {
        const ticketExpiry = guildData.ticketExpiry || {};
        for (const [channelId, expiryTs] of Object.entries(ticketExpiry)) {
          if (now >= expiryTs) {
            const openerId = Object.entries(guildData.activeTickets || {}).find(([, chId]) => chId === channelId)?.[0];
            if (openerId) {
              console.log(`🕒 [DESTEK] Süre doldu, destek kapatılıyor: ${channelId}`);
              await kapat(client, guildId, channelId, openerId);
            }
          }
        }
      }
    } catch (err) {
      console.error('🔴 [DESTEK] Süre kontrol hatası:', err);
    } finally {
      checking = false;
    }
  }, 60 * 1000);

  console.log('✔️ [DESTEK] Ticket Expiry kontrol sistemi başlatıldı.');
};