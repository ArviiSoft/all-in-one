const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');
const fs = require('../../Utils/Core/databaseFs');
const path = require('path');
const emojiler = require('../../Utils/Emojis/emojiler.js');
const { requireEnabled, targetChannel } = require('../../Utils/Engagement/engagementSettings');
const pollTimers = new Map();
const finishing = new Map();

const dbPath = path.join(__dirname, '../../Database/Eğlence ve Etkileşim/oyYarismasi.json');
const MIN_SURE = 10 * 1000;
const MAX_SURE = 30 * 24 * 60 * 60 * 1000;
const MAX_TIMEOUT = 2_147_000_000;
const SECENEK_EMOJILERI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
const SECENEK_OPTION_ADLARI = ['seçenek-1', 'seçenek-2', 'seçenek-3', 'seçenek-4', 'seçenek-5'];
const FONT_FAMILY = '"Google Sans", "Product Sans", "Noto Sans", Arial, sans-serif';

const TEMALAR = {
  mor: { accent: '#8B5CF6', secondary: '#6366F1', color: 0x8B5CF6 },
  mavi: { accent: '#38BDF8', secondary: '#2563EB', color: 0x38BDF8 },
  yesil: { accent: '#34D399', secondary: '#059669', color: 0x34D399 },
  turuncu: { accent: '#FB923C', secondary: '#EA580C', color: 0xFB923C },
  pembe: { accent: '#F472B6', secondary: '#DB2777', color: 0xF472B6 },
};

function loadDB() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, '{}', 'utf8');

  try {
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch {
    return {};
  }
}

function saveDB(data) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

function parseSure(input) {
  const value = String(input || '5m').trim().toLocaleLowerCase('tr-TR');
  const tokenRegex = /(\d+)\s*(saniyeler|saniye|dakikalar|dakika|saatler|saat|günler|gunler|gün|gun|sn|dk|sa|s|m|h|g|d)/giu;
  const multipliers = {
    saniyeler: 1000,
    saniye: 1000,
    sn: 1000,
    s: 1000,
    dakikalar: 60_000,
    dakika: 60_000,
    dk: 60_000,
    m: 60_000,
    saatler: 3_600_000,
    saat: 3_600_000,
    sa: 3_600_000,
    h: 3_600_000,
    günler: 86_400_000,
    gunler: 86_400_000,
    gün: 86_400_000,
    gun: 86_400_000,
    g: 86_400_000,
    d: 86_400_000,
  };

  let total = 0;
  let lastIndex = 0;
  let tokenCount = 0;
  let match;

  while ((match = tokenRegex.exec(value)) !== null) {
    if (value.slice(lastIndex, match.index).trim()) return null;

    total += Number(match[1]) * multipliers[match[2]];
    lastIndex = tokenRegex.lastIndex;
    tokenCount += 1;
  }

  if (!tokenCount || value.slice(lastIndex).trim()) return null;
  if (!Number.isSafeInteger(total) || total < MIN_SURE || total > MAX_SURE) return null;
  return total;
}

function formatSure(ms) {
  let seconds = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(seconds / 86_400);
  seconds %= 86_400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;

  const parts = [];
  if (days) parts.push(`${days} gün`);
  if (hours) parts.push(`${hours} sa`);
  if (minutes) parts.push(`${minutes} dk`);
  if (seconds || parts.length === 0) parts.push(`${seconds} sn`);
  return parts.slice(0, 2).join(' ');
}

function findForbiddenMention(value) {
  if (/<@&\d+>|@(everyone|here)/iu.test(value)) return 'role';
  if (/<@!?\d+>/u.test(value)) return 'user';
  return null;
}

function cleanText(value) {
  return String(value || '').trim().replace(/\s+/gu, ' ');
}

