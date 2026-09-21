const fs = require("../Core/databaseFs");
const path = require("path");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const ms = require("ms");
const emojiler = require("../Emojis/emojiler.js");
const statDb = require("../Core/jsonDB");
const { requireEnabled, targetChannel } = require('./engagementSettings');
const { randomBytes } = require('node:crypto');

const cekilisFilePath = path.join(__dirname, "../../Database/Eğlence ve Etkileşim/cekilis.json");
const PARTICIPANTS_PER_PAGE = 5;

function ensureCekilisFile() {
  fs.mkdirSync(path.dirname(cekilisFilePath), { recursive: true });
  if (!fs.existsSync(cekilisFilePath)) {
    fs.writeFileSync(cekilisFilePath, JSON.stringify({}, null, 4));
  }
}

function cekilisVerisiniOku() {
  ensureCekilisFile();
  try {
    return JSON.parse(fs.readFileSync(cekilisFilePath, "utf8") || "{}");
  } catch {
    return {};
  }
}

function cekilisVerisiniYaz(data) {
  ensureCekilisFile();
  fs.writeFileSync(cekilisFilePath, JSON.stringify(data, null, 4));
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean).map(String))];
}

function clampText(value, max = 3900) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function parseDurationInput(value) {
  if (!value) return null;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;

  const direct = ms(String(value));
  if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) return direct;

  const units = {
    ms: 1,
    milisaniye: 1,
    s: 1000,
    sn: 1000,
    sec: 1000,
    saniye: 1000,
    m: 60 * 1000,
    min: 60 * 1000,
    dk: 60 * 1000,
    dak: 60 * 1000,
    dakika: 60 * 1000,
    h: 60 * 60 * 1000,
    sa: 60 * 60 * 1000,
    saat: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    g: 24 * 60 * 60 * 1000,
    gun: 24 * 60 * 60 * 1000,
    gün: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    hf: 7 * 24 * 60 * 60 * 1000,
    hafta: 7 * 24 * 60 * 60 * 1000,
  };

  let total = 0;
  let matched = false;
  const regex = /(\d+)\s*(milisaniye|saniye|dakika|saat|hafta|gun|gün|sec|min|dak|ms|sn|dk|sa|hf|[smhdgw])/gi;
  for (const match of String(value).toLowerCase().matchAll(regex)) {
    const amount = Number(match[1]);
    const unit = match[2];
    if (!units[unit]) continue;
    total += amount * units[unit];
    matched = true;
  }

  return matched && total > 0 ? total : null;
}

function formatDuration(durationMs) {
  if (!durationMs) return null;
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds} saniye`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} dakika`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} saat`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} gün`;
  return `${Math.round(days / 7)} hafta`;
}

function extractDiscordIds(value) {
  return unique(String(value || "").match(/\d{17,20}/g) || []);
}

function formatRoleList(roleIds) {
  return unique(roleIds).map((id) => `<@&${id}>`).join(", ");
}

function formatUserList(userIds) {
  return unique(userIds).map((id) => `<@${id}>`).join(", ");
}

function parseMessageRequirement(value) {
  if (!value) return null;

  const text = String(value).trim();
  const amountMatch = text.match(/^(\d+)/);
  const channelId = extractDiscordIds(text)[0];

  if (!amountMatch || !channelId) return null;

  const withoutAmount = text.replace(/^(\d+)/, "").trim();
  const withoutChannel = withoutAmount
    .replace(new RegExp(`<#${channelId}>`, "g"), "")
    .replace(new RegExp(channelId, "g"), "")
    .trim();
  const cooldownMs = parseDurationInput(withoutChannel);

  return {
    amount: Number(amountMatch[1]),
    channelId,
    cooldownMs,
    raw: text,
  };
}

