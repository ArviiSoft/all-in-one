const { AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('../Core/databaseFs');
const path = require('path');
const statsPath = path.join(__dirname, '../../Database/Abonelik/aboneStats.json');
const emojiler = require("../Emojis/emojiler.js");

function readStats() {
  if (!fs.existsSync(statsPath)) return {};
  return JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
}

async function executeLeaderboard(interaction) {
    await interaction.deferReply();

    const stats = readStats();
    const guildStats = stats[interaction.guild.id];

    if (!guildStats || Object.keys(guildStats).length === 0) {
        return interaction.editReply({ content: `${emojiler.uyari} **Henüz kaydedilmiş bir veri bulunamadı.**` });
    }

    const sorted = Object.entries(guildStats)
        .map(([userId, count]) => [userId, Number(count) || 0])
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

    const width = 900;
    const listTop = 286;
    const rowHeight = 104;
    const rowGap = 14;
    const footerHeight = 78;
    const height = listTop + (sorted.length * (rowHeight + rowGap)) - rowGap + footerHeight;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#07111f');
    background.addColorStop(0.5, '#0b172a');
    background.addColorStop(1, '#101d33');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    const topGlow = ctx.createRadialGradient(760, 10, 0, 760, 10, 360);
    topGlow.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
    topGlow.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(400, 0, 500, 370);

    const sideGlow = ctx.createRadialGradient(40, height - 100, 0, 40, height - 100, 280);
    sideGlow.addColorStop(0, 'rgba(99, 102, 241, 0.12)');
    sideGlow.addColorStop(1, 'rgba(99, 102, 241, 0)');
    ctx.fillStyle = sideGlow;
    ctx.fillRect(0, Math.max(0, height - 380), 360, 380);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('Abone Liderlik Tablosu', 48, 124);

    const allCounts = Object.values(guildStats).map(count => Number(count) || 0);
    const totalCount = allCounts.reduce((total, count) => total + count, 0);
    const numberFormatter = new Intl.NumberFormat('tr-TR');

    const statCards = [
        { label: 'TOPLAM ABONE', value: numberFormatter.format(totalCount), accent: '#38bdf8' },
        { label: 'AKTİF YETKİLİ', value: numberFormatter.format(Object.keys(guildStats).length), accent: '#a78bfa' }
    ];

    statCards.forEach((card, index) => {
        const cardX = 602 + (index * 126);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
        ctx.beginPath();
        ctx.roundRect(cardX, 42, 112, 116, 20);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = card.accent;
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(card.value, cardX + 56, 91);
        ctx.fillStyle = '#7f93ad';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(card.label, cardX + 56, 123);
    });

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(48, 204);
    ctx.lineTo(852, 204);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SIRA  /  YETKİLİ', 64, 250);
    ctx.textAlign = 'right';
    ctx.fillText('PERFORMANS  /  ABONE', 836, 250);

    const leaderboardRows = await Promise.all(sorted.map(async ([userId, count]) => {
        const user = await interaction.client.users.fetch(userId).catch(() => null);
        const avatar = user
            ? await loadImage(user.displayAvatarURL({ extension: 'png', size: 128 })).catch(() => null)
            : null;

        return {
            count,
            avatar,
            name: user ? (user.globalName || user.username) : 'Bilinmeyen Yetkili'
        };
    }));

    const rankColors = ['#fbbf24', '#cbd5e1', '#fb923c'];
    const maxCount = Math.max(leaderboardRows[0]?.count || 0, 1);

    for (let i = 0; i < leaderboardRows.length; i++) {
        const { name, count, avatar } = leaderboardRows[i];
        const rowY = listTop + (i * (rowHeight + rowGap));
        const accent = rankColors[i] || '#38bdf8';
        const rowGradient = ctx.createLinearGradient(48, rowY, 852, rowY);
        rowGradient.addColorStop(0, i < 3 ? `${accent}18` : 'rgba(255, 255, 255, 0.055)');
        rowGradient.addColorStop(1, 'rgba(255, 255, 255, 0.035)');
        ctx.fillStyle = rowGradient;
        ctx.beginPath();
        ctx.roundRect(48, rowY, 804, rowHeight, 22);
        ctx.fill();
        ctx.strokeStyle = i < 3 ? `${accent}32` : 'rgba(255, 255, 255, 0.055)';
        ctx.stroke();

        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.roundRect(48, rowY + 25, 4, 54, 2);
        ctx.fill();

        ctx.fillStyle = i < 3 ? `${accent}20` : 'rgba(56, 189, 248, 0.1)';
        ctx.beginPath();
        ctx.arc(88, rowY + 52, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = accent;
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1).padStart(2, '0'), 88, rowY + 59);

        ctx.save();
        ctx.beginPath();
        ctx.arc(148, rowY + 52, 31, 0, Math.PI * 2);
        ctx.clip();
        if (avatar) {
            ctx.drawImage(avatar, 117, rowY + 21, 62, 62);
        } else {
            ctx.fillStyle = '#1e3a5f';
            ctx.fillRect(117, rowY + 21, 62, 62);
            ctx.fillStyle = '#bae6fd';
            ctx.font = 'bold 25px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(name.charAt(0).toLocaleUpperCase('tr-TR'), 148, rowY + 61);
        }
        ctx.restore();
        ctx.strokeStyle = `${accent}90`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(148, rowY + 52, 33, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#f1f5f9';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'left';
        const displayName = name.length > 24 ? `${name.slice(0, 23)}…` : name;
        ctx.fillText(displayName, 198, rowY + 43);
        ctx.fillStyle = '#71849e';
        ctx.font = '13px sans-serif';
        ctx.fillText(i === 0 ? 'Lider yetkili' : 'Abone yetkilisi', 198, rowY + 66);

        const progress = Math.max(0, Math.min(count / maxCount, 1));
        ctx.fillStyle = 'rgba(148, 163, 184, 0.13)';
        ctx.beginPath();
        ctx.roundRect(382, rowY + 49, 238, 7, 4);
        ctx.fill();
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.roundRect(382, rowY + 49, Math.max(7, 238 * progress), 7, 4);
        ctx.fill();

        ctx.fillStyle = `${accent}18`;
        ctx.beginPath();
        ctx.roundRect(666, rowY + 28, 150, 48, 16);
        ctx.fill();
        ctx.fillStyle = accent;
        ctx.font = 'bold 21px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(numberFormatter.format(count), 711, rowY + 59);
        ctx.fillStyle = '#8294aa';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('ABONE', 774, rowY + 57);
    }

    const footerY = height - 39;
    ctx.fillStyle = '#60738d';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    const guildName = interaction.guild.name.length > 38
        ? `${interaction.guild.name.slice(0, 37)}…`
        : interaction.guild.name;
    ctx.fillText(`${guildName}  •  İlk 10 yetkili`, 48, footerY);
    ctx.textAlign = 'right';
    ctx.fillText('Veriler komut çalıştırıldığında güncellenir', 852, footerY);

    const attachment = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'siralamatablo.png' });
    return interaction.editReply({ files: [attachment] });
}

module.exports = { executeLeaderboard };
