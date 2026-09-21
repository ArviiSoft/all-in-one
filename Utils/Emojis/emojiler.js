const EMOJI_NAME_ALIASES = Object.freeze({
  fourdkalp: "4dkalp",
  koc: "aries",
  boga: "taurus",
  ikizler: "gemini",
  yengec: "cancer",
  aslan: "leo",
  basak: "virgo",
  terazi: "libra",
  akrep: "scorpio",
  yay: "sagittarius",
  oglak: "capricorn",
  kova: "aquarius",
  balik: "pisces",
  gezegen: "aura",
  colorized_volume_max: "screenshare_volume_max",
  chart: "chart_increasing",
  system: "sistemler",
  bilgi: "info",
  girissagok: "girisok",
  cikissagok: "cikisok",
});

let emojisByLookupKey = new Map();
let emojisById = new Map();
let ambiguousLookupKeys = [];
let initialized = false;
let loadedAt = null;
let loadingPromise = null;

function normalizeName(value) {
  return String(value).trim().toLowerCase();
}

function getLookupKeys(value) {
  const originalName = normalizeName(value);
  if (!originalName) return [];

  const withoutLegacyId = originalName.replace(/_(?:\d+)?$/, "");
  const withoutBrandSuffix = withoutLegacyId.replace(/_(?:arviis|avriis)$/, "");
  const keys = new Set([originalName, withoutLegacyId, withoutBrandSuffix]);

  for (const key of [...keys]) {
    keys.add(key.replaceAll("_", ""));
  }

  keys.delete("");
  return [...keys];
}

function getEmoji(alias) {
  const normalizedAlias = normalizeName(alias);
  const emojiName = EMOJI_NAME_ALIASES[normalizedAlias] || normalizedAlias;

  for (const key of getLookupKeys(emojiName)) {
    const emoji = emojisByLookupKey.get(key);
    if (emoji) return emoji;
  }

  return null;
}

function getEmojiString(alias, fallback = "") {
  return getEmoji(alias)?.toString() || fallback;
}

function getEmojiId(alias, fallback = null) {
  return getEmoji(alias)?.id || fallback;
}

function getEmojiById(id) {
  return emojisById.get(String(id)) || null;
}

function getReactionEmoji(alias, fallback = null) {
  return getEmoji(alias) || fallback;
}

function getStatus() {
  return {
    initialized,
    loadedAt,
    count: emojisById.size,
    lookupCount: emojisByLookupKey.size,
    ambiguousLookupKeys: [...ambiguousLookupKeys],
  };
}

async function fetchApplicationEmojis(client) {
  if (!client?.application?.emojis) {
    throw new Error("Discord uygulaması hazır olmadığı için Application Emojis yüklenemedi.");
  }

  const fetched = await client.application.emojis.fetch();
  const nextByLookupKey = new Map();
  const nextById = new Map();
  const ambiguousKeys = new Set();

  for (const emoji of fetched.values()) {
    nextById.set(emoji.id, emoji);

    for (const key of getLookupKeys(emoji.name)) {
      const existing = nextByLookupKey.get(key);

      if (existing && existing.id !== emoji.id) {
        nextByLookupKey.delete(key);
        ambiguousKeys.add(key);
      } else if (!ambiguousKeys.has(key)) {
        nextByLookupKey.set(key, emoji);
      }
    }
  }

  emojisByLookupKey = nextByLookupKey;
  emojisById = nextById;
  ambiguousLookupKeys = [...ambiguousKeys].sort();
  initialized = true;
  loadedAt = new Date();

  return getStatus();
}

function loadApplicationEmojis(client) {
  if (loadingPromise) return loadingPromise;

  loadingPromise = fetchApplicationEmojis(client)
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
}

function ensureApplicationEmojis(client) {
  return initialized ? Promise.resolve(getStatus()) : loadApplicationEmojis(client);
}

const api = {};
Object.defineProperties(api, {
  loadApplicationEmojis: { value: loadApplicationEmojis },
  ensureApplicationEmojis: { value: ensureApplicationEmojis },
  getEmoji: { value: getEmoji },
  getEmojiString: { value: getEmojiString },
  getEmojiId: { value: getEmojiId },
  getEmojiById: { value: getEmojiById },
  getReactionEmoji: { value: getReactionEmoji },
});

module.exports = new Proxy(api, {
  get(target, property, receiver) {
    if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
    if (typeof property !== "string") return Reflect.get(target, property, receiver);
    return getEmojiString(property);
  },
  has(target, property) {
    if (Reflect.has(target, property)) return true;
    return typeof property === "string" && Boolean(getEmoji(property));
  },
});