const MIN_INTERVAL_MS = 10 * 60 * 1_000;
const MAX_TIMESTAMP_MS = 8_640_000_000_000_000;
const MONTH_MS = 30 * 86_400_000;
const YEAR_MS = 365 * 86_400_000;

const UNITS = {
  ms: 1, milisaniye: 1,
  sn: 1_000, saniye: 1_000,
  dk: 60_000, dakika: 60_000,
  sa: 3_600_000, saat: 3_600_000,
  gun: 86_400_000, gün: 86_400_000,
  hf: 604_800_000, hafta: 604_800_000,
  ay: MONTH_MS,
  yil: YEAR_MS, yıl: YEAR_MS, sene: YEAR_MS,
};

function isValidInterval(intervalMs, now = Date.now()) {
  return Number.isSafeInteger(intervalMs)
    && intervalMs >= MIN_INTERVAL_MS
    && intervalMs <= MAX_TIMESTAMP_MS - now;
}

function parseRandomMediaDuration(value, now = Date.now()) {
  if (typeof value !== "string") return null;
  const input = value.trim().toLocaleLowerCase("tr-TR").replace(/(\d),(\d)/g, "$1.$2");
  const tokens = /(\d+(?:\.\d+)?)\s*([a-zçğıöşü]+)/gu;
  let total = 0;
  let end = 0;
  let match;

  while ((match = tokens.exec(input)) !== null) {
    if (input.slice(end, match.index).trim()) return null;
    const multiplier = UNITS[match[2]];
    const amount = Number(match[1]);
    if (!multiplier || !Number.isFinite(amount)) return null;
    total += amount * multiplier;
    end = tokens.lastIndex;
  }

  if (!end || input.slice(end).trim()) return null;
  if (total < MIN_INTERVAL_MS) return null;
  const intervalMs = Math.round(total);
  return isValidInterval(intervalMs, now) ? intervalMs : null;
}

function formatRandomMediaDuration(intervalMs) {
  let remaining = intervalMs;
  const parts = [];
  for (const [duration, label] of [
    [YEAR_MS, "yıl"], [MONTH_MS, "ay"], [604_800_000, "hafta"],
    [86_400_000, "gün"], [3_600_000, "saat"], [60_000, "dakika"],
    [1_000, "saniye"], [1, "ms"],
  ]) {
    const amount = Math.floor(remaining / duration);
    if (!amount) continue;
    parts.push(`${amount} ${label}`);
    remaining -= amount * duration;
  }
  return parts.join(" ");
}

module.exports = {
  MIN_INTERVAL_MS,
  MAX_TIMESTAMP_MS,
  isValidInterval,
  parseRandomMediaDuration,
  formatRandomMediaDuration,
};