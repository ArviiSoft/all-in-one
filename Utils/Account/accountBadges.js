"use strict";
const fs = require("node:fs");
const path = require("node:path");

const BADGES = [
  ["staff", "Staff", "Discord Çalışanı", "5e74e9b61934fc1f67c65515d1f7e60d", ["staff", "discord_staff"]],
  ["partner", "Partner", "Discord İş Ortağı", "3f9748e53446a137a052f3454e2de41e", ["partner"]],
  ["hypesquad", "Hypesquad", "HypeSquad Etkinlikleri", "bf01d1073931f921909045f3a39fd264", ["hypesquad"]],
  ["bughunter1", "BugHunterLevel1", "Hata Avcısı (1. Seviye)", "2717692c7dca7289b35297368a940dd0", ["bughunter", "bug_hunter"]],
  ["bravery", "HypeSquadOnlineHouse1", "HypeSquad Cesaret", "8a88d63823d8a71cd5e390baa45efa02", ["bravery", "hypesquad_bravery"]],
  ["brilliance", "HypeSquadOnlineHouse2", "HypeSquad Parlaklık", "011940fd013da3f7fb926e4a1cd2e618", ["brilliance", "hypesquad_brilliance"]],
  ["balance", "HypeSquadOnlineHouse3", "HypeSquad Denge", "3aa41de486fa12454c3761e8e223442e", ["balance", "hypesquad_balance"]],
  ["earlysupporter", "PremiumEarlySupporter", "İlk Destekçi", "7060786766c9c840eb3019e725d2b358", ["early_supporter"]],
  ["bughunter2", "BugHunterLevel2", "Hata Avcısı (2. Seviye)", "848f79194d4be5ff5f81505cbd0ce1e6", ["bughunter2"]],
  ["earlydeveloper", "VerifiedDeveloper", "İlk Doğrulanmış Bot Geliştiricisi", "6df5892e0f35b051f8b61eace34f4967", ["early_verified_bot_developer", "verified_developer"]],
  ["moderator", "CertifiedModerator", "Moderatör Programı Mezunu", "fee1624003e2fee35cb398e125dc479b", ["certified_moderator", "moderator"]],
].map(([id, flag, label, hash, emojiAliases]) => ({ id, flag, label, hash, emojiAliases,
  imageURL: `https://cdn.discordapp.com/badge-icons/${hash}.png`, fallback: "🏅" }));

const imageCache = new Map();
function getBadges(user) {
  if (!user?.flags?.has) return [];
  return BADGES.filter(badge => user.flags.has(badge.flag)).map(badge => {
    if (!imageCache.has(badge.id)) {
      try { imageCache.set(badge.id, fs.readFileSync(path.join(__dirname, `../../assets/Hesap/Rozetler/${badge.id}.png`))); }
      catch { imageCache.set(badge.id, null); }
    }
    return { ...badge, image: imageCache.get(badge.id) };
  });
}

function getPrimaryGuild(user) {
  const guild = user?.primaryGuild;
  if (guild?.identityEnabled !== true || !guild.tag || !/^\d{17,20}$/.test(guild.identityGuildId || "")) return null;
  const badgeHash = /^[a-f0-9]+$/i.test(guild.badge || "") ? guild.badge : null;
  return { tag: guild.tag, identityGuildId: guild.identityGuildId, badgeHash,
    badgeURL: badgeHash ? `https://cdn.discordapp.com/guild-tag-badges/${guild.identityGuildId}/${badgeHash}.png?size=64` : null };
}

module.exports = { getBadges, getPrimaryGuild, BADGES };
