"use strict";

const { GatewayIntentBits } = require("discord.js");
const fs = require("../Core/databaseFs").promises;
const path = require("node:path");
const LAST_SEEN_PATH = path.join(__dirname, "../../Database/Üye Verileri/sonGorulme.json");
const presenceRequests = new WeakMap();
const VALID_STATUSES = new Set(["online", "idle", "dnd", "offline"]);

async function getLastSeenAt(userId) {
  try {
    const data = JSON.parse(await fs.readFile(LAST_SEEN_PATH, "utf8"));
    const timestamp = data?.[userId]?.SonGorulme;
    return Number.isFinite(timestamp) && timestamp > 0 && Number.isFinite(new Date(timestamp).getTime()) ? timestamp : null;
  } catch (error) {
    if (error?.code !== "ENOENT") console.warn("🟡 [HESAP BİLGİ] Son görülme zamanı okunamadı:", error?.message || error);
    return null;
  }
}

async function fetchGuildMember(guild, userId) {
  try {
    return await guild.members.fetch({ user: userId, force: true });
  } catch (error) {
    if (Number(error?.code) === 10007) return null;
    throw error;
  }
}

function hasIntent(client, intent) {
  return Boolean(client?.options?.intents?.has(intent));
}

function findPresence(client, guild, userId) {
  if (!hasIntent(client, GatewayIntentBits.GuildPresences)) return null;
  const guilds = [guild, ...Array.from(client.guilds?.cache?.values() || []).filter(item => item.id !== guild.id)];
  let offline = null;
  for (const candidate of guilds) {
    if (candidate.available === false) continue;
    const presence = candidate.presences?.cache?.get(userId);
    if (!presence || !VALID_STATUSES.has(presence.status)) continue;
    if (presence.status !== "offline") return presence;
    offline ??= presence;
  }
  return offline;
}

async function resolvePresence(client, guild, userId, member) {
  const known = findPresence(client, guild, userId);
  if (known) return known;
  if (!member || !hasIntent(client, GatewayIntentBits.GuildPresences) || !hasIntent(client, GatewayIntentBits.GuildMembers)) return null;
  let requests = presenceRequests.get(guild);
  if (!requests) presenceRequests.set(guild, requests = new Map());
  const now = Date.now();
  for (const [id, request] of requests) {
    if (!request.pending && request.expiresAt <= now) requests.delete(id);
  }
  let request = requests.get(userId);
  if (!request) {
    request = { expiresAt: now + 30_000, pending: null };
    requests.set(userId, request);
    request.pending = guild.members.fetch({ user: [userId], withPresences: true, time: 4_000 })
      .catch(() => null).finally(() => { request.pending = null; });
  }
  if (request.pending) await request.pending;
  return findPresence(client, guild, userId);
}

function getProfileImages(user, member) {
  return {
    avatarURL: user.displayAvatarURL({ size: 1024 }),
    bannerURL: user.bannerURL?.({ size: 2048 }) || null,
    memberAvatarURL: member?.displayAvatarURL?.({ size: 1024 }) || null,
    memberBannerURL: member?.bannerURL?.({ size: 2048 }) || null,
    avatarDecorationURL: user.avatarDecorationURL?.() || null,
    cardAvatarURL: user.displayAvatarURL({ size: 512, extension: "png", forceStatic: true }),
    cardBannerURL: user.bannerURL?.({ size: 1024, extension: "png", forceStatic: true }) || null,
  };
}

module.exports = { fetchGuildMember, findPresence, resolvePresence, getProfileImages, getLastSeenAt };