function normalizeGiveaway(raw) {
  const requirements = raw.requirements || {};
  return {
    guildId: raw.guildId,
    channelId: raw.channelId,
    messageId: raw.messageId || null,
    hostId: raw.hostId,
    donorId: raw.donorId || null,
    prize: raw.prize || "Ödül belirtilmemiş",
    description: raw.description || "",
    extra: raw.extra || "",
    message: raw.message ?? null,
    imageUrl: raw.imageUrl || null,
    winners: Math.max(1, Number(raw.winners) || 1),
    endTime: Number(raw.endTime) || Date.now(),
    endedAt: raw.endedAt || null,
    participants: unique(raw.participants),
    winnerIds: unique(raw.winnerIds),
    rerollCount: Number(raw.rerollCount) || 0,
    ended: Boolean(raw.ended),
    ping: Boolean(raw.ping),
    noDefaults: Boolean(raw.noDefaults),
    donorNoWin: Boolean(raw.donorNoWin),
    requirements: {
      requiredRoles: unique(requirements.requiredRoles || raw.requiredRoles),
      blacklistedRoles: unique(requirements.blacklistedRoles || raw.blacklistedRoles),
      bypassRoles: unique(requirements.bypassRoles || raw.bypassRoles),
      bonusRoles: Array.isArray(requirements.bonusRoles) ? requirements.bonusRoles : [],
      messageRequirement: requirements.messageRequirement || raw.messageRequirement || null,
    },
  };
}

function getGiveawayContent(cekilis) {
  const message = String(cekilis.message || "").trim();
  if (!message || message.toLowerCase() === "skip") return null;

  return clampText(
    message
      .replaceAll("{ödül}", cekilis.prize)
      .replaceAll("{odul}", cekilis.prize)
      .replaceAll("{extra}", cekilis.extra || ""),
    2000
  );
}

function buildAllowedMentions(cekilis, userIds = []) {
  if (cekilis.ping) {
    return { parse: ["users", "roles", "everyone"] };
  }

  return {
    parse: [],
    users: unique(userIds),
    roles: [],
  };
}

function buildRequirementLines(cekilis) {
  const req = cekilis.requirements;
  const lines = [];

  if (req.requiredRoles.length) {
    lines.push(`${emojiler.ampul} Gerekli Roller: ${formatRoleList(req.requiredRoles)}`);
  }

  if (req.blacklistedRoles.length) {
    lines.push(`🚫 Yasaklı Roller: ${formatRoleList(req.blacklistedRoles)}`);
  }

  if (req.bypassRoles.length) {
    lines.push(`${emojiler.tasi} Şartları Atlayan Roller: ${formatRoleList(req.bypassRoles)}`);
  }

  if (req.messageRequirement) {
    const parts = [
      `${emojiler.speechbubble} Mesaj Şartı: **${req.messageRequirement.amount}** mesaj`,
      `${emojiler.hashtag} Kanal: <#${req.messageRequirement.channelId}>`,
    ];
    if (req.messageRequirement.cooldownMs) {
      parts.push(`${emojiler.saat} Süre: **${formatDuration(req.messageRequirement.cooldownMs)}**`);
    }
    lines.push(parts.join("\n> "));
  }

  if (req.bonusRoles.length) {
    lines.push(
      `${emojiler.arti} Bonus Haklar: ${req.bonusRoles
        .map((bonus) => `<@&${bonus.roleId}> +${bonus.amount}`)
        .join(", ")}`
    );
  }

  if (cekilis.donorNoWin && cekilis.donorId) {
    lines.push(`${emojiler.dnd} Bağışçı Kazanamaz: <@${cekilis.donorId}>`);
  }

  if (cekilis.noDefaults) {
    lines.push(`${emojiler.ayar} Varsayılan Şartlar: **Yok sayıldı**`);
  }

  return lines;
}

function formatEndedDate(timestamp) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp || Date.now()));
}

async function buildEndedGiveawayEmbed(client, id, cekilis) {
  const host = await client.users.fetch(cekilis.hostId).catch(() => null);
  const descriptionLines = [
    `Kazanan(lar): ${cekilis.winnerIds.length ? formatUserList(cekilis.winnerIds) : "Kazanan çıkmadı."}`,
    `Başlatan: <@${cekilis.hostId}>`,
  ];

  const requirementLines = buildRequirementLines(cekilis);
  if (requirementLines.length) {
    descriptionLines.push("", "**Şartlar:**", ...requirementLines);
  }

  const embed = new EmbedBuilder()
    .setTitle(cekilis.prize)
    .setDescription(clampText(descriptionLines.join("\n")))
    .setColor(0x2f3136)
    .setFooter({
      text: `${cekilis.winners} kazanan | ${formatEndedDate(cekilis.endedAt)}`,
      iconURL: host?.displayAvatarURL(),
    });

  if (cekilis.imageUrl) embed.setImage(cekilis.imageUrl);

  return embed;
}

async function buildGiveawayEmbed(client, id, cekilis) {
  const ended = cekilis.ended;
  if (ended) return buildEndedGiveawayEmbed(client, id, cekilis);

  const baseLines = [];
  const descriptionText = String(cekilis.description || "").trim();
  const extraText = String(cekilis.extra || "").trim();

  if (descriptionText) {
    baseLines.push(descriptionText);
    if (extraText) baseLines.push(extraText);
  } else if (extraText) {
    baseLines.push(extraText);
  } else {
    baseLines.push(ended ? cekilis.prize : "Katıl butonuna basarak çekilişe katıl!");
  }

  const ownerLines = [`${emojiler.crown} Başlatan: <@${cekilis.hostId}>`];
  if (cekilis.donorId) ownerLines.push(`${emojiler.odul} Bağışçı: <@${cekilis.donorId}>`);
  baseLines.push(ownerLines.join("\n"));

  baseLines.push(`${emojiler.donensaat} Bitiş: **<t:${Math.floor(cekilis.endTime / 1000)}:R>** **(** <t:${Math.floor(cekilis.endTime / 1000)}:f> **)**`);

  const requirementLines = buildRequirementLines(cekilis);
  if (requirementLines.length) {
    baseLines.push(`**Şartlar**\n${requirementLines.join("\n")}`);
  }

  const host = await client.users.fetch(cekilis.hostId).catch(() => null);
  const embed = new EmbedBuilder()
    .setTitle(cekilis.prize)
    .setDescription(clampText(baseLines.join("\n\n")))
    .setColor(0x57f287)
    .setFooter({
      text: `${cekilis.winners} kazanan | Çekiliş ID: ${id}`,
    })

  if (host) embed.setThumbnail(host.displayAvatarURL());
  if (cekilis.imageUrl) embed.setImage(cekilis.imageUrl);

  return embed;
}

