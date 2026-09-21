const GUNLER = Object.freeze([
  "Pazar",
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
]);

const DEFAULT_ZAMANLAMA = Object.freeze({
  gun: 0,
  saat: 0,
  dakika: 0,
  zamanDilimi: "Europe/Istanbul",
  sonCalisma: null,
  baslangic: null,
});

const GUN_ALIASES = Object.freeze({
  pazar: 0,
  pazartesi: 1,
  sali: 2,
  carsamba: 3,
  persembe: 4,
  cuma: 5,
  cumartesi: 6,
});

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeZamanlama(value) {
  const source = value && typeof value === "object" ? value : {};
  const gun = Number(source.gun);
  const saat = Number(source.saat);
  const dakika = Number(source.dakika);

  return {
    gun: Number.isInteger(gun) && gun >= 0 && gun <= 6 ? gun : DEFAULT_ZAMANLAMA.gun,
    saat: Number.isInteger(saat) && saat >= 0 && saat <= 23 ? saat : DEFAULT_ZAMANLAMA.saat,
    dakika: Number.isInteger(dakika) && dakika >= 0 && dakika <= 59 ? dakika : DEFAULT_ZAMANLAMA.dakika,
    zamanDilimi: typeof source.zamanDilimi === "string" && source.zamanDilimi
      ? source.zamanDilimi
      : DEFAULT_ZAMANLAMA.zamanDilimi,
    sonCalisma: typeof source.sonCalisma === "string" ? source.sonCalisma : null,
    baslangic: typeof source.baslangic === "string" && Number.isFinite(Date.parse(source.baslangic))
      ? source.baslangic
      : null,
  };
}

function ayarlaZamanlama(value, patch = {}, date = new Date()) {
  const previous = normalizeZamanlama(value);
  const next = normalizeZamanlama({ ...previous, ...patch });
  const changed = ["gun", "saat", "dakika", "zamanDilimi"].some(key => previous[key] !== next[key]);
  if (changed || !next.baslangic) next.baslangic = date.toISOString();
  return next;
}

function parseGun(value) {
  const normalized = normalizeText(value);
  if (/^[0-7]$/.test(normalized)) {
    const numericDay = Number(normalized);
    if (numericDay === 0 || numericDay === 7) return 0;
    return numericDay;
  }

  return Object.prototype.hasOwnProperty.call(GUN_ALIASES, normalized)
    ? GUN_ALIASES[normalized]
    : null;
}

function parseSaat(value) {
  const match = String(value ?? "").trim().match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
  if (!match) return null;
  return { saat: Number(match[1]), dakika: Number(match[2]) };
}

function saatMetni(zamanlama) {
  const normalized = normalizeZamanlama(zamanlama);
  return `${String(normalized.saat).padStart(2, "0")}:${String(normalized.dakika).padStart(2, "0")}`;
}

function zamanlamaMetni(zamanlama) {
  const normalized = normalizeZamanlama(zamanlama);
  return `${GUNLER[normalized.gun]} ${saatMetni(normalized)}`;
}

function zonedDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    gun: weekdays[values.weekday],
    saat: Number(values.hour),
    dakika: Number(values.minute),
    calismaAnahtari: `${values.year}-${values.month}-${values.day}@${values.hour}:${values.minute}`,
  };
}

function calismaZamaniMi(zamanlama, date = new Date()) {
  const normalized = normalizeZamanlama(zamanlama);
  const now = zonedDateParts(date, normalized.zamanDilimi);
  const scheduledDay = new Date(`${now.calismaAnahtari.slice(0, 10)}T00:00:00Z`);
  let daysBack = (now.gun - normalized.gun + 7) % 7;
  if (daysBack === 0 && now.saat * 60 + now.dakika < normalized.saat * 60 + normalized.dakika) {
    daysBack = 7;
  }
  scheduledDay.setUTCDate(scheduledDay.getUTCDate() - daysBack);
  const calismaAnahtari = `${scheduledDay.toISOString().slice(0, 10)}@${saatMetni(normalized)}`;
  const baslangic = normalized.baslangic
    ? zonedDateParts(new Date(normalized.baslangic), normalized.zamanDilimi).calismaAnahtari
    : null;

  return {
    calismali: (!normalized.sonCalisma || calismaAnahtari > normalized.sonCalisma)
      && (baslangic ? calismaAnahtari >= baslangic : Boolean(normalized.sonCalisma) || calismaAnahtari === now.calismaAnahtari),
    calismaAnahtari,
  };
}

module.exports = {
  DEFAULT_ZAMANLAMA,
  GUNLER,
  ayarlaZamanlama,
  calismaZamaniMi,
  normalizeZamanlama,
  parseGun,
  parseSaat,
  saatMetni,
  zamanlamaMetni,
  zonedDateParts,
};