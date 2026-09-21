const {
  SlashCommandBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType
} = require("discord.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const fs = require("../../Utils/Core/databaseFs").promises;
const path = require("path");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const WIDTH = 1200;
const HEIGHT = 720;
const FONT_FAMILY = '"Google Sans", "Product Sans", "Noto Sans", Arial, sans-serif';
const VOICE_DATA_PATH = path.resolve(__dirname, "../../Database/Ses Sistemleri/sesVerileri.json");
const MESSAGE_DATA_PATH = path.resolve(__dirname, "../../Database/Ses Sistemleri/sesMesajVeri.json");

const CONTROL_IDS = {
  voice: "say_voice",
  spotlight: "say_spotlight",
  breakdown: "say_breakdown",
  refresh: "say_refresh"
};

const COLORS = {
  background: "#090B11",
  surface: "rgba(18, 21, 31, 0.88)",
  surfaceSoft: "rgba(255, 255, 255, 0.045)",
  border: "rgba(255, 255, 255, 0.11)",
  text: "#F7F4ED",
  muted: "#9A9EAC",
  coral: "#FF735C",
  amber: "#FFBF69",
  mint: "#62E6B2",
  violet: "#A78BFA",
  blue: "#68A8FF",
  rose: "#FF6F91"
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Sunucunun canlı nabzını ve öne çıkan istatistiklerini gösterir."),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: `${emojiler.uyari || "⚠️"} **Bu komut yalnızca sunucularda kullanılabilir.**`,
        flags: 64
      });
    }

    await interaction.deferReply();
    const payload = await createSayPayload(interaction.guild, interaction.user.id);
    return interaction.editReply(payload);
  },

  async handleComponent(interaction) {
    const [action, requesterId] = interaction.customId.split(":");

    if (!Object.values(CONTROL_IDS).includes(action)) return;
    if (!isRequester(interaction, requesterId)) return;

    if (action === CONTROL_IDS.refresh) {
      await interaction.deferUpdate();
      const payload = await createSayPayload(interaction.guild, requesterId || interaction.user.id);
      return interaction.editReply(payload);
    }

    await interaction.deferReply({ flags: 64 });
    const stats = await collectGuildStats(interaction.guild);

    if (action === CONTROL_IDS.voice) {
      return interaction.editReply({ embeds: [buildVoiceEmbed(interaction.guild, stats)] });
    }

    if (action === CONTROL_IDS.spotlight) {
      return interaction.editReply({ embeds: [buildSpotlightEmbed(interaction.guild, stats)] });
    }

    return interaction.editReply({ embeds: [buildBreakdownEmbed(interaction.guild, stats)] });
  },

  buildSayCard,
  calculatePulseScore,
  collectGuildStats
};

async function createSayPayload(guild, requesterId) {
  const stats = await collectGuildStats(guild);
  const buffer = await buildSayCard({
    guildName: guild.name,
    guildIconURL: guild.iconURL({ extension: "png", size: 256 }),
    bannerURL: guild.bannerURL({ extension: "png", size: 1024 }),
    createdTimestamp: guild.createdTimestamp,
    stats,
    measuredAt: Date.now()
  });

  return {
    files: [new AttachmentBuilder(buffer, { name: "sunucu-nabzi.png" })],
    attachments: [],
    components: [buildControls(requesterId)]
  };
}

async function collectGuildStats(guild) {
  let members;

  try {
    members = await guild.members.fetch({ withPresences: true });
  } catch (error) {
    console.warn("⚠️ [SAY] Üye/presence verileri önbellekten kullanılacak:", error.message);
    members = guild.members.cache;
  }

  const memberList = Array.from(members.values());
  const humans = memberList.filter(member => !member.user.bot);
  const bots = memberList.filter(member => member.user.bot);
  const onlineHumans = humans.filter(member => isOnline(member));
  const voiceMembers = humans.filter(member => member.voice?.channelId);
  const voiceBots = bots.filter(member => member.voice?.channelId);
  const now = Date.now();

  const statuses = {
    online: humans.filter(member => member.presence?.status === "online").length,
    idle: humans.filter(member => member.presence?.status === "idle").length,
    dnd: humans.filter(member => member.presence?.status === "dnd").length
  };
  statuses.offline = Math.max(0, humans.length - statuses.online - statuses.idle - statuses.dnd);

  const channelList = Array.from(guild.channels.cache.values());
  const textChannels = channelList.filter(channel => [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.GuildMedia
  ].includes(channel.type));
  const voiceChannels = channelList.filter(channel => [
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice
  ].includes(channel.type));
  const activeVoiceChannels = voiceChannels
    .map(channel => ({
      id: channel.id,
      name: channel.name,
      members: Array.from(channel.members.values()).filter(member => !member.user.bot)
    }))
    .filter(channel => channel.members.length > 0)
    .sort((a, b) => b.members.length - a.members.length);

  let banCount = null;
  try {
    banCount = (await guild.bans.fetch()).size;
  } catch {
  }

  const voiceArchive = await readVoiceArchive(guild.id, now);
  const messageArchive = await readMessageArchive(textChannels);
  const new24h = humans.filter(member => member.joinedTimestamp && now - member.joinedTimestamp <= 86_400_000).length;
  const new7d = humans.filter(member => member.joinedTimestamp && now - member.joinedTimestamp <= 604_800_000).length;
  const oldestMembers = humans
    .filter(member => member.joinedTimestamp)
    .sort((a, b) => a.joinedTimestamp - b.joinedTimestamp)
    .slice(0, 5);
  const newestMembers = humans
    .filter(member => member.joinedTimestamp)
    .sort((a, b) => b.joinedTimestamp - a.joinedTimestamp)
    .slice(0, 5);
  const largestRoles = Array.from(guild.roles.cache.values())
    .filter(role => role.id !== guild.id && !role.managed)
    .map(role => ({ role, size: role.members.filter(member => !member.user.bot).size }))
    .filter(item => item.size > 0)
    .sort((a, b) => b.size - a.size)
    .slice(0, 5);

  const stats = {
    totalMembers: Number(guild.memberCount) || memberList.length,
    humans: humans.length,
    bots: bots.length,
    onlineHumans: onlineHumans.length,
    voiceHumans: voiceMembers.length,
    voiceBots: voiceBots.length,
    statuses,
    streaming: voiceMembers.filter(member => member.voice.streaming).length,
    cameras: voiceMembers.filter(member => member.voice.selfVideo).length,
    muted: voiceMembers.filter(member => member.voice.selfMute || member.voice.serverMute).length,
    deafened: voiceMembers.filter(member => member.voice.selfDeaf || member.voice.serverDeaf).length,
    totalChannels: channelList.length,
    textChannels: textChannels.length,
    voiceChannels: voiceChannels.length,
    categoryCount: channelList.filter(channel => channel.type === ChannelType.GuildCategory).length,
    activeVoiceChannels,
    topVoiceChannel: activeVoiceChannels[0] || null,
    boostCount: Number(guild.premiumSubscriptionCount) || 0,
    boostTier: Number(guild.premiumTier) || 0,
    roleCount: Math.max(0, guild.roles.cache.size - 1),
    emojiCount: guild.emojis.cache.size,
    stickerCount: guild.stickers.cache.size,
    banCount,
    new24h,
    new7d,
    totalVoiceMs: voiceArchive.totalVoiceMs,
    trackedMessages: messageArchive.total,
    topTextChannel: messageArchive.topChannel,
    oldestMembers,
    newestMembers,
    largestRoles
  };

  stats.pulse = calculatePulseScore(stats);
  return stats;
}

async function readVoiceArchive(guildId, now) {
  const data = await readJsonFile(VOICE_DATA_PATH);
  const guildData = data[guildId] || {};
  let totalVoiceMs = 0;

  for (const userData of Object.values(guildData)) {
    if (!userData || typeof userData !== "object") continue;
    totalVoiceMs += Number(userData.totalTime) || 0;
    if (Number(userData.lastJoin) > 0 && Number(userData.lastJoin) <= now) {
      totalVoiceMs += now - Number(userData.lastJoin);
    }
  }

  return { totalVoiceMs };
}

async function readMessageArchive(textChannels) {
  const data = await readJsonFile(MESSAGE_DATA_PATH);
  const channelMap = new Map(textChannels.map(channel => [channel.id, channel]));
  const totals = new Map();

  for (const [key, rawValue] of Object.entries(data)) {
    const match = /^channelMsgCount_(\d+)_(\d+)$/.exec(key);
    if (!match || !channelMap.has(match[1])) continue;
    totals.set(match[1], (totals.get(match[1]) || 0) + (Number(rawValue) || 0));
  }

  const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, [, count]) => sum + count, 0);
  const topEntry = sorted[0];

  return {
    total,
    topChannel: topEntry
      ? { id: topEntry[0], name: channelMap.get(topEntry[0])?.name || "Bilinmiyor", count: topEntry[1] }
      : null
  };
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function calculatePulseScore(stats) {
  const humans = Math.max(1, Number(stats.humans) || 0);
  const onlineRatio = clamp((Number(stats.onlineHumans) || 0) / humans, 0, 1);
  const voiceRatio = clamp((Number(stats.voiceHumans) || 0) / humans, 0, 1);
  const growthRatio = clamp((Number(stats.new7d) || 0) / Math.max(1, humans * 0.03), 0, 1);
  const boostRatio = clamp((Number(stats.boostCount) || 0) / Math.max(2, humans * 0.02), 0, 1);

  const score = Math.round(
    Math.min(55, (onlineRatio / 0.35) * 55) +
    Math.min(30, (voiceRatio / 0.12) * 30) +
    growthRatio * 8 +
    boostRatio * 7
  );

  if (score >= 80) return { score: clamp(score, 0, 100), label: "Zirvede", color: COLORS.mint };
  if (score >= 60) return { score, label: "Çok canlı", color: COLORS.amber };
  if (score >= 38) return { score, label: "Hareketli", color: COLORS.coral };
  if (score >= 18) return { score, label: "Isınıyor", color: COLORS.violet };
  return { score, label: "Sakin", color: COLORS.blue };
}

function buildControls(requesterId) {
  const voiceButton = new ButtonBuilder()
    .setCustomId(`${CONTROL_IDS.voice}:${requesterId}`)
    .setLabel("Ses Sahnesi")
    .setStyle(ButtonStyle.Success);
  const spotlightButton = new ButtonBuilder()
    .setCustomId(`${CONTROL_IDS.spotlight}:${requesterId}`)
    .setLabel("Öne Çıkanlar")
    .setStyle(ButtonStyle.Success);
  const breakdownButton = new ButtonBuilder()
    .setCustomId(`${CONTROL_IDS.breakdown}:${requesterId}`)
    .setLabel("Nabız Detayı")
    .setStyle(ButtonStyle.Success);
  const refreshButton = new ButtonBuilder()
    .setCustomId(`${CONTROL_IDS.refresh}:${requesterId}`)
    .setLabel("Verileri Güncelle")
    .setStyle(ButtonStyle.Primary);

  setButtonEmoji(voiceButton, emojiler.colorized_volume_max);
  setButtonEmoji(spotlightButton, emojiler.parlayanyildiz || emojiler.crown);
  setButtonEmoji(breakdownButton, emojiler.chart);
  setButtonEmoji(refreshButton, emojiler.yukleniyor);

  return new ActionRowBuilder().addComponents(
    voiceButton,
    spotlightButton,
    breakdownButton,
    refreshButton
  );
}

function isRequester(interaction, requesterId) {
  if (!requesterId || requesterId === interaction.user.id) return true;

  interaction.reply({
    content: `${emojiler.uyari || "⚠️"} **Bu paneli yalnızca komutu kullanan kişi yönetebilir.**`,
    flags: 64
  }).catch(() => null);
  return false;
}

function setButtonEmoji(button, emoji) {
  if (emoji) button.setEmoji(emoji);
  return button;
}

function buildVoiceEmbed(guild, stats) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.mint)
    .setAuthor({ name: `${guild.name} • Ses Sahnesi`, iconURL: guild.iconURL() || undefined })
    .setFooter({ text: `${stats.voiceHumans} kullanıcı • ${stats.activeVoiceChannels.length} aktif ses kanalı` })

  if (stats.activeVoiceChannels.length === 0) {
    return embed.setDescription("🔇 Şu anda ses kanallarında kimse bulunmuyor.");
  }

  const lines = [];
  let shownMembers = 0;
  for (const channel of stats.activeVoiceChannels.slice(0, 12)) {
    const remainingSpace = Math.max(0, 36 - shownMembers);
    const visibleMembers = channel.members.slice(0, remainingSpace);
    const people = visibleMembers.map(member => `<@${member.id}>`).join(" • ");
    const hidden = channel.members.length - visibleMembers.length;
    lines.push(`**<#${channel.id}> · ${channel.members.length} kişi**\n${people}${hidden > 0 ? ` • +${hidden} kişi` : ""}`);
    shownMembers += visibleMembers.length;
    if (shownMembers >= 36) break;
  }

  const hiddenChannels = stats.activeVoiceChannels.length - Math.min(stats.activeVoiceChannels.length, 12);
  embed.setDescription(`${lines.join("\n\n")}${hiddenChannels > 0 ? `\n\n*+${hiddenChannels} aktif kanal daha var.*` : ""}`);
  embed.addFields({
    name: "Canlı sinyaller",
    value: `📡 ${stats.streaming} yayın  •  📷 ${stats.cameras} kamera  •  🔇 ${stats.muted} susturulmuş  •  🤖 ${stats.voiceBots} bot`,
    inline: false
  });
  return embed;
}

function buildSpotlightEmbed(guild, stats) {
  const oldest = formatMemberTimeline(stats.oldestMembers, false);
  const newest = formatMemberTimeline(stats.newestMembers, true);
  const roles = stats.largestRoles.length
    ? stats.largestRoles.map(({ role, size }, index) => `**${index + 1}.** <@&${role.id}> · ${formatNumber(size)} üye`).join("\n")
    : "Henüz ölçülebilen bir rol yok.";
  const voiceLeader = stats.topVoiceChannel
    ? `<#${stats.topVoiceChannel.id}> · **${stats.topVoiceChannel.members.length} kişi**`
    : "Şu anda aktif bir ses kanalı yok.";
  const textLeader = stats.topTextChannel
    ? `<#${stats.topTextChannel.id}> · **${formatNumber(stats.topTextChannel.count)} takipli mesaj**`
    : "Henüz takipli mesaj verisi yok.";

  return new EmbedBuilder()
    .setColor(COLORS.amber)
    .setAuthor({ name: `${guild.name} • Öne Çıkanlar`, iconURL: guild.iconURL() || undefined })
    .setDescription(`Sunucunun hafızasından ve canlı akışından seçilen kısa liste.`)
    .addFields(
      { name: `🏛️ Sunucunun Temel Taşları`, value: oldest, inline: true },
      { name: `${emojiler.girisok} En Yeni Katılanlar`, value: newest, inline: true },
      { name: `${emojiler.ampul} En Kalabalık Roller`, value: roles, inline: false },
      { name: `${emojiler.colorized_volume_max} Ses Lideri`, value: voiceLeader, inline: true },
      { name: `${emojiler.speechbubble} Mesaj Lideri`, value: textLeader, inline: true }
    )
    .setFooter({ text: "Mesaj liderliği, botun takip etmeye başladığı andan itibaren hesaplanır." })
}

function buildBreakdownEmbed(guild, stats) {
  const banValue = stats.banCount === null ? "Erişim yok" : formatNumber(stats.banCount);
  const onlinePercent = stats.humans ? Math.round((stats.onlineHumans / stats.humans) * 100) : 0;
  const voicePercent = stats.humans ? Math.round((stats.voiceHumans / stats.humans) * 100) : 0;

  return new EmbedBuilder()
    .setColor(stats.pulse.color)
    .setAuthor({ name: `${guild.name} • Nabız Detayı`, iconURL: guild.iconURL() || undefined })
    .setDescription(
      `## ${stats.pulse.score}/100 · ${stats.pulse.label}\n` +
      `-# **Nabız: çevrimiçi oranı, ses katılımı, son 7 gündeki yeni üyeler ve boost desteğinin ağırlıklı birleşimidir.**`
    )
    .addFields(
      {
        name: "İnsan Trafiği",
        value: `**${formatNumber(stats.humans)}** insan · **${formatNumber(stats.bots)}** bot\n` +
          `**${formatNumber(stats.onlineHumans)}** çevrimiçi (%${onlinePercent}) · **${formatNumber(stats.voiceHumans)}** seste (%${voicePercent})\n` +
          `${emojiler.donensaat} Son 24 saat **+${formatNumber(stats.new24h)}** · ${emojiler.Takvim} Son 7 gün **+${formatNumber(stats.new7d)}**`,
        inline: false
      },
      {
        name: "Durum Spektrumu",
        value: `${emojiler.online} ${stats.statuses.online} çevrimiçi  •  ${emojiler.idle} ${stats.statuses.idle} boşta  •  ${emojiler.dnd} ${stats.statuses.dnd} rahatsız etmeyin  •  ${emojiler.offline} ${stats.statuses.offline} çevrimdışı`,
        inline: false
      },
      {
        name: "Sunucu Envanteri",
        value: `**${stats.textChannels}** metin kanalı · **${stats.voiceChannels}** ses kanalı · **${stats.categoryCount}** kategori\n` +
          `**${stats.roleCount}** rol · **${stats.emojiCount}** emoji · **${stats.stickerCount}** çıkartma · **${banValue}** ban`,
        inline: false
      },
      {
        name: "Arşiv",
        value: `${emojiler.colorized_screenshare_max} **${formatDuration(stats.totalVoiceMs)}** toplam ses \n${emojiler.speechbubble} **${formatNumber(stats.trackedMessages)}** takipli kanal mesajı`,
        inline: true
      },
      {
        name: "Destek",
        value: `${emojiler.nitroboost} **${formatNumber(stats.boostCount)}** boost **|** **${stats.boostTier}.** Seviye `,
        inline: true
      }
    )
}

function formatMemberTimeline(members, newestFirst) {
  if (!members.length) return "Üye verisi bulunamadı.";
  return members.map(member => {
    const timestamp = Math.floor(member.joinedTimestamp / 1000);
    return `<@${member.id}> · <t:${timestamp}:${newestFirst ? "R" : "d"}>`;
  }).join("\n");
}

async function buildSayCard({
  guildName,
  guildIconURL = null,
  bannerURL = null,
  createdTimestamp = Date.now(),
  stats,
  measuredAt = Date.now()
}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const icon = await loadImageSafe(guildIconURL);
  const banner = await loadImageSafe(bannerURL);

  drawBackground(ctx, banner);
  drawHeader(ctx, { guildName, icon, createdTimestamp, stats, measuredAt });
  drawPulseOrbit(ctx, stats);
  drawLiveFlow(ctx, stats);
  drawMetricRibbon(ctx, stats);

  return canvas.toBuffer("image/png");
}

