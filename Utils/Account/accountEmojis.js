"use strict";
const emojiler = require("../Emojis/emojiler");
const { createHash } = require("node:crypto");
const { fetchImageBuffer } = require("./accountCardRenderer");
const states = new WeakMap();

function findEmoji(client, name, aliases = []) {
  return client.application?.emojis?.cache?.find(emoji => emoji.name === name)
    || aliases.map(alias => emojiler.getEmoji(alias)).find(Boolean) || null;
}

async function waitForEmoji(pending, deadline) {
  let timer;
  try {
    return await Promise.race([pending, new Promise(resolve => {
      timer = setTimeout(() => resolve(null), Math.max(0, deadline - Date.now()));
    })]);
  } finally { clearTimeout(timer); }
}

async function resolveEmoji(client, { name, aliases, attachment, tag = false }, deadline) {
  const existing = findEmoji(client, name, aliases);
  if (existing) return existing.toString();
  if (Date.now() >= deadline) return null;
  if (!attachment || !client.application?.emojis?.create) return null;
  let state = states.get(client);
  if (!state) states.set(client, state = { pending: new Map(), retryAfter: 0 });
  if (state.retryAfter > Date.now()) return null;
  if (state.pending.has(name)) return waitForEmoji(state.pending.get(name), deadline);
  const pendingTags = Array.from(state.pending.keys()).filter(key => key.startsWith("account_tag_")).length;
  if (tag && (client.application.emojis.cache?.filter(emoji => emoji.name?.startsWith("account_tag_")).size || 0) + pendingTags >= 40) return null;
  const pending = (async () => {
    const image = Buffer.isBuffer(attachment) ? attachment : await fetchImageBuffer(attachment);
    if (!image) return null;
    return client.application.emojis.create({ name, attachment: image });
  })()
    .then(emoji => emoji?.toString() || null)
    .catch(error => {
      state.retryAfter = Date.now() + 10 * 60_000;
      console.warn("[HESAP BİLGİ] Rozet emojisi hazırlanamadı:", error?.code || error?.name || "Discord hatası");
      return null;
    }).finally(() => state.pending.delete(name));
  state.pending.set(name, pending);
  return waitForEmoji(pending, deadline);
}

async function prepareAccountEmojis(client, badges, primaryGuild, { timeoutMs = 6_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const prepared = [];
  for (const badge of badges) {
    const emoji = await resolveEmoji(client, {
      name: `account_${badge.id}`.slice(0, 32), aliases: badge.emojiAliases || [],
      attachment: badge.image || badge.imageURL,
    }, deadline);
    prepared.push({ ...badge, emoji });
  }
  if (!primaryGuild) return { badges: prepared, primaryGuild: null };
  const emoji = await resolveEmoji(client, {
    name: `account_tag_${createHash("sha256").update(`${primaryGuild.identityGuildId}:${primaryGuild.badgeHash || ""}`).digest("hex").slice(0, 16)}`,
    aliases: [], attachment: primaryGuild.badgeURL, tag: true,
  }, deadline);
  return { badges: prepared, primaryGuild: { ...primaryGuild, emoji } };
}

module.exports = { prepareAccountEmojis };