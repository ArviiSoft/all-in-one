const { renderBadge } = require('./boostRenderer');

const states = new WeakMap();
const emojiName = level => `arvis_boost_${level}`;

function getBadgeEmoji(client, level) {
  return client?.application?.emojis?.cache?.find(emoji => emoji.name === emojiName(level)) || null;
}

async function ensureBoostEmojis(client) {
  if (!client?.application?.emojis) return false;
  const state = states.get(client) || { pending: null, retryAfter: 0 };
  states.set(client, state);
  if (state.pending) return state.pending;
  if (Date.now() < state.retryAfter) return false;
  if (Array.from({ length: 9 }, (_, index) => getBadgeEmoji(client, index + 1)).every(Boolean)) return true;
  state.pending = (async () => {
    try {
      await client.application.emojis.fetch();
      for (let level = 1; level <= 9; level++) {
        if (!getBadgeEmoji(client, level)) {
          await client.application.emojis.create({ name: emojiName(level), attachment: await renderBadge(level) });
        }
      }
      return true;
    } catch (error) {
      state.retryAfter = Date.now() + 10 * 60_000;
      console.warn('⚠️ [BOOST] Rozet emojileri yüklenemedi, PNG görseller kullanılacak:', error.message);
      return false;
    } finally {
      state.pending = null;
    }
  })();
  return state.pending;
}

function badgeText(client, level) {
  return getBadgeEmoji(client, level)?.toString() || '💎';
}

module.exports = { ensureBoostEmojis, getBadgeEmoji, badgeText };