const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('../../Utils/Core/databaseFs');
const path = require('path');
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { buildTwitterCommentsView } = require('../../Utils/Media/twitterCommentsView.js');

const veriYolu = path.join(__dirname, '../../Database/Bildirimler ve Sosyal Medya/twitter.json');

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

module.exports = async function tweetHandler(interaction) {
  const [action, tweetReference] = interaction.customId.split(/_(.+)/);
  const [tweetId, panelOwnerId, requestedPage = '0'] = tweetReference.split(':');
  const data = veriOku();
  const tweet = data[tweetId];
  const userId = interaction.user.id;

  if (!tweet)
    return interaction.reply({
      content: `${emojiler.uyari} **Tweet bulunamadı.**`,
      flags: 64
    });

  if (!tweet.users) tweet.users = {};
  if (!tweet.users[userId])
    tweet.users[userId] = { liked: false, retweeted: false, commented: false };

  if (action === 'like') {
    tweet.users[userId].liked ? tweet.likes-- : tweet.likes++;
    tweet.users[userId].liked = !tweet.users[userId].liked;
    await interaction.reply({
      content: tweet.users[userId].liked
        ? '❤️ Tweeti **beğendin.**'
        : '♻️ Beğeni **geri çekildi.**',
      flags: 64
    });
  }

  if (action === 'retweet') {
    tweet.users[userId].retweeted ? tweet.retweets-- : tweet.retweets++;
    tweet.users[userId].retweeted = !tweet.users[userId].retweeted;
    await interaction.reply({
      content: tweet.users[userId].retweeted
        ? '🔁 **Retweet** yaptın.'
        : '♻️ Retweet **geri çekildi.**',
      flags: 64
    });
  }

  if (action === 'comment') {
    if (tweet.users[userId].commented)
      return interaction.reply({
        content: `${emojiler.uyari} **Zaten yorum yapmışsın.**`,
        flags: 64
      });

    const modal = new ModalBuilder()
      .setCustomId(`comment_modal_${tweetId}`)
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

  if (action === 'showcomments') {
    if (panelOwnerId && panelOwnerId !== userId) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu yorum paneli sana ait değil.**`,
        flags: MessageFlags.Ephemeral
      });
    }

    const view = buildTwitterCommentsView({
      tweet,
      tweetId,
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

  data[tweetId] = tweet;
  veriYaz(data);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`like_${tweetId}`)
      .setLabel(`❤️ Beğeni: ${tweet.likes}`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`retweet_${tweetId}`)
      .setLabel(`🔁 Retweet: ${tweet.retweets}`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`comment_${tweetId}`)
      .setLabel(`💬 Yorum: ${tweet.comments}`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`showcomments_${tweetId}`)
      .setLabel('Yorumları Göster')
      .setStyle(ButtonStyle.Primary)
  );

  if (interaction.message)
    await interaction.message.edit({ components: [buttons] });
};