function buildGiveawayComponents(id, cekilis) {
  const participantsLabel = String(cekilis.participants.length);

  if (cekilis.ended) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`giveaway_join_${id}`)
          .setLabel("Katıl")
          .setEmoji(emojiler.giveaway || '🎉')
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`giveaway_participants_${id}`)
          .setLabel(participantsLabel)
          .setEmoji(emojiler.uye || '👥')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`giveaway_reroll_${id}`)
          .setLabel("Yeniden Çek")
          .setStyle(ButtonStyle.Secondary)
      ),
    ];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway_join_${id}`)
        .setLabel("Katıl")
        .setEmoji(emojiler.giveaway || '🎉')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`giveaway_participants_${id}`)
        .setLabel(participantsLabel)
        .setEmoji(emojiler.uye || '👥')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`giveaway_end_${id}`)
        .setLabel("Bitir")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

async function buildGiveawayPayload(client, id, cekilis, userIds = []) {
  return {
    content: cekilis.ended
      ? `${emojiler.giveaway} **ÇEKİLİŞ SONA ERDİ** ${emojiler.giveaway}`
      : getGiveawayContent(cekilis) || "",
    embeds: [await buildGiveawayEmbed(client, id, cekilis)],
    components: buildGiveawayComponents(id, cekilis),
    allowedMentions: buildAllowedMentions(cekilis, userIds),
  };
}

async function updateGiveawayMessage(client, id, cekilis) {
  if (!cekilis.channelId || !cekilis.messageId) return null;

  const channel = await client.channels.fetch(cekilis.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return null;

  const message = await channel.messages.fetch(cekilis.messageId).catch(() => null);
  if (!message) return { channel, message: null };

  await message.edit(await buildGiveawayPayload(client, id, cekilis, cekilis.winnerIds));
  return { channel, message };
}

function memberHasAnyRole(member, roleIds) {
  return unique(roleIds).some((roleId) => member.roles.cache.has(roleId));
}

function missingRequiredRoles(member, roleIds) {
  return unique(roleIds).filter((roleId) => !member.roles.cache.has(roleId));
}

async function getMessageRequirementCount(member, requirement) {
  if (!requirement.cooldownMs) {
    return Number(statDb.get(`channelMsgCount_${requirement.channelId}_${member.id}`) || 0);
  }

  const channel = await member.guild.channels.fetch(requirement.channelId).catch(() => null);
  if (!channel?.isTextBased()) return 0;

  const since = Date.now() - requirement.cooldownMs;
  let before;
  let count = 0;
  let scanned = 0;
  let reachedOlderMessages = false;

  while (!reachedOlderMessages && scanned < 1000) {
    const messages = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!messages?.size) break;

    const ordered = [...messages.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    for (const message of ordered) {
      scanned += 1;
      if (message.createdTimestamp < since) {
        reachedOlderMessages = true;
        break;
      }
      if (message.author?.id === member.id) count += 1;
    }

    before = ordered[ordered.length - 1]?.id;
    if (!before || messages.size < 100) break;
  }

  return count;
}

async function checkEligibility(member, cekilis, { forDraw = false } = {}) {
  if (!member) {
    return { ok: false, reason: `${emojiler.uyari} **Üye sunucuda bulunamadı.**` };
  }

  const req = cekilis.requirements;
  const hasBypass = memberHasAnyRole(member, req.bypassRoles);

  if (memberHasAnyRole(member, req.blacklistedRoles)) {
    return {
      ok: false,
      reason: `${emojiler.uyari} **Bu çekilişi kazanamayacak rollerden birine sahipsin.**`,
    };
  }

  if (cekilis.donorNoWin && cekilis.donorId === member.id) {
    return {
      ok: false,
      reason: forDraw
        ? `${emojiler.uyari} **Bağışçı bu çekilişi kazanamaz.**`
        : `${emojiler.uyari} **Bağışçı kazanamaz ayarı açık olduğu için bu çekilişe katılamazsın.**`,
    };
  }

  if (!hasBypass) {
    const missing = missingRequiredRoles(member, req.requiredRoles);
    if (missing.length) {
      return {
        ok: false,
        reason: `${emojiler.uyari} **Bu çekilişe katılmak için rollerin eksik:** ${formatRoleList(missing)}`,
      };
    }

    if (req.messageRequirement) {
      const count = await getMessageRequirementCount(member, req.messageRequirement);
      if (count < req.messageRequirement.amount) {
        return {
          ok: false,
          reason: `${emojiler.uyari} **Mesaj şartını karşılamıyorsun.** <#${req.messageRequirement.channelId}> kanalında **${req.messageRequirement.amount}** mesaj gerekiyor. Şu an: **${count}**`,
        };
      }
    }

  }

  return { ok: true, bypass: hasBypass };
}

function getBonusEntries(member, cekilis) {
  return cekilis.requirements.bonusRoles.reduce((total, bonus) => {
    if (member.roles.cache.has(bonus.roleId)) return total + bonus.amount;
    return total;
  }, 0);
}

async function pickWinners(client, cekilis) {
  const guild = client.guilds.cache.get(cekilis.guildId) || await client.guilds.fetch(cekilis.guildId).catch(() => null);
  if (!guild) return [];

  const candidates = [];
  for (const userId of unique(cekilis.participants)) {
    const member = await guild.members.fetch(userId).catch(() => null);
    const eligibility = await checkEligibility(member, cekilis, { forDraw: true });
    if (!eligibility.ok) continue;

    candidates.push({
      userId,
      weight: 1 + getBonusEntries(member, cekilis),
    });
  }

  const winners = [];
  while (candidates.length && winners.length < cekilis.winners) {
    const totalWeight = candidates.reduce((total, candidate) => total + candidate.weight, 0);
    let roll = Math.random() * totalWeight;
    const index = candidates.findIndex((candidate) => {
      roll -= candidate.weight;
      return roll <= 0;
    });
    const winnerIndex = index === -1 ? candidates.length - 1 : index;
    winners.push(candidates[winnerIndex].userId);
    candidates.splice(winnerIndex, 1);
  }

  return winners;
}

