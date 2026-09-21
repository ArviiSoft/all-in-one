const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const emojiler = require("../../Utils/Emojis/emojiler.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ship')
    .setDescription('İki kişiyi eşleştirir.')
    .addUserOption(option =>
      option.setName('kişi')
        .setDescription('Kişi seç..')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    const selectedUser = interaction.options.getUser('kişi');
    const member1 = selectedUser || interaction.user;
    const guild = interaction.guild;
    const cachedCandidates = guild.members.cache.filter(
      member => member.user.id !== member1.id && !member.user.bot
    );
    const member2 = selectedUser ? interaction.user : cachedCandidates.random()?.user;

    if (!member2) {
      return interaction.editReply(`${emojiler.uyari} **Sunucuda eşleştirilecek başka kişi bulunamadı.**`);
    }

    const score = Math.floor(Math.random() * 101);
    const comment = getLoveComment(score);
    const shipName = generateShipName(member1.username, member2.username);

    const avatar1 = await loadImage(member1.displayAvatarURL({ extension: 'png', size: 128 }));
    const avatar2 = await loadImage(member2.displayAvatarURL({ extension: 'png', size: 128 }));

    const canvas = renderShipCard({
      avatar1,
      avatar2,
      name1: member1.username,
      name2: member2.username,
      score
    });

    const buffer = canvas.toBuffer('image/png');
    const attachment = new AttachmentBuilder(buffer, { name: 'ship.png' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('tanis')
        .setLabel('Tanış')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🤝')
    );

    const replyMessage = await interaction.editReply({
      content: `[ **・ <@${member1.id}>**  & **・<@${member2.id}>** ] \n*${comment}* \n\n👶 Bebeğinizin İsmi: **${shipName}**`,
      files: [attachment],
      components: [row]
    });

    const collector = replyMessage.createMessageComponentCollector({
      time: 120_000
    });

    collector.on('collect', async i => {
      try {
        if (i.customId !== 'tanis') return;

        if (i.user.id !== interaction.user.id) {
          return i.reply({
            content: `${emojiler.uyari} **Bu butonu sadece komutu kullanan kişi kullanabilir.**`,
            flags: 64
          });
        }

        await i.deferUpdate();

        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('tanis')
            .setLabel('Tanışma isteği gönderildi')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(emojiler.mutlupanda)
            .setDisabled(true)
        );

        await replyMessage.edit({ components: [disabledRow] });

        const actionRow = createDecisionRow();
        const followUpMessage = await i.followUp({
          content: `**<@${member2.id}>** seninle tanışmak istiyor **<@${member1.id}>**`,
          components: [actionRow],
          fetchReply: true
        });

        const followUpCollector = followUpMessage.createMessageComponentCollector({
          time: 120_000
        });

        followUpCollector.on('collect', async i2 => {
          try {
            if (i2.user.id !== member1.id) {
              return i2.reply({
                content: `${emojiler.uyari} **Bu butonu sadece tanışmak istenilen kişi kullanabilir.**`,
                flags: 64
              });
            }

            if (i2.customId === 'accept') {
              await i2.update({
                content: `<@${member1.id}> Tanışma isteğini **kabul etti.**`,
                components: []
              });

              await Promise.all([
                sendShipDm(
                  i2.user,
                  `<@${member2.id}> ile tanışmayı **kabul ettin!**`,
                  'İsteği kabul eden kullanıcı'
                ),
                sendShipDm(
                  interaction.user,
                  `<@${member1.id}> tanışma isteğini **kabul etti!**`,
                  'Tanışma isteğini gönderen kullanıcı'
                )
              ]);

              followUpCollector.stop('answered');
              return;
            }

            if (i2.customId === 'reject') {
              await i2.update({
                content: `<@${member1.id}> Tanışma isteğini **reddetti.**`,
                components: []
              });
              followUpCollector.stop('answered');
            }
          } catch (error) {
            console.error('🔴 [SHIP] Tanışma yanıtı işlenemedi:', error);
            await replyToComponentError(i2);
          }
        });

        followUpCollector.on('end', async (_, reason) => {
          if (reason !== 'time') return;

          await followUpMessage.edit({
            components: [createDecisionRow(true)]
          }).catch(() => null);
        });

        collector.stop('request-sent');
      } catch (error) {
        console.error('🔴 [SHIP] Tanışma isteği gönderilemedi:', error);
        await replyToComponentError(i);
      }
    });

    collector.on('end', async (_, reason) => {
      if (reason !== 'time') return;

      const expiredRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('tanis')
          .setLabel('Tanışma süresi doldu')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⌛')
          .setDisabled(true)
      );

      await replyMessage.edit({ components: [expiredRow] }).catch(() => null);
    });
  }
};

function createDecisionRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('accept')
      .setLabel(disabled ? 'İstek zaman aşımına uğradı' : 'Kabul Et')
      .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setEmoji(emojiler.tik)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('reject')
      .setLabel('Reddet')
      .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Danger)
      .setEmoji(emojiler.carpi)
      .setDisabled(disabled)
  );
}

async function sendShipDm(user, content, recipientLabel) {
  try {
    await user.send(content);
    return true;
  } catch (error) {
    const errorCode = error?.code ? ` (${error.code})` : '';
    console.warn(`⚠️ [SHIP] ${recipientLabel} için DM gönderilemedi${errorCode}.`);
    return false;
  }
}

async function replyToComponentError(interaction) {
  const payload = {
    content: `${emojiler.uyari} **İşlem sırasında hata oluştu, tekrar dene.**`,
    flags: 64
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => null);
    return;
  }

  await interaction.reply(payload).catch(() => null);
}

function getLoveComment(score) {
  if (score > 90) return "Ruh eşleri gibiyiz! 💍";
  if (score > 75) return "Aramızda gerçek bir kıvılcım var! 🔥";
  if (score > 50) return "Belli ki bir şeyler olabilir 👀";
  if (score > 25) return "Yani... belki? 🤷‍♂️";
  return "Hmm... arkadaş kalsak daha iyi 😅";
}

function generateShipName(name1, name2) {
  const half1 = name1.slice(0, Math.floor(name1.length / 2));
  const half2 = name2.slice(Math.floor(name2.length / 2));
  return (half1 + half2).replace(/\s+/g, '');
}

function renderShipCard({ avatar1, avatar2, name1, name2, score }) {
  const canvas = createCanvas(900, 420);
  const ctx = canvas.getContext('2d');

  const background = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, '#18091f');
  background.addColorStop(0.48, '#3d102f');
  background.addColorStop(1, '#16091f');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawGlow(ctx, 115, 70, 230, 'rgba(255, 72, 142, 0.20)');
  drawGlow(ctx, 790, 330, 250, 'rgba(169, 76, 255, 0.18)');
  drawGlow(ctx, 455, 200, 190, 'rgba(255, 92, 143, 0.13)');

  const sparkles = [
    [55, 62, 3], [101, 326, 2], [154, 35, 2], [246, 93, 2],
    [318, 42, 3], [580, 48, 2], [657, 92, 3], [747, 46, 2],
    [836, 98, 3], [806, 337, 2], [615, 371, 2], [292, 360, 2]
  ];
  for (const [x, y, radius] of sparkles) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = radius === 3 ? 'rgba(255, 183, 213, 0.60)' : 'rgba(255, 255, 255, 0.38)';
    ctx.fill();
  }

  drawSmallHeart(ctx, 83, 185, 13, 'rgba(255, 117, 167, 0.35)', -0.28);
  drawSmallHeart(ctx, 822, 207, 11, 'rgba(212, 139, 255, 0.32)', 0.25);
  drawSmallHeart(ctx, 758, 372, 8, 'rgba(255, 117, 167, 0.28)', -0.15);
  drawSmallHeart(ctx, 138, 367, 7, 'rgba(255, 184, 211, 0.24)', 0.2);

  ctx.save();
  roundedRectPath(ctx, 26, 24, 848, 372, 30);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 184, 216, 0.16)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffeaf3';
  ctx.font = '700 24px "Noto Sans", sans-serif';
  ctx.fillText('BİR AŞK HİKÂYESİ', 450, 66);
  ctx.fillStyle = 'rgba(255, 221, 235, 0.68)';
  ctx.font = '500 14px "Noto Sans", sans-serif';
  ctx.fillText('Kalpler aynı ritimde mi?', 450, 91);

  drawConnection(ctx, 265, 202, 635, 202);
  drawAvatar(ctx, avatar1, 188, 202, 142);
  drawAvatar(ctx, avatar2, 712, 202, 142);

  drawMainHeart(ctx, 450, 190, 84);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 30px "Noto Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`%${score}`, 450, 188);
  ctx.textBaseline = 'alphabetic';

  drawName(ctx, name1, 188, 302);
  drawName(ctx, name2, 712, 302);

  ctx.fillStyle = 'rgba(255, 235, 243, 0.76)';
  ctx.font = '600 12px "Noto Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('KALP UYUMU', 160, 351);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffb5d1';
  ctx.fillText(`%${score}`, 740, 351);

  roundedRectPath(ctx, 160, 362, 580, 12, 6);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.fill();

  if (score > 0) {
    const progressWidth = Math.max(12, 580 * (score / 100));
    const progress = ctx.createLinearGradient(160, 0, 740, 0);
    progress.addColorStop(0, '#ff4f91');
    progress.addColorStop(0.55, '#ff74ad');
    progress.addColorStop(1, '#d779ff');
    roundedRectPath(ctx, 160, 362, progressWidth, 12, 6);
    ctx.fillStyle = progress;
    ctx.shadowColor = 'rgba(255, 83, 151, 0.65)';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  return canvas;
}