function drawBackground(ctx, banner) {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#1A1115");
  gradient.addColorStop(0.38, "#10131B");
  gradient.addColorStop(0.72, "#11121A");
  gradient.addColorStop(1, COLORS.background);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  if (banner) {
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.filter = "blur(18px) brightness(0.55) saturate(1.2)";
    drawCoverImage(ctx, banner, -30, -30, WIDTH + 60, HEIGHT + 60);
    ctx.restore();
  }

  drawGlow(ctx, 185, 260, 350, "rgba(255, 115, 92, 0.18)");
  drawGlow(ctx, 915, 145, 390, "rgba(98, 230, 178, 0.10)");
  drawGlow(ctx, 780, 660, 330, "rgba(167, 139, 250, 0.09)");

  ctx.fillStyle = "rgba(5, 6, 10, 0.48)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.075)";
  for (let i = 0; i < 180; i++) {
    const x = (i * 83) % WIDTH;
    const y = (i * 47 + Math.floor(i / 11) * 29) % HEIGHT;
    const size = i % 17 === 0 ? 2 : 1;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
  ctx.lineWidth = 1;
  for (let radius = 130; radius <= 610; radius += 96) {
    ctx.beginPath();
    ctx.arc(230, 365, radius, -1.1, 1.15);
    ctx.stroke();
  }
}

function drawHeader(ctx, { guildName, icon, createdTimestamp, stats, measuredAt }) {
  drawAvatar(ctx, icon, 77, 76, 38, guildName);

  ctx.fillStyle = COLORS.coral;
  ctx.font = font(13, 700);
  ctx.fillText("SUNUCU NABZI", 134, 58);

  ctx.fillStyle = COLORS.text;
  ctx.font = font(fitFontSize(ctx, guildName, 590, 34, 20), 700);
  ctx.fillText(truncateText(ctx, guildName, 590), 133, 91);

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(14, 400);
  ctx.fillText(
    `${formatNumber(stats.totalMembers)} üye  •  ${formatServerAge(createdTimestamp)}`,
    135,
    118
  );

  const pillX = 936;
  const pillY = 49;
  drawRoundedRect(ctx, pillX, pillY, 218, 54, 27, "rgba(98, 230, 178, 0.075)", "rgba(98, 230, 178, 0.24)");
  ctx.fillStyle = COLORS.mint;
  ctx.beginPath();
  ctx.arc(pillX + 25, pillY + 27, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.text;
  ctx.font = font(14, 700);
  ctx.fillText("CANLI VERİ", pillX + 39, pillY + 23);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(12, 400);
  ctx.fillText(formatClock(measuredAt), pillX + 39, pillY + 41);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.beginPath();
  ctx.moveTo(47, 146);
  ctx.lineTo(1153, 146);
  ctx.stroke();
}

function drawPulseOrbit(ctx, stats) {
  const centerX = 250;
  const centerY = 355;
  const radius = 138;
  const start = -Math.PI * 0.74;
  const span = Math.PI * 1.48;
  const end = start + span;

  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, start, end);
  ctx.stroke();

  const ringGradient = ctx.createLinearGradient(95, 235, 405, 470);
  ringGradient.addColorStop(0, COLORS.coral);
  ringGradient.addColorStop(0.55, COLORS.amber);
  ringGradient.addColorStop(1, stats.pulse.color);
  ctx.strokeStyle = ringGradient;
  ctx.shadowColor = stats.pulse.color;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, start, start + span * (stats.pulse.score / 100));
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
  ctx.setLineDash([3, 11]);
  ctx.beginPath();
  ctx.arc(centerX, centerY, 108, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(12, 700);
  ctx.fillText("NABIZ SKORU", centerX, centerY - 52);
  ctx.fillStyle = COLORS.text;
  ctx.font = font(74, 700);
  ctx.fillText(String(stats.pulse.score), centerX, centerY + 24);
  ctx.fillStyle = stats.pulse.color;
  ctx.font = font(17, 700);
  ctx.fillText(stats.pulse.label.toUpperCase(), centerX, centerY + 57);
  ctx.textAlign = "left";

  drawOrbitBadge(ctx, 63, 188, "7 GÜNLÜK", `+${formatNumber(stats.new7d)}`, COLORS.violet);
  drawOrbitBadge(ctx, 352, 188, "BOOST", formatNumber(stats.boostCount), COLORS.rose);
  drawOrbitBadge(ctx, 68, 502, "ÇEVRİMİÇİ", formatNumber(stats.onlineHumans), COLORS.mint);
  drawOrbitBadge(ctx, 344, 502, "SESTE", formatNumber(stats.voiceHumans), COLORS.blue);
}

function drawOrbitBadge(ctx, x, y, label, value, color) {
  drawRoundedRect(ctx, x, y, 103, 54, 16, "rgba(15, 17, 25, 0.74)", "rgba(255, 255, 255, 0.08)");
  ctx.fillStyle = color;
  ctx.font = font(10, 700);
  ctx.fillText(label, x + 13, y + 20);
  ctx.fillStyle = COLORS.text;
  ctx.font = font(20, 700);
  ctx.fillText(value, x + 13, y + 43);
}

function drawLiveFlow(ctx, stats) {
  const x = 486;
  const width = 667;

  ctx.fillStyle = COLORS.text;
  ctx.font = font(25, 700);
  ctx.fillText("Canlı akış", x, 190);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(13, 400);
  ctx.fillText("Sunucunun şu anki verileri ve dengesi", x, 215);

  drawActivityBar(ctx, x, 250, width, {
    label: "Çevrimiçi insanlar",
    value: stats.onlineHumans,
    total: stats.humans,
    color: COLORS.mint
  });
  drawActivityBar(ctx, x, 315, width, {
    label: "Ses katılımı",
    value: stats.voiceHumans,
    total: stats.humans,
    color: COLORS.blue,
    detail: stats.topVoiceChannel ? `Zirve: #${stats.topVoiceChannel.name}` : "Ses kanalları sakin"
  });
  drawActivityBar(ctx, x, 380, width, {
    label: "İnsan oranı",
    value: stats.humans,
    total: Math.max(1, stats.humans + stats.bots),
    color: COLORS.amber,
    detail: `${formatNumber(stats.bots)} bot`
  });

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(11, 700);
  ctx.fillText("DURUM SPEKTRUMU", x, 448);
  drawStatusSpectrum(ctx, x, 462, width, stats);

  const topVoiceText = stats.topVoiceChannel
    ? `#${stats.topVoiceChannel.name}`
    : "Henüz aktif bir ses kanalı yok";
  drawRoundedRect(ctx, x, 497, width, 69, 18, "rgba(255, 255, 255, 0.038)", "rgba(255, 255, 255, 0.085)");
  ctx.fillStyle = COLORS.violet;
  ctx.font = font(11, 700);
  ctx.fillText("SES SAHNESİ", x + 20, 520);
  ctx.fillStyle = COLORS.text;
  ctx.font = font(fitFontSize(ctx, topVoiceText, 325, 18, 13), 700);
  ctx.fillText(truncateText(ctx, topVoiceText, 325), x + 20, 546);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(12, 500);
  ctx.textAlign = "right";
  ctx.fillText(
    `${stats.activeVoiceChannels.length} aktif kanal  •  ${stats.streaming} yayın  •  ${stats.cameras} kamera`,
    x + width - 20,
    537
  );
  ctx.textAlign = "left";
}

function drawActivityBar(ctx, x, y, width, { label, value, total, color, detail = null }) {
  const ratio = clamp(total > 0 ? value / total : 0, 0, 1);
  ctx.fillStyle = COLORS.text;
  ctx.font = font(14, 600);
  ctx.fillText(label, x, y);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(12, 500);
  ctx.textAlign = "right";
  ctx.fillText(detail || `${formatNumber(value)} / ${formatNumber(total)}`, x + width, y);
  ctx.textAlign = "left";

  drawRoundedRect(ctx, x, y + 14, width, 13, 7, "rgba(255, 255, 255, 0.07)");
  if (ratio > 0) {
    drawRoundedRect(ctx, x, y + 14, Math.max(13, width * ratio), 13, 7, color);
  }
}

function drawStatusSpectrum(ctx, x, y, width, stats) {
  const total = Math.max(1, stats.humans);
  const parts = [
    { label: "çevrimiçi", value: stats.statuses.online, color: COLORS.mint },
    { label: "boşta", value: stats.statuses.idle, color: COLORS.amber },
    { label: "meşgul", value: stats.statuses.dnd, color: COLORS.rose },
    { label: "çevrimdışı", value: stats.statuses.offline, color: "#434754" }
  ];
  let cursor = x;

  ctx.save();
  roundedRectPath(ctx, x, y, width, 10, 5);
  ctx.clip();
  for (const part of parts) {
    const partWidth = width * (part.value / total);
    ctx.fillStyle = part.color;
    ctx.fillRect(cursor, y, partWidth, 10);
    cursor += partWidth;
  }
  ctx.restore();

  ctx.font = font(10, 600);
  let legendX = x;
  for (const part of parts) {
    ctx.fillStyle = part.color;
    ctx.beginPath();
    ctx.arc(legendX + 4, y + 24, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.muted;
    const text = `${part.value} ${part.label}`;
    ctx.fillText(text, legendX + 13, y + 28);
    legendX += ctx.measureText(text).width + 38;
  }
}

function drawMetricRibbon(ctx, stats) {
  const x = 47;
  const y = 596;
  const width = 1106;
  const height = 84;
  drawRoundedRect(ctx, x, y, width, height, 23, "rgba(13, 15, 23, 0.82)", "rgba(255, 255, 255, 0.09)");

  const items = [
    { label: "TOPLAM ÜYE", value: formatNumber(stats.totalMembers), color: COLORS.text },
    { label: "İNSAN / BOT", value: `${formatNumber(stats.humans)} / ${formatNumber(stats.bots)}`, color: COLORS.amber },
    { label: "KANAL", value: formatNumber(stats.totalChannels), color: COLORS.blue },
    { label: "BOOST", value: formatNumber(stats.boostCount), color: COLORS.rose },
    { label: "TAKİPLİ MESAJ", value: compactNumber(stats.trackedMessages), color: COLORS.mint },
    { label: "SES ARŞİVİ", value: formatDurationCompact(stats.totalVoiceMs), color: COLORS.violet }
  ];
  const itemWidth = width / items.length;

  items.forEach((item, index) => {
    const itemX = x + index * itemWidth;
    if (index > 0) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.075)";
      ctx.beginPath();
      ctx.moveTo(itemX, y + 19);
      ctx.lineTo(itemX, y + height - 19);
      ctx.stroke();
    }
    ctx.fillStyle = COLORS.muted;
    ctx.font = font(10, 700);
    ctx.fillText(item.label, itemX + 20, y + 28);
    ctx.fillStyle = item.color;
    ctx.font = font(22, 700);
    ctx.fillText(truncateText(ctx, item.value, itemWidth - 39), itemX + 20, y + 57);
  });
}

