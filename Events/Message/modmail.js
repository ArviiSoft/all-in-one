const { ChannelType, MessageFlags } = require('discord.js');
const store = require('../../Utils/ModMail/modmailStore');
const service = require('../../Utils/ModMail/modmailService');
const { respond, errorDetails } = require('../../Utils/ModMail/modmailResponses');

function errorMessage(error) {
  return error instanceof TypeError ? error.message : 'İşlem tamamlanamadı. Mesajın tamamı iletilmemiş olabilir. Botun kanal izinlerini ve alıcının DM ayarlarını kontrol edip tekrar deneyin. Talep kayıtları korundu.';
}
module.exports = client => {
  client.on('messageCreate', async message => {
    if (!message.author || message.author.bot || message.webhookId) return;
    const direct = message.channel.type === ChannelType.DM;
    if (direct ? !store.ownsDirectMessages() : !store.getSession(message.channelId)) return;
    try {
      if (direct) await service.handleDirectMessage(message);
      else await service.handleStaffMessage(message);
    } catch (error) {
      console.error('[MODMAIL] Mesaj iletilemedi:', errorDetails(error));
      await message.reply({ content: errorMessage(error), allowedMentions: { parse: [], repliedUser: false } }).catch(() => null);
    }
  });
  client.on('interactionCreate', async interaction => {
    if (interaction.__honeypotBlocked || !interaction.customId?.startsWith('mm:')) return;
    try {
      const command = require('../../Commands/Sunucu/modmail');
      if (interaction.customId.startsWith('mm:consent:')) await service.handleConfirmation(interaction);
      else if (interaction.customId.startsWith('mm:userClose:')) await service.handleUserClose(interaction);
      else if (interaction.customId.startsWith('mm:route:')) await service.handleRoute(interaction);
      else if (interaction.customId.startsWith('mm:panel:')) await command.handlePanel(interaction);
      else await command.handleTicket(interaction);
    } catch (error) {
      console.error('[MODMAIL] İşlem tamamlanamadı:', errorDetails(error));
      const payload = { content: errorMessage(error), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } };
      await respond(interaction, interaction.replied || interaction.deferred ? 'followUp' : 'reply', payload).catch(() => null);
    }
  });
  client.on('clientReady', async () => {
    try {
      const failures = await service.refreshOpenSessions(client);
      for (const failure of failures) console.warn('[MODMAIL] Açık talep güncellenemedi:', failure);
    } catch (error) { console.error('[MODMAIL] Açık talepler güncellenemedi:', errorDetails(error)); }
  });
  client.on('channelDelete', async channel => {
    const session = store.getSession(channel.id);
    if (!session || session.status !== 'open') return;
    try { await service.closeSession(channel.guild, channel.id, null, 'Talep kanalı silindi.'); }
    catch (error) { console.error('[MODMAIL] Silinen kanalın kaydı korundu; panelden kapatma yeniden denenebilir:', errorDetails(error)); }
  });
};