async function sendWinnerAnnouncement(channel, message, cekilis, winnerIds, reroll = false) {
  if (!channel?.isTextBased()) return;

  const content = winnerIds.length
    ? `${emojiler.giveaway} Tebrikler ${formatUserList(winnerIds)}, **${cekilis.prize}** çekilişini kazandın!`
    : `${emojiler.carpi} **${cekilis.prize}** çekilişi sona erdi fakat uygun katılımcı bulunamadı.`;

  const components = buildGiveawayLinkButton(message);

  await channel.send({
    content: reroll ? `${emojiler.giveaway} **Yeniden çekiliş!** ${content}` : content,
    components,
    allowedMentions: { users: winnerIds },
  }).catch(() => null);
}

function buildGiveawayLinkButton(message) {
  if (!message?.url) return [];

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Çekilişe Git")
        .setStyle(ButtonStyle.Link)
        .setURL(message.url)
    ),
  ];
}

function buildGiveawayDmEmbed(cekilis, description) {
  return new EmbedBuilder()
    .setTitle(`${cekilis.prize}`)
    .setDescription(clampText(description))
    .setColor(0xffd84a)
}

async function sendGiveawayEndDMs(client, message, cekilis, winnerIds) {
  const components = buildGiveawayLinkButton(message);
  const winnersText = winnerIds.length
    ? winnerIds.map((userId, index) => `**${index + 1}.** <@${userId}> **(** \`${userId}\` **)**`).join("\n")
    : "Kazanan çıkmadı.";

  const host = await client.users.fetch(cekilis.hostId).catch(() => null);
  if (host) {
    await host.send({
      embeds: [
        buildGiveawayDmEmbed(
          cekilis,
          `${emojiler.giveaway} Açtığın **${cekilis.prize}** çekilişin sona erdi. \n\n${emojiler.odul} **(${winnerIds.length}) kazanan var:** \n${winnersText}`
        ),
      ],
      components,
      allowedMentions: { parse: [] },
    }).catch(() => null);
  }

  for (const winnerId of winnerIds) {
    const winner = await client.users.fetch(winnerId).catch(() => null);
    if (!winner) continue;

    await winner.send({
      embeds: [
        buildGiveawayDmEmbed(
          cekilis,
          `${emojiler.giveaway} Tebrikler! **${cekilis.prize}** çekilişini kazandın.`
        ),
      ],
      components,
      allowedMentions: { parse: [] },
    }).catch(() => null);
  }
}

async function endGiveawayById(client, id, { force = false, announce = true } = {}) {
  const data = cekilisVerisiniOku();
  const existing = data[id];
  if (!existing) return { ok: false, reason: "not_found" };

  const cekilis = normalizeGiveaway(existing);
  if (cekilis.ended && !force) return { ok: false, reason: "already_ended", cekilis };

  cekilis.ended = true;
  cekilis.endedAt = Date.now();
  cekilis.winnerIds = await pickWinners(client, cekilis);
  const current = cekilisVerisiniOku(); current[id] = cekilis; cekilisVerisiniYaz(current);

  const result = await updateGiveawayMessage(client, id, cekilis).catch(() => null);
  if (announce && result?.channel) {
    await sendWinnerAnnouncement(result.channel, result.message, cekilis, cekilis.winnerIds);
    await sendGiveawayEndDMs(client, result.message, cekilis, cekilis.winnerIds);
  }

  return { ok: true, cekilis, winnerIds: cekilis.winnerIds };
}

async function rerollGiveawayById(client, id) {
  const data = cekilisVerisiniOku();
  const existing = data[id];
  if (!existing) return { ok: false, reason: "not_found" };

  const cekilis = normalizeGiveaway(existing);
  if (!cekilis.ended) return { ok: false, reason: "not_ended", cekilis };

  cekilis.winnerIds = await pickWinners(client, cekilis);
  cekilis.rerollCount += 1;
  const current = cekilisVerisiniOku(); current[id] = cekilis; cekilisVerisiniYaz(current);

  const result = await updateGiveawayMessage(client, id, cekilis).catch(() => null);
  if (result?.channel) {
    await sendWinnerAnnouncement(result.channel, result.message, cekilis, cekilis.winnerIds, true);
    await sendGiveawayEndDMs(client, result.message, cekilis, cekilis.winnerIds);
  }

  return { ok: true, cekilis, winnerIds: cekilis.winnerIds };
}

