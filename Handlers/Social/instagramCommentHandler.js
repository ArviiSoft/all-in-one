const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('../../Utils/Core/databaseFs');
const path = require('path');
const emojiler = require('../../Utils/Emojis/emojiler.js');

const veriYolu = path.join(__dirname, '../../Database/Bildirimler ve Sosyal Medya/instagram.json');

function veriOku() {
  if (!fs.existsSync(veriYolu)) return {};
  try {
    return JSON.parse(fs.readFileSync(veriYolu, 'utf8'));
  } catch {
    return {};
  }
}

function veriYaz(data) {
  fs.writeFileSync(veriYolu, JSON.stringify(data, null, 2));
}

function isInstagramUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname.toLowerCase().replace(/^www\./, '') === 'instagram.com';
  } catch {
    return false;
  }
}

function buildPostComponents(instagram, instagramId, messageComponents = []) {
  const buttonsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`instagramlike_${instagramId}`)
      .setLabel(`❤️ Beğeni: ${Number(instagram.likes) || 0}`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`instagramcomment_${instagramId}`)
      .setLabel(`💬 Yorum: ${Number(instagram.comments) || 0}`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`instagramshowcomments_${instagramId}`)
      .setLabel('Yorumları Göster')
      .setStyle(ButtonStyle.Primary)
  );
  const components = [buttonsRow];
  const oldLinkRow = messageComponents.find(row =>
    row.components?.some(component => component.style === ButtonStyle.Link)
  );

  if (oldLinkRow) {
    components.push(oldLinkRow);
  } else if (isInstagramUrl(instagram.instagramUrl)) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Instagram Profili')
          .setStyle(ButtonStyle.Link)
          .setEmoji(emojiler.instagram2)
          .setURL(instagram.instagramUrl)
      )
    );
  }

  return components;
}

module.exports = async function instagramCommentHandler(interaction) {
  const instagramId = interaction.customId.replace('instagramcomment_modal_', '');
  const data = veriOku();
  const instagram = data[instagramId];
  const userId = interaction.user.id;

  if (!instagram) {
    return interaction.reply({
      content: `${emojiler.uyari} **Gönderi bulunamadı.**`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!instagram.users) instagram.users = {};
  if (!instagram.users[userId]) {
    instagram.users[userId] = { liked: false, commented: false };
  }

  if (instagram.users[userId].commented) {
    return interaction.reply({
      content: `${emojiler.uyari} **Zaten yorum yapmışsın.**`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const name = interaction.member?.displayName
    || interaction.user.globalName
    || interaction.user.username;
  const comment = interaction.fields.getTextInputValue('comment_text').trim();
  const avatarURL = interaction.user.displayAvatarURL({
    forceStatic: true,
    extension: 'png',
    size: 128,
  });

  if (!comment) {
    return interaction.reply({
      content: `${emojiler.uyari} **Yorum boş bırakılamaz.**`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!instagram.yorumlar) instagram.yorumlar = [];
  instagram.yorumlar.push({
    name,
    comment,
    avatarURL,
    userId,
    createdAt: new Date().toISOString(),
  });
  instagram.comments = (Number(instagram.comments) || 0) + 1;
  instagram.users[userId].commented = true;

  data[instagramId] = instagram;
  veriYaz(data);

  await interaction.reply({
    content: `${emojiler.bulut} Yorum **yapıldı.**`,
    flags: MessageFlags.Ephemeral,
  });

  if (interaction.message) {
    const components = buildPostComponents(
      instagram,
      instagramId,
      interaction.message.components
    );
    await interaction.message.edit({ components });
  }
};
