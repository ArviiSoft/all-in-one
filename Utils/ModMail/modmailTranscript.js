const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, FileBuilder, MessageFlags } = require('discord.js');
const { createViewModel, renderTranscriptPage } = require('./modmailTranscriptView');

const timestamp = value => `<t:${Math.floor(value / 1000)}:f>`;
function logPayload(session, fileNames) {
  const delivered = session.messages.filter(message => message.delivered);
  const members = delivered.filter(message => message.direction === 'member').length;
  const staffCounts = new Map();
  for (const record of delivered.filter(message => message.direction === 'staff')) staffCounts.set(record.authorId, (staffCounts.get(record.authorId) || 0) + 1);
  const staffLines = [...staffCounts].slice(0, 12).map(([id, count]) => `<@${id}> — **${count}** yanıt`);
  if (staffCounts.size > 12) staffLines.push(`Diğer ${staffCounts.size - 12} yetkili ve tüm yanıtlar transcript içinde.`);
  const container = new ContainerBuilder().setAccentColor(0x7665ba)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 📬 ModMail • Görüşme Arşivi\nÜye mesajları, yetkililerin yanıtları ve dosyalar aşağıdaki görüşme kaydında.'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `**Talep:** \`${session.channelId}\``,
      `**Üye:** <@${session.userId}> · \`${session.userId}\``,
      `**Üstlenen:** ${session.claimedBy ? `<@${session.claimedBy}>` : 'Üstlenilmedi'}`,
      `**Kapatan:** ${session.closerId ? `<@${session.closerId}>` : 'Sistem'}`,
      `**Açılış:** ${timestamp(session.openedAt)}`,
      `**Kapanış:** ${timestamp(session.closedAt)}`,
      `**Süre:** ${Math.max(1, Math.ceil((session.closedAt - session.openedAt) / 60000))} dakika`,
      `**İletilen mesajlar:** ${delivered.length} · Üye: ${members} · Yetkili: ${delivered.length - members}`,
      `**Dosyalar:** ${delivered.reduce((n, m) => n + (m.attachments?.length || 0), 0)}`,
      `**İletilemeyen / kısmi mesajlar:** ${session.messages.length - delivered.length}`,
      `**Kapatma nedeni:** ${session.closeReason || 'Belirtilmedi'}`,
    ].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Yanıt Veren Yetkililer\n${staffLines.length ? staffLines.join('\n') : 'Yetkili yanıtı bulunmuyor.'}`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  for (const name of fileNames) container.addFileComponents(new FileBuilder().setURL(`attachment://${name}`));
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

async function buildTranscript(guild, session) {
  const model = createViewModel(guild, session);
  const files = [];
  for (let index = 0; index < Math.max(model.messages.length, 1); index += 250) {
    const html = renderTranscriptPage(model, files.length);
    const attachment = Buffer.from(html, 'utf8');
    if (attachment.length > 8 * 1024 * 1024) throw new TypeError('Transcript dosyası yükleme sınırını aştı. Talep ve kayıtlar korundu.');
    files.push({ attachment, name: `modmail-${session.channelId}-${files.length + 1}.html` });
  }
  return { ...logPayload(session, files.map(file => file.name)), files };
}
module.exports = { buildTranscript, logPayload };