async function resetGiveawayParticipants(client, id) {
  const data = cekilisVerisiniOku();
  const existing = data[id];
  if (!existing) return { ok: false, reason: "not_found" };

  const cekilis = normalizeGiveaway(existing);
  cekilis.participants = [];
  cekilis.winnerIds = [];
  data[id] = cekilis;
  cekilisVerisiniYaz(data);

  await updateGiveawayMessage(client, id, cekilis).catch(() => null);
  return { ok: true, cekilis };
}

function canManageGiveaway(interaction, cekilis) {
  if (interaction.user.id === cekilis.hostId) return true;
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  );
}

async function createGiveaway(interaction, client) {
  try { requireEnabled(interaction.guildId, 'cekilis'); }
  catch (error) { return interaction.reply({ content: error.message, flags: 64 }); }
  const durationInput = interaction.options.getString("süre");
  const durationMs = parseDurationInput(durationInput);
  if (!durationMs || durationMs < 5000) {
    return interaction.reply({
      content: `${emojiler.uyari} **Geçerli bir süre gir.** Örnek: \`10s\`, \`2m\`, \`3 saat\`, \`4 gün\``,
      flags: 64,
    });
  }

  const winners = interaction.options.getInteger("kazanan");
  if (!Number.isInteger(winners) || winners < 1 || winners > 50) {
    return interaction.reply({
      content: `${emojiler.uyari} **Kazanan sayısı 1 ile 50 arasında olmalı.**`,
      flags: 64,
    });
  }

  const messageRequirementRaw = interaction.options.getString("mesaj-şartı");
  const messageRequirement = parseMessageRequirement(messageRequirementRaw);
  if (messageRequirementRaw && !messageRequirement) {
    return interaction.reply({
      content: `${emojiler.uyari} **Mesaj şartı formatı geçersiz.** Örnek: \`5 #genel 10m\``,
      flags: 64,
    });
  }

  const prize = interaction.options.getString("ödül", true);
  const donor = interaction.options.getUser("bağışçı");
  const image = interaction.options.getAttachment("görsel");
  const requiredRole = interaction.options.getRole("gerekli-roller");
  const blacklistedRole = interaction.options.getRole("yasaklı-roller");
  const bypassRole = interaction.options.getRole("bypass-roller");
  const bonusRole = interaction.options.getRole("bonus-rol");
  const bonusAmountInput = interaction.options.getInteger("bonus-miktar");
  if (bonusAmountInput && !bonusRole) {
    return interaction.reply({
      content: `${emojiler.uyari} **Bonus miktarı kullanmak için bonus rolü de seçmelisin.**`,
      flags: 64,
    });
  }

  const bonusAmount = bonusAmountInput || 1;
  await interaction.deferReply({ flags: 64 });
  const { id } = await startGiveaway(client, interaction.guild, interaction.channelId, interaction.user.id, {
    donorId: donor?.id || null,
    prize,
    description: "",
    extra: interaction.options.getString("ekstra") ?? undefined,
    message: interaction.options.getString("mesaj") ?? undefined,
    winners,
    durationMs,
    participants: [],
    ended: false,
    ping: interaction.options.getBoolean("ping") ?? undefined,
    noDefaults: interaction.options.getBoolean("varsayılanları-yoksay") || false,
    donorNoWin: interaction.options.getBoolean("bağışçı-kazanamaz") ?? undefined,
    imageUrl: image?.url || null,
    requirements: {
      requiredRoles: requiredRole ? [requiredRole.id] : undefined,
      blacklistedRoles: blacklistedRole ? [blacklistedRole.id] : undefined,
      bypassRoles: bypassRole ? [bypassRole.id] : undefined,
      bonusRoles: bonusRole ? [{ roleId: bonusRole.id, amount: bonusAmount }] : undefined,
      messageRequirement,
    },
  });

  return interaction.editReply({
    content: `${emojiler.tik} Çekiliş (\`${id}\`) **başlatıldı.**`,
  });
}