function drawAvatar(ctx, image, centerX, centerY, size) {
  const radius = size / 2;
  const ring = ctx.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
  ring.addColorStop(0, '#ff94bd');
  ring.addColorStop(0.5, '#ff4f91');
  ring.addColorStop(1, '#b86cff');

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 9, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.shadowColor = 'rgba(255, 76, 146, 0.55)';
  ctx.shadowBlur = 24;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 4, 0, Math.PI * 2);
  ctx.fillStyle = '#241126';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(image, centerX - radius, centerY - radius, size, size);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawConnection(ctx, startX, startY, endX, endY) {
  const line = ctx.createLinearGradient(startX, 0, endX, 0);
  line.addColorStop(0, 'rgba(255, 96, 153, 0.25)');
  line.addColorStop(0.5, 'rgba(255, 170, 205, 0.90)');
  line.addColorStop(1, 'rgba(202, 112, 255, 0.25)');

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.bezierCurveTo(340, 160, 560, 244, endX, endY);
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  ctx.setLineDash([7, 9]);
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(255, 105, 164, 0.45)';
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.restore();
}

function drawMainHeart(ctx, centerX, centerY, size) {
  ctx.save();
  ctx.translate(centerX, centerY);
  const gradient = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
  gradient.addColorStop(0, '#ff7daf');
  gradient.addColorStop(0.5, '#ff3f83');
  gradient.addColorStop(1, '#d85aff');
  heartPath(ctx, size);
  ctx.fillStyle = gradient;
  ctx.shadowColor = 'rgba(255, 58, 132, 0.72)';
  ctx.shadowBlur = 32;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawSmallHeart(ctx, x, y, size, color, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  heartPath(ctx, size);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function heartPath(ctx, size) {
  const half = size / 2;
  ctx.beginPath();
  ctx.moveTo(0, half * 0.82);
  ctx.bezierCurveTo(-half * 1.12, half * 0.18, -half * 1.08, -half * 0.62, -half * 0.52, -half * 0.78);
  ctx.bezierCurveTo(-half * 0.18, -half * 0.88, 0, -half * 0.60, 0, -half * 0.42);
  ctx.bezierCurveTo(0, -half * 0.60, half * 0.18, -half * 0.88, half * 0.52, -half * 0.78);
  ctx.bezierCurveTo(half * 1.08, -half * 0.62, half * 1.12, half * 0.18, 0, half * 0.82);
  ctx.closePath();
}

function drawGlow(ctx, x, y, radius, color) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, color);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawName(ctx, name, x, y) {
  ctx.textAlign = 'center';
  ctx.font = '700 19px "Noto Sans", sans-serif';
  ctx.fillStyle = '#fff3f8';
  ctx.fillText(fitText(ctx, `@${name}`, 210), x, y);
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let shortened = text;
  while (shortened.length > 1 && ctx.measureText(`${shortened}…`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}
