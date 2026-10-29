const { ChannelType } = require('discord.js');
const emojiler = require('../../Utils/Emojis/emojiler.js');
function editSubcommand(sub) {
  sub.setName('düzenle').setDescription('Aktif çekilişin tüm ayarlarını değiştirir; belirtilmeyen ayarlar korunur.')
    .addStringOption(o => o.setName('id').setDescription('Düzenlenecek çekiliş ID').setRequired(true))
    .addStringOption(o => o.setName('süre').setDescription('Şu andan itibaren kalan süre. Örnek: 2 gün, 3 saat').setMaxLength(100))
    .addIntegerOption(o => o.setName('kazanan').setDescription('Kazanan sayısı.').setMinValue(1).setMaxValue(50))
    .addStringOption(o => o.setName('ödül').setDescription('Yeni ödül.').setMinLength(1).setMaxLength(256))
    .addChannelOption(o => o.setName('kanal').setDescription('Çekilişin taşınacağı kanal; katılımcılar korunur.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addUserOption(o => o.setName('bağışçı').setDescription('Yeni bağışçı.'));
  for (const [name, description] of [['gerekli-roller', 'Gerekli roller'], ['yasaklı-roller', 'Yasaklı roller'], ['bypass-roller', 'Şartları atlayan roller']]) {
    sub.addStringOption(o => o.setName(name).setDescription(`${description}: rol etiketleri veya ID’leri. Kaldırmak için: yok`).setMaxLength(1000));
  }
  return sub
    .addRoleOption(o => o.setName('bonus-rol').setDescription('Bonus rol listesini bu rolle değiştirir.'))
    .addIntegerOption(o => o.setName('bonus-miktar').setDescription('Seçilen veya mevcut tek bonus rolün ek hakkı.').setMinValue(1).setMaxValue(100))
    .addStringOption(o => o.setName('bonus-roller').setDescription('Birden çok bonus: RolID:2, RolID:5. Kaldırmak için: yok').setMaxLength(1000))
    .addStringOption(o => o.setName('mesaj-şartı').setDescription('Örnek: 5 #genel 10m. Kaldırmak için: yok').setMaxLength(200))
    .addBooleanOption(o => o.setName('bağışçı-kazanamaz').setDescription('Bağışçının kazanmasını engeller.'))
    .addBooleanOption(o => o.setName('varsayılanları-yoksay').setDescription('Değiştirilirse şartları temizler (açık) veya sunucu varsayılanlarını uygular (kapalı).'))
    .addBooleanOption(o => o.setName('ping').setDescription('Mesajdaki etiketlerin bildirim göndermesine izin verir.'))
    .addStringOption(o => o.setName('mesaj').setDescription('Embed üstündeki mesaj.').setMaxLength(2000))
    .addStringOption(o => o.setName('ekstra').setDescription('Ek açıklama.').setMaxLength(1500))
    .addStringOption(o => o.setName('açıklama').setDescription('Çekiliş açıklaması.').setMaxLength(1500))
    .addAttachmentOption(o => o.setName('görsel').setDescription('Yeni çekiliş görseli.'))
    .addStringOption(o => o.setName('temizle').setDescription('Kaldırılacak alanlar, virgülle: bağışçı, görsel, mesaj, ekstra, açıklama, bonus-rol, mesaj-şartı').setMaxLength(300));
}

async function executeEdit(interaction, client) {
  const api = require('./çekilişKontrol');
  await interaction.deferReply({ flags: 64 });
  try {
    const id = interaction.options.getString('id', true);
    const existing = api.cekilisVerisiniOku()[id];
    if (!existing || existing.guildId !== interaction.guildId) throw new RangeError('Çekiliş bu sunucuda bulunamadı.');
    if (!api.canManageGiveaway(interaction, existing)) throw new RangeError('Bu çekilişi düzenlemek için yetkin yok.');
    const state = api.giveawayEditState(existing);
    const patch = {};
    for (const [name, key, getter] of [
      ['ödül', 'prize', 'getString'], ['kazanan', 'winners', 'getInteger'], ['mesaj', 'message', 'getString'],
      ['ekstra', 'extra', 'getString'], ['açıklama', 'description', 'getString'], ['ping', 'ping', 'getBoolean'],
      ['bağışçı-kazanamaz', 'donorNoWin', 'getBoolean'], ['varsayılanları-yoksay', 'noDefaults', 'getBoolean'],
    ]) { const value = interaction.options[getter](name); if (value != null) patch[key] = value; }
    const duration = interaction.options.getString('süre');
    if (duration !== null) {
      patch.durationMs = api.parseDurationInput(duration);
      if (!patch.durationMs) throw new RangeError('Geçerli bir süre girin. Örnek: 2 gün, 3 saat.');
    }
    for (const [name, key] of [['gerekli-roller', 'requiredRoles'], ['yasaklı-roller', 'blacklistedRoles'], ['bypass-roller', 'bypassRoles']]) {
      const value = interaction.options.getString(name);
      if (value === null) continue;
      if (value.trim().toLocaleLowerCase('tr-TR') === 'yok') { patch[key] = []; continue; }
      if (!/^(?:\s*(?:<@&\d{17,20}>|\d{17,20})[\s,]*)+$/.test(value)) throw new RangeError('Rolleri etiket veya ID olarak girin; kaldırmak için yok yazın.');
      patch[key] = [...new Set(value.match(/\d{17,20}/g))];
    }
    const donor = interaction.options.getUser('bağışçı'); if (donor) patch.donorId = donor.id;
    const image = interaction.options.getAttachment('görsel'); if (image) patch.imageUrl = image.url;
    const channel = interaction.options.getChannel('kanal'); if (channel) patch.channelId = channel.id;
    const role = interaction.options.getRole('bonus-rol'); const amount = interaction.options.getInteger('bonus-miktar');
    const bonuses = interaction.options.getString('bonus-roller');
    if (bonuses !== null) {
      if (role || amount !== null) throw new RangeError('Bonus listesiyle bonus-rol / bonus-miktar seçeneklerini birlikte kullanmayın.');
      patch.bonusRoles = bonuses.trim().toLocaleLowerCase('tr-TR') === 'yok' ? [] : bonuses.split(',').map(value => {
        const match = value.trim().match(/^(?:<@&(\d{17,20})>|(\d{17,20}))\s*:\s*(\d+)$/);
        if (!match) throw new RangeError('Bonus formatı: RolID:2, RolID:5');
        return { roleId: match[1] || match[2], amount: Number(match[3]) };
      });
    } else if (role || amount !== null) {
      if (!role && state.input.bonusRoles.length !== 1) throw new RangeError('Bonus miktarı için bir bonus rolü seçin.');
      patch.bonusRoles = [{ roleId: role?.id || state.input.bonusRoles[0].roleId, amount: amount ?? state.input.bonusRoles.find(b => b.roleId === role?.id)?.amount ?? 1 }];
    }
    const requirement = interaction.options.getString('mesaj-şartı');
    if (requirement !== null) {
      if (requirement.trim().toLocaleLowerCase('tr-TR') === 'yok') patch.messageCount = 0;
      else {
        const parsed = api.parseMessageRequirement(requirement);
        if (!parsed || !parsed.amount || !parsed.cooldownMs) throw new RangeError('Mesaj şartı formatı: 5 #genel 10m');
        Object.assign(patch, { messageCount: parsed.amount, messageChannelId: parsed.channelId, messageWindowSeconds: parsed.cooldownMs / 1000 });
      }
    }
    const clearable = { 'bağışçı': ['donorId', null], 'görsel': ['imageUrl', null], 'mesaj': ['message', ''], 'ekstra': ['extra', ''], 'açıklama': ['description', ''], 'gerekli-roller': ['requiredRoles', []], 'yasaklı-roller': ['blacklistedRoles', []], 'bypass-roller': ['bypassRoles', []], 'bonus-rol': ['bonusRoles', []], 'mesaj-şartı': ['messageCount', 0] };
    const clear = interaction.options.getString('temizle');
    for (const name of clear ? clear.split(',').map(v => v.trim().toLocaleLowerCase('tr-TR')) : []) {
      if (!Object.hasOwn(clearable, name)) throw new RangeError(`Temizlenebilen alanlar: ${Object.keys(clearable).join(', ')}`);
      const [key, value] = clearable[name];
      if (Object.hasOwn(patch, key)) throw new RangeError('Aynı alanı hem değiştirmeyin hem temizlemeyin.');
      patch[key] = value;
    }
    const result = await api.editGiveawayById(client, interaction.guild, id, patch, { recordRevision: state.recordRevision, member: interaction.member });
    return interaction.editReply({ content: `${emojiler.tik} Çekiliş (\`${id}\`) **düzenlendi.** Bitiş: <t:${Math.floor(result.cekilis.endTime / 1000)}:f>.`, allowedMentions: { parse: [] } });
  } catch (error) {
    return interaction.editReply({ content: error instanceof RangeError ? error.message : `${emojiler.carpi} **Çekiliş güncellenemedi. Discord bağlantısını ve botun izinlerini kontrol edin.**`, allowedMentions: { parse: [] } });
  }
}

module.exports = { editSubcommand, executeEdit };
