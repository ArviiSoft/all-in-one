const axios = require("axios");

const TDK_ENDPOINT = "https://sozluk.gov.tr/gts";
const REQUEST_TIMEOUT_MS = 4_000;
const VALID_CACHE_TTL = 12 * 60 * 60_000;
const INVALID_CACHE_TTL = 60 * 60_000;
const UNAVAILABLE_CACHE_TTL = 30_000;
const MAX_CACHE_SIZE = 5_000;

const cache = new Map();
const pendingRequests = new Map();
let lastUnavailableWarningAt = 0;

function normalizeWord(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFC");
}

function pruneCache() {
  const now = Date.now();
  for (const [word, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(word);
  }

  while (cache.size >= MAX_CACHE_SIZE) {
    cache.delete(cache.keys().next().value);
  }
}

function setCache(word, result, ttl) {
  pruneCache();
  cache.set(word, { result, expiresAt: Date.now() + ttl });
  return result;
}

function getCached(word) {
  const entry = cache.get(word);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(word);
    return null;
  }
  return entry.result;
}

function parseResponse(data) {
  if (typeof data !== "string") return data;
  return JSON.parse(data);
}

function responseContainsExactWord(data, word) {
  if (!Array.isArray(data)) return false;

  return data.some(entry => (
    normalizeWord(entry?.madde) === word
    || normalizeWord(entry?.madde_duz) === word
  ));
}

async function requestWord(word) {
  try {
    const response = await axios.get(TDK_ENDPOINT, {
      params: { ara: word },
      timeout: REQUEST_TIMEOUT_MS,
      responseType: "json",
      maxRedirects: 2,
      headers: {
        Accept: "application/json",
        "User-Agent": "ALL-In-One-Discord-Bot/0.0.7",
      },
    });
    const data = parseResponse(response.data);
    const valid = responseContainsExactWord(data, word);

    return setCache(
      word,
      { available: true, valid, source: "tdk" },
      valid ? VALID_CACHE_TTL : INVALID_CACHE_TTL
    );
  } catch (error) {
    if (Date.now() - lastUnavailableWarningAt >= 60_000) {
      lastUnavailableWarningAt = Date.now();
      console.warn(`⚠️ [TDK SÖZLÜK] Canlı sorgu kullanılamadı, yerel listeye dönülecek: ${error.message}`);
    }

    return setCache(
      word,
      { available: false, valid: null, source: "local-fallback" },
      UNAVAILABLE_CACHE_TTL
    );
  }
}

async function checkTdkWord(value) {
  const word = normalizeWord(value);
  if (!word || !/^[a-zçğıöşüâîû]+$/iu.test(word)) {
    return { available: true, valid: false, source: "input" };
  }

  const cached = getCached(word);
  if (cached) return cached;
  if (pendingRequests.has(word)) return pendingRequests.get(word);

  const request = requestWord(word).finally(() => pendingRequests.delete(word));
  pendingRequests.set(word, request);
  return request;
}

module.exports = { checkTdkWord, normalizeWord };