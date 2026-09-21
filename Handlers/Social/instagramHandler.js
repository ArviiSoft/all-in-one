const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('../../Utils/Core/databaseFs');
const path = require('path');
const emojiler = require('../../Utils/Emojis/emojiler.js');
const { buildInstagramCommentsView } = require('../../Utils/Media/instagramCommentsView.js');

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

module.exports = async function instagramHandler(interaction) {
  const [action, instagramReference] = interaction.customId.split(/_(.+)/);
  const [instagramId, panelOwnerId, requestedPage = '0'] = instagramReference.split(':');
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

  if (action === 'instagramlike') {
    const wasLiked = instagram.users[userId].liked;
    instagram.likes = Math.max(0, (Number(instagram.likes) || 0) + (wasLiked ? -1 : 1));
    instagram.users[userId].liked = !wasLiked;
    await interaction.reply({
      content: instagram.users[userId].liked
        ? '❤️ Gönderiyi **beğendin.**'
        : '♻️ Beğeni **geri çekildi.**',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (action === 'instagramcomment') {
    if (instagram.users[userId].commented) {
      return interaction.reply({
        content: `${emojiler.uyari} **Zaten yorum yapmışsın.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`instagramcomment_modal_${instagramId}`)
      .setTitle('Yorum Yap')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('comment_text')
            .setLabel('Yorumun')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(280)
            .setRequired(true)
        )
      );

    return interaction.showModal(modal);
  }

  if (action === 'instagramshowcomments') {
    if (panelOwnerId && panelOwnerId !== userId) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu yorum paneli sana ait değil.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const view = buildInstagramCommentsView({
      instagram,
      instagramId,
      ownerId: panelOwnerId || userId,
      page: requestedPage,
    });
    const payload = {
      components: view.components,
      allowedMentions: { parse: [] },
    };

    if (panelOwnerId) return interaction.update(payload);

    return interaction.reply({
      ...payload,
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  data[instagramId] = instagram;
  veriYaz(data);

  if (interaction.message) {
    const components = buildPostComponents(
      instagram,
      instagramId,
      interaction.message.components
    );
    await interaction.message.edit({ components });
  }
};