function normalizePoll(yarisma) {
  if (Array.isArray(yarisma.secenekler) && Array.isArray(yarisma.oylar)) return yarisma;

  return {
    ...yarisma,
    version: 2,
    baslik: yarisma.baslik || 'Oy Yarışması',
    aciklama: yarisma.aciklama || '',
    tema: yarisma.tema || 'mor',
    secenekler: [yarisma.secenekA, yarisma.secenekB].filter(Boolean),
    oylar: [yarisma.oylar?.a || [], yarisma.oylar?.b || []],
    revision: Number(yarisma.revision) || 0,
  };
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, width, height, radius, fillStyle) {
  roundRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function font(size, weight = 400) {
  return `${weight} ${size}px ${FONT_FAMILY}`;
}

function drawModernBackground(ctx, width, height, theme) {
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#070A13');
  background.addColorStop(0.38, '#111225');
  background.addColorStop(0.72, '#091722');
  background.addColorStop(1, '#080A12');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const topGlow = ctx.createRadialGradient(width * 0.83, 45, 10, width * 0.83, 45, width * 0.42);
  topGlow.addColorStop(0, `${theme.accent}38`);
  topGlow.addColorStop(0.48, `${theme.accent}16`);
  topGlow.addColorStop(1, `${theme.accent}00`);
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, width, height);

  const bottomGlow = ctx.createRadialGradient(90, height * 0.9, 10, 90, height * 0.9, width * 0.38);
  bottomGlow.addColorStop(0, `${theme.secondary}24`);
  bottomGlow.addColorStop(0.55, `${theme.secondary}0D`);
  bottomGlow.addColorStop(1, `${theme.secondary}00`);
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.filter = 'blur(44px)';
  ctx.globalAlpha = 0.3;
  ctx.translate(width * 0.78, height * 0.08);
  ctx.rotate(-0.28);
  fillRoundRect(ctx, 0, 0, 410, 118, 59, `${theme.accent}26`);
  ctx.restore();

  ctx.save();
  ctx.filter = 'blur(58px)';
  ctx.globalAlpha = 0.2;
  ctx.translate(-110, height * 0.58);
  ctx.rotate(0.22);
  fillRoundRect(ctx, 0, 0, 460, 150, 75, `${theme.secondary}24`);
  ctx.restore();

  const vignette = ctx.createRadialGradient(width / 2, height * 0.42, 120, width / 2, height * 0.42, width * 0.72);
  vignette.addColorStop(0, 'rgba(4, 7, 15, 0)');
  vignette.addColorStop(0.72, 'rgba(4, 7, 15, 0.08)');
  vignette.addColorStop(1, 'rgba(2, 4, 10, 0.42)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  for (let index = 0; index < 620; index += 1) {
    const x = (index * 83 + 47) % width;
    const y = (index * 197 + 31) % height;
    const alpha = 0.018 + ((index * 17) % 6) * 0.004;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
}

function ellipsize(ctx, text, maxWidth) {
  const characters = Array.from(String(text));
  if (ctx.measureText(characters.join('')).width <= maxWidth) return characters.join('');

  while (characters.length && ctx.measureText(`${characters.join('')}…`).width > maxWidth) {
    characters.pop();
  }
  return `${characters.join('')}…`;
}

function getResult(yarisma) {
  const counts = yarisma.oylar.map((votes) => votes.length);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const max = Math.max(...counts, 0);
  const winners = total > 0
    ? counts.map((count, index) => (count === max ? index : -1)).filter((index) => index >= 0)
    : [];
  return { counts, total, winners };
}

function renderPollCanvas(rawYarisma, ended = false) {
  const yarisma = normalizePoll(rawYarisma);
  const theme = TEMALAR[yarisma.tema] || TEMALAR.mor;
  const { counts, total, winners } = getResult(yarisma);
  const width = 1200;
  const cardHeight = 116;
  const cardGap = 18;
  const cardsTop = 290;
  const height = cardsTop + (yarisma.secenekler.length * (cardHeight + cardGap)) + 76;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  drawModernBackground(ctx, width, height, theme);

  const badgeText = ended ? 'SONUÇLANDI' : 'CANLI OYLAMA';
  ctx.font = font(20, 700);
  const badgeWidth = ctx.measureText(badgeText).width + 58;
  fillRoundRect(ctx, 70, 52, badgeWidth, 42, 21, `${theme.accent}26`);
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(92, 73, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#F5F7FF';
  ctx.fillText(badgeText, 108, 81);

  ctx.font = font(52, 700);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(ellipsize(ctx, yarisma.baslik || 'Oy Yarışması', 1060), 70, 158);

  ctx.font = font(23, 400);
  ctx.fillStyle = '#A7B0C8';
  const description = yarisma.aciklama || 'Favori seçeneğini belirle, oyunu kullan ve sonucu canlı takip et.';
  ctx.fillText(ellipsize(ctx, description, 1060), 70, 201);

  const statusText = ended
    ? (total === 0 ? 'Oy kullanılmadı' : winners.length > 1 ? 'Yarışma berabere bitti' : `Kazanan: ${yarisma.secenekler[winners[0]]}`)
    : `${formatSure(yarisma.bitis - Date.now())} kaldı`;
  const metaText = `${total} oy  •  ${yarisma.secenekler.length} seçenek`;

  ctx.font = font(21, 600);
  fillRoundRect(ctx, 70, 226, 290, 42, 12, '#FFFFFF0D');
  ctx.fillStyle = ended ? '#E8ECF8' : theme.accent;
  ctx.fillText(ellipsize(ctx, statusText, 250), 90, 254);
  fillRoundRect(ctx, 374, 226, 250, 42, 12, '#FFFFFF0D');
  ctx.fillStyle = '#CBD2E4';
  ctx.fillText(metaText, 394, 254);

  yarisma.secenekler.forEach((secenek, index) => {
    const y = cardsTop + index * (cardHeight + cardGap);
    const count = counts[index];
    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
    const isWinner = ended && winners.includes(index);

    fillRoundRect(ctx, 70, y, 1060, cardHeight, 22, isWinner ? `${theme.accent}20` : '#FFFFFF0A');
    ctx.strokeStyle = isWinner ? theme.accent : '#FFFFFF14';
    ctx.lineWidth = isWinner ? 2 : 1;
    roundRect(ctx, 70, y, 1060, cardHeight, 22);
    ctx.stroke();

    const numberGradient = ctx.createLinearGradient(92, y + 29, 146, y + 83);
    numberGradient.addColorStop(0, theme.accent);
    numberGradient.addColorStop(1, theme.secondary);
    ctx.fillStyle = numberGradient;
    ctx.beginPath();
    ctx.arc(119, y + 58, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = font(24, 700);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(String(index + 1), 119, y + 66);

    ctx.textAlign = 'left';
    ctx.font = font(27, 700);
    ctx.fillStyle = '#F5F7FF';
    ctx.fillText(ellipsize(ctx, secenek, 720), 166, y + 46);
    ctx.font = font(22, 600);
    ctx.textAlign = 'right';
    ctx.fillStyle = isWinner ? theme.accent : '#D7DCEC';
    ctx.fillText(`${count} oy  •  %${percentage}`, 1094, y + 46);

    const barX = 166;
    const barY = y + 72;
    const barWidth = 928;
    fillRoundRect(ctx, barX, barY, barWidth, 12, 6, '#FFFFFF12');
    if (percentage > 0) {
      const progress = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
      progress.addColorStop(0, theme.accent);
      progress.addColorStop(1, theme.secondary);
      fillRoundRect(ctx, barX, barY, Math.max(12, barWidth * (percentage / 100)), 12, 6, progress);
    }
  });

  ctx.textAlign = 'left';
  ctx.font = font(19, 500);
  ctx.fillStyle = '#7F8AA7';
  const footer = ended
    ? 'Katılan herkese teşekkürler.'
    : 'Oy vermek veya oyunu değiştirmek için aşağıdaki butonları kullan.';
  ctx.fillText(footer, 70, height - 30);

  return canvas.toBuffer('image/png');
}

function truncateButtonLabel(text, maxLength = 60) {
  const characters = Array.from(text);
  return characters.length > maxLength
    ? `${characters.slice(0, maxLength - 1).join('')}…`
    : characters.join('');
}

function buildButtonRows(rawYarisma, messageId) {
  const yarisma = normalizePoll(rawYarisma);
  const buttons = yarisma.secenekler.map((secenek, index) => new ButtonBuilder()
    .setCustomId(`oy_sec_${index}_${messageId}`)
    .setLabel(truncateButtonLabel(`${secenek}`))
    .setEmoji(SECENEK_EMOJILERI[index])
    .setStyle(ButtonStyle.Primary));

  const rows = [];
  for (let index = 0; index < buttons.length; index += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(index, index + 5)));
  }
  return rows;
}

function buildPollPayload(rawYarisma, messageId, ended = false) {
  const yarisma = normalizePoll(rawYarisma);
  const fileName = `oy-yarismasi-${messageId}-${Number(yarisma.revision) || 0}${ended ? '-sonuc' : ''}.png`;
  const attachment = new AttachmentBuilder(renderPollCanvas(yarisma, ended), { name: fileName });

  return {
    content: null,
    embeds: [],
    components: ended ? [] : buildButtonRows(yarisma, messageId),
    files: [attachment],
    attachments: [],
    allowedMentions: { parse: [] },
  };
}

function parseVoteButton(customId) {
  const current = customId.match(/^oy_sec_(\d+)_(\d+)$/u);
  if (current) return { optionIndex: Number(current[1]), messageId: current[2] };

  const legacy = customId.match(/^oy_([ab])_(\d+)$/u);
  if (legacy) return { optionIndex: legacy[1] === 'a' ? 0 : 1, messageId: legacy[2] };
  return null;
}

async function finishPoll(client, messageId, force = false) {
  if (finishing.has(messageId)) return finishing.get(messageId);
  const operation = finishPollOnce(client, messageId, force);
  finishing.set(messageId, operation);
  try { return await operation; } finally { finishing.delete(messageId); }
}

async function finishPollOnce(client, messageId, force) {
  const db = loadDB();
  const storedPoll = db[messageId];
  if (!storedPoll) return;

  const yarisma = normalizePoll(storedPoll);
  const remaining = yarisma.bitis - Date.now();
  if (!force && remaining > 1000) {
    schedulePollFinish(client, messageId, remaining);
    return;
  }

  yarisma.revision = (Number(yarisma.revision) || 0) + 1;
  const channel = await client.channels.fetch(yarisma.kanalId).catch(() => null);
  const message = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;

  if (!message && force) throw new RangeError('Yarışma mesajı bulunamadı.');
  if (message) await message.edit(buildPollPayload(yarisma, messageId, true));
  clearTimeout(pollTimers.get(messageId)); pollTimers.delete(messageId);
  const current = loadDB(); delete current[messageId]; saveDB(current);
}

function schedulePollFinish(client, messageId, delay) {
  clearTimeout(pollTimers.get(messageId));
  const timer = setTimeout(() => {
    pollTimers.delete(messageId);
    finishPoll(client, messageId).catch((error) => {
      console.error('[OY YARIŞMASI] Yarışma sonlandırılamadı:', error);
      schedulePollFinish(client, messageId, 60000);
    });
  }, Math.min(Math.max(delay, 0), MAX_TIMEOUT));
  timer.unref?.(); pollTimers.set(messageId, timer);
}

async function startPoll(guild, fallbackChannelId, creatorId, input) {
  const config = requireEnabled(guild.id, 'oy-yarismasi');
  const options = (input.options || []).map(cleanText);
  if (options.length < 2 || options.length > 5 || options.some(v => !v || v.length > 70 || findForbiddenMention(v))) throw new RangeError('Etiket içermeyen, 1–70 karakter uzunluğunda 2–5 seçenek girin.');
  if (new Set(options.map(v => v.toLocaleLowerCase('tr-TR'))).size !== options.length) throw new RangeError('Seçenekler birbirinden farklı olmalı.');
  const durationMs = input.durationMs ?? config.durationSeconds * 1000;
  if (!Number.isSafeInteger(durationMs) || durationMs < MIN_SURE || durationMs > MAX_SURE) throw new RangeError('Süre 10 saniye ile 30 gün arasında olmalı.');
  const baslik = cleanText(input.title ?? config.title); const aciklama = cleanText(input.description ?? config.description); const tema = input.theme ?? config.theme;
  if (!baslik || baslik.length > 60 || aciklama.length > 140 || !TEMALAR[tema]) throw new RangeError('Yarışma başlığı, açıklaması veya teması geçersiz.');
  const channel = await targetChannel(guild, config.channelId || fallbackChannelId, [PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory]);
  const message = await channel.send({ content: 'Oy yarışması hazırlanıyor…', allowedMentions: { parse: [] } });
  const poll = { version: 2, baslik, aciklama, tema, secenekler: options, oylar: options.map(() => []), bitis: Date.now() + durationMs,
    kanalId: channel.id, guildId: guild.id, olusturanId: creatorId, messageId: message.id, revision: 0 };
  try {
    await message.edit(buildPollPayload(poll, message.id));
    const db = loadDB(); db[message.id] = poll; saveDB(db);
  } catch (error) { await message.delete().catch(() => {}); throw error; }
  schedulePollFinish(guild.client, message.id, durationMs);
  return message;
}

async function restorePolls(client) {
  const db = loadDB();

  for (const [messageId, storedPoll] of Object.entries(db)) {
    const yarisma = normalizePoll(storedPoll);
    if (!Number.isFinite(yarisma.bitis)) continue;

    const remaining = yarisma.bitis - Date.now();
    if (remaining <= 0) {
      await finishPoll(client, messageId);
    } else {
      schedulePollFinish(client, messageId, remaining);
    }
  }
}

const command = {
  data: new SlashCommandBuilder()
    .setName('oy-yarışması')
    .setDescription('Butonlu ve görselli bir oy yarışması başlatır.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addStringOption((option) => option
      .setName(SECENEK_OPTION_ADLARI[0])
      .setDescription('1. seçenek (rol veya kişi etiketi kullanılamaz)')
      .setMinLength(1)
      .setMaxLength(70)
      .setRequired(true))
    .addStringOption((option) => option
      .setName(SECENEK_OPTION_ADLARI[1])
      .setDescription('2. seçenek (rol veya kişi etiketi kullanılamaz)')
      .setMinLength(1)
      .setMaxLength(70)
      .setRequired(true))
    .addStringOption((option) => option
      .setName(SECENEK_OPTION_ADLARI[2])
      .setDescription('İsteğe bağlı 3. seçenek')
      .setMinLength(1)
      .setMaxLength(70))
    .addStringOption((option) => option
      .setName(SECENEK_OPTION_ADLARI[3])
      .setDescription('İsteğe bağlı 4. seçenek')
      .setMinLength(1)
      .setMaxLength(70))
    .addStringOption((option) => option
      .setName(SECENEK_OPTION_ADLARI[4])
      .setDescription('İsteğe bağlı 5. seçenek')
      .setMinLength(1)
      .setMaxLength(70))
      .addStringOption((option) => option
      .setName('süre')
      .setDescription('Yarışma süresi (10s, 2m, 3 saat, 4 gün)')
      .setMinLength(2)
      .setMaxLength(40))
    .addStringOption((option) => option
      .setName('başlık')
      .setDescription('Görselde gösterilecek yarışma başlığı')
      .setMinLength(1)
      .setMaxLength(60))
    .addStringOption((option) => option
      .setName('açıklama')
      .setDescription('Görselde başlığın altında gösterilecek kısa açıklama')
      .setMinLength(1)
      .setMaxLength(140))
    .addStringOption((option) => option
      .setName('tema')
      .setDescription('Yarışma görselinin renk teması')
      .addChoices(
        { name: 'Mor', value: 'mor' },
        { name: 'Mavi', value: 'mavi' },
        { name: 'Yeşil', value: 'yesil' },
        { name: 'Turuncu', value: 'turuncu' },
        { name: 'Pembe', value: 'pembe' },
      )),

  async execute(interaction) {
    let config;
    try { config = requireEnabled(interaction.guildId, 'oy-yarismasi'); }
    catch (error) { return interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral }); }
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu komutu kullanmak için yetkin yok.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const secenekler = SECENEK_OPTION_ADLARI
      .map((optionName) => cleanText(interaction.options.getString(optionName)))
      .filter(Boolean);

    if (secenekler.length < 2) {
      return interaction.reply({
        content: `${emojiler.uyari} **En az iki seçenek girmelisin.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    for (const secenek of secenekler) {
      const forbiddenMention = findForbiddenMention(secenek);
      if (forbiddenMention === 'role') {
        return interaction.reply({
          content: `${emojiler.uyari} **Rol etiketleyemezsin.** Seçeneği düz metin olarak yazmalısın.`,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
      }

      if (forbiddenMention === 'user') {
        return interaction.reply({
          content: `${emojiler.uyari} **Kişi etiketleyemezsin.** Seçeneği düz metin olarak yazmalısın.`,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
      }
    }

    const uniqueOptions = new Set(secenekler.map((option) => option.toLocaleLowerCase('tr-TR')));
    if (uniqueOptions.size !== secenekler.length) {
      return interaction.reply({
        content: `${emojiler.uyari} **Seçenekler birbirinden farklı olmalı.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const sureInput = interaction.options.getString('süre') || `${config.durationSeconds}s`;
    const sure = parseSure(sureInput);
    if (!sure) {
      return interaction.reply({
        content: `${emojiler.uyari} **Geçersiz süre.** Örnek: \`10s\`, \`2m\`, \`3 saat\`, \`4 gün\`. Süre 10 saniye ile 30 gün arasında olmalı.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const message = await startPoll(interaction.guild, interaction.channelId, interaction.user.id, {
      options: secenekler, durationMs: sure, title: interaction.options.getString('başlık') ?? undefined,
      description: interaction.options.getString('açıklama') ?? undefined, theme: interaction.options.getString('tema') ?? undefined,
    });
    await interaction.editReply({ content: `Oy yarışması <#${message.channelId}> kanalında başlatıldı.`, allowedMentions: { parse: [] } });
  },

  async handleButton(interaction) {
    const vote = parseVoteButton(interaction.customId);
    if (!vote) return;
    if (finishing.has(vote.messageId)) return interaction.reply({ content: 'Bu yarışma sonuçlandırılıyor.', flags: MessageFlags.Ephemeral });

    const db = loadDB();
    const storedPoll = db[vote.messageId];
    if (!storedPoll) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu yarışma artık aktif değil.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const yarisma = normalizePoll(storedPoll);
    if (Date.now() >= yarisma.bitis) {
      await finishPoll(interaction.client, vote.messageId);
      return interaction.reply({
        content: `${emojiler.uyari} **Oylama süresi doldu.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!yarisma.secenekler[vote.optionIndex] || !yarisma.oylar[vote.optionIndex]) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu seçenek artık kullanılamıyor.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const userId = interaction.user.id;
    if (yarisma.oylar[vote.optionIndex].includes(userId)) {
      return interaction.reply({
        content: `${emojiler.uyari} **Zaten bu seçeneğe oy verdin.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    yarisma.oylar = yarisma.oylar.map((votes) => votes.filter((id) => id !== userId));
    yarisma.oylar[vote.optionIndex].push(userId);
    yarisma.revision = (Number(yarisma.revision) || 0) + 1;
    db[vote.messageId] = yarisma;
    saveDB(db);

    await interaction.update(buildPollPayload(yarisma, vote.messageId));
  },

  restorePolls,
  startPoll,
  finishPoll,
};

command.__test = {
  SECENEK_OPTION_ADLARI,
  buildButtonRows,
  findForbiddenMention,
  formatSure,
  normalizePoll,
  parseSure,
  parseVoteButton,
  renderPollCanvas,
};

module.exports = command;