async function startGiveaway(client, guild, fallbackChannelId, hostId, input) {
  const config = requireEnabled(guild.id, 'cekilis');
  const durationMs = input.durationMs ?? config.durationSeconds * 1000;
  const winners = input.winners ?? config.winners;
  if (!Number.isSafeInteger(durationMs) || durationMs < 5000 || !Number.isSafeInteger(Date.now() + durationMs)) throw new RangeError('Geçerli bir çekiliş süresi girin.');
  if (!Number.isInteger(winners) || winners < 1 || winners > 50) throw new RangeError('Kazanan sayısı 1–50 arasında olmalı.');
  if (!input.prize?.trim() || input.prize.length > 256) throw new RangeError('Ödül 1–256 karakter olmalı.');
  const channel = await targetChannel(guild, config.channelId || fallbackChannelId, [PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory]);
  const defaults = input.noDefaults ? {} : {
    requiredRoles: config.requiredRoles, blacklistedRoles: config.blacklistedRoles, bypassRoles: config.bypassRoles,
    bonusRoles: config.bonusRoleId ? [{ roleId: config.bonusRoleId, amount: config.bonusAmount }] : [],
    messageRequirement: config.messageCount ? { amount: config.messageCount, channelId: config.messageChannelId, cooldownMs: config.messageWindowSeconds * 1000 } : null,
  };
  const requirements = { ...defaults };
  for (const [key, value] of Object.entries(input.requirements || {})) if (value != null) requirements[key] = value;
  const id = `${Date.now()}${randomBytes(3).readUIntBE(0, 3)}`;
  const cekilis = normalizeGiveaway({ ...input, guildId: guild.id, channelId: channel.id, hostId, winners, endTime: Date.now() + durationMs,
    ping: input.ping ?? config.ping, donorNoWin: input.donorNoWin ?? config.donorNoWin,
    message: input.message ?? config.message, extra: input.extra ?? config.extra, requirements,
  });
  const message = await channel.send(await buildGiveawayPayload(client, id, cekilis));
  try {
    const data = cekilisVerisiniOku(); cekilis.messageId = message.id; data[id] = cekilis; cekilisVerisiniYaz(data);
  } catch (error) { await message.delete().catch(() => {}); throw error; }
  return { id, messageId: message.id };
}

async function handleJoin(interaction, client, id, cekilis, data) {
  await interaction.deferReply({ flags: 64 });

  if (cekilis.ended) {
    return interaction.editReply({ content: `${emojiler.uyari} **Bu çekiliş artık aktif değil.**` });
  }

  if (cekilis.participants.includes(interaction.user.id)) {
    return interaction.editReply({ content: `${emojiler.uyari} **Çekilişe zaten katılmışsın.**` });
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const eligibility = await checkEligibility(member, cekilis);
  if (!eligibility.ok) {
    return interaction.editReply({ content: eligibility.reason });
  }

  cekilis.participants.push(interaction.user.id);
  data[id] = cekilis;
  cekilisVerisiniYaz(data);

  await updateGiveawayMessage(client, id, cekilis).catch((err) => {
    console.error("🔴 [ÇEKİLİŞ] Mesaj güncellenemedi:", err);
  });

  return interaction.editReply({ content: `${emojiler.giveaway} Çekilişe **katıldın.** Bol şans!` });
}

function buildParticipantsPayload(id, cekilis, page = 0) {
  const participants = unique(cekilis.participants);
  const totalPages = Math.max(1, Math.ceil(participants.length / PARTICIPANTS_PER_PAGE));
  const safePage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);
  const startIndex = safePage * PARTICIPANTS_PER_PAGE;
  const shown = participants.slice(startIndex, startIndex + PARTICIPANTS_PER_PAGE);
  const description = shown.length
    ? shown.map((userId, index) => `**${startIndex + index + 1}.** <@${userId}>`).join("\n")
    : `${emojiler.carpi} Katılımcı **yok.**`;

  const embed = new EmbedBuilder()
    .setTitle(`${emojiler.uye} Katılımcılar (${participants.length})`)
    .setDescription(description)
    .setColor(0xf2b705)

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_page_${id}_${safePage - 1}`)
      .setLabel("⬅️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage === 0),
    new ButtonBuilder()
      .setCustomId(`giveaway_page_count_${id}_${safePage}`)
      .setLabel(`${safePage + 1}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`giveaway_page_${id}_${safePage + 1}`)
      .setLabel("➡️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1)
  );

  return {
    embeds: [embed],
    components: [row],
    flags: 64,
  };
}

async function handleParticipants(interaction, id, cekilis, page = 0, update = false) {
  const payload = buildParticipantsPayload(id, cekilis, page);
  if (update) {
    const { flags, ...updatePayload } = payload;
    return interaction.update(updatePayload);
  }
  return interaction.reply(payload);
}

async function handleGiveawayInteraction(interaction, client) {
  if (!interaction.isButton() || !interaction.customId.startsWith("giveaway_")) return false;

  const parts = interaction.customId.split("_");
  const [, action, id] = parts;
  const data = cekilisVerisiniOku();
  const existing = data[id];
  if (!existing) {
    await interaction.reply({
      content: `${emojiler.uyari} **Çekiliş veritabanında bulunamadı.**`,
      flags: 64,
    });
    return true;
  }

  const cekilis = normalizeGiveaway(existing);

  if (action === "join") {
    await handleJoin(interaction, client, id, cekilis, data);
    return true;
  }

  if (action === "participants") {
    await handleParticipants(interaction, id, cekilis);
    return true;
  }

  if (action === "page") {
    await handleParticipants(interaction, id, cekilis, Number(parts[3]) || 0, true);
    return true;
  }

  if (action === "end") {
    if (!canManageGiveaway(interaction, cekilis)) {
      await interaction.reply({
        content: `${emojiler.uyari} **Bu çekilişi bitirmek için yetkin yok.**`,
        flags: 64,
      });
      return true;
    }

    await interaction.deferReply({ flags: 64 });
    const result = await endGiveawayById(client, id);
    const content = result.ok
      ? `${emojiler.tik} Çekiliş **bitirildi.**`
      : `${emojiler.uyari} **Çekiliş bitirilemedi.**`;
    await interaction.editReply({ content });
    return true;
  }

  if (action === "reroll") {
    if (!canManageGiveaway(interaction, cekilis)) {
      await interaction.reply({
        content: `${emojiler.uyari} **Bu çekilişi yeniden çekmek için yetkin yok.**`,
        flags: 64,
      });
      return true;
    }

    await interaction.deferReply({ flags: 64 });
    const result = await rerollGiveawayById(client, id);
    const content = result.ok
      ? `${emojiler.tik} Çekiliş **yeniden çekildi.** Yeni kazanan: ${result.winnerIds.length ? formatUserList(result.winnerIds) : "**yok**"}`
      : `${emojiler.uyari} **Çekiliş yeniden çekilemedi.**`;
    await interaction.editReply({ content });
    return true;
  }

  return false;
}

function cekilisleriYukle(client) {
  console.log("🎉 [ÇEKİLİŞ] Kontrol sistemi başlatıldı.");
  let running = false;

  const kontrolEt = async () => {
    if (running) return;
    running = true;

    try {
      const data = cekilisVerisiniOku();
      const now = Date.now();

      for (const [id, raw] of Object.entries(data)) {
        const cekilis = normalizeGiveaway(raw);
        if (!cekilis.ended && cekilis.endTime <= now) {
          await endGiveawayById(client, id);
        }
      }
    } catch (err) {
      console.error("🔴 [ÇEKİLİŞ] Kontrol sırasında hata:", err);
    } finally {
      running = false;
    }
  };

  kontrolEt();
  setInterval(kontrolEt, 60 * 1000);
}

module.exports = {
  cekilisleriYukle,
  cekilisVerisiniOku,
  cekilisVerisiniYaz,
  createGiveaway,
  startGiveaway,
  endGiveawayById,
  handleGiveawayInteraction,
  rerollGiveawayById,
  resetGiveawayParticipants,
};