function drawAvatar(ctx, image, x, y, radius, fallbackText) {
  ctx.save();
  ctx.shadowColor = "rgba(255, 115, 92, 0.55)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "rgba(255, 115, 92, 0.22)";
  ctx.beginPath();
  ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  if (image) {
    drawCoverImage(ctx, image, x - radius, y - radius, radius * 2, radius * 2);
  } else {
    const fallback = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
    fallback.addColorStop(0, COLORS.coral);
    fallback.addColorStop(1, COLORS.violet);
    ctx.fillStyle = fallback;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.fillStyle = COLORS.text;
    ctx.font = font(radius, 700);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(getInitials(fallbackText), x, y + 1);
  }
  ctx.restore();
}

function drawGlow(ctx, x, y, radius, color) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, color);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawRoundedRect(ctx, x, y, width, height, radius, fill, stroke = null) {
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
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

function drawCoverImage(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

async function loadImageSafe(source) {
  if (!source) return null;
  try {
    return await loadImage(source);
  } catch {
    return null;
  }
}

function font(size, weight = 400) {
  return `${weight} ${size}px ${FONT_FAMILY}`;
}

function fitFontSize(ctx, text, maxWidth, preferred, minimum) {
  for (let size = preferred; size >= minimum; size--) {
    ctx.font = font(size, 700);
    if (ctx.measureText(String(text || "")).width <= maxWidth) return size;
  }
  return minimum;
}

function truncateText(ctx, text, maxWidth) {
  const value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) return value;
  let output = value;
  while (output.length > 1 && ctx.measureText(`${output}…`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output}…`;
}

function getInitials(text) {
  return String(text || "S")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || "")
    .join("") || "S";
}

function isOnline(member) {
  return ["online", "idle", "dnd"].includes(member.presence?.status);
}

function formatNumber(value) {
  return new Intl.NumberFormat("tr-TR").format(Number(value) || 0);
}

function compactNumber(value) {
  const number = Number(value) || 0;
  if (number < 1_000) return formatNumber(number);
  return new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(number);
}

function formatDuration(milliseconds) {
  const totalMinutes = Math.floor((Number(milliseconds) || 0) / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days} gün`);
  if (hours) parts.push(`${hours} saat`);
  if (minutes || !parts.length) parts.push(`${minutes} dakika`);
  return parts.join(" ");
}

function formatDurationCompact(milliseconds) {
  const totalMinutes = Math.floor((Number(milliseconds) || 0) / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}g ${hours}sa`;
  if (hours) return `${hours}sa ${minutes}dk`;
  return `${minutes}dk`;
}

function formatServerAge(createdTimestamp) {
  const days = Math.max(0, Math.floor((Date.now() - Number(createdTimestamp || Date.now())) / 86_400_000));
  if (days >= 365) {
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    return `${years} yıl${months ? ` ${months} ay` : ""}`;
  }
  if (days >= 30) return `${Math.floor(days / 30)} ay ${days % 30} gün`;
  return `${days} günlük sunucu`;
}

function formatClock(timestamp) {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Europe/Istanbul"
  }).format(new Date(timestamp));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}
