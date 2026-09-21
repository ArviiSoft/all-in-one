const { performance } = require("perf_hooks");

const DISCORD_TIME_URL = "https://discord.com/api/v10/gateway";
const DEFAULT_CHECK_INTERVAL_MS = 5 * 1000;
const DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_RETRY_INTERVAL_MS = 60 * 1000;
const DEFAULT_MAX_CLOCK_AGE_MS = 15 * 60 * 1000;

const formatterCache = new Map();

function getFormatter(timeZone) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(timeZone, new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }));
  }

  return formatterCache.get(timeZone);
}

function getZonedDateTime(epochMs, timeZone) {
  const values = {};
  for (const part of getFormatter(timeZone).formatToParts(new Date(epochMs))) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function isScheduledMinute(epochMs, { timeZone, hour, minute }) {
  const zoned = getZonedDateTime(epochMs, timeZone);
  return zoned.hour === hour && zoned.minute === minute;
}

async function fetchDiscordClockReference({
  fetchImpl = globalThis.fetch,
  monotonicNow = () => performance.now(),
  timeoutMs = 10 * 1000,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Bu Node.js sürümü HTTP saat doğrulaması için fetch desteği sunmuyor.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = monotonicNow();

  try {
    const response = await fetchImpl(DISCORD_TIME_URL, {
      headers: { "user-agent": "ALL-In-One-Backup-Scheduler/1.0" },
      signal: controller.signal,
    });
    const finishedAt = monotonicNow();

    if (!response.ok) {
      throw new Error(`Discord saat isteği HTTP ${response.status} döndürdü.`);
    }

    const dateHeader = response.headers.get("date");
    const serverEpochMs = Date.parse(dateHeader || "");
    if (!Number.isFinite(serverEpochMs)) {
      throw new Error("Discord yanıtında geçerli bir Date başlığı bulunamadı.");
    }
    await response.body?.cancel?.();

    return {
      epochMs: serverEpochMs + 500,
      monotonicMs: (startedAt + finishedAt) / 2,
      roundTripMs: finishedAt - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getTrustedEpochMs(reference, monotonicNow = () => performance.now()) {
  return reference.epochMs + (monotonicNow() - reference.monotonicMs);
}

function startTrustedDailyScheduler({
  timeZone,
  hour,
  minute,
  triggerEveryMinute = false,
  onTrigger,
  label = "Günlük görev",
  fetchClockReference = fetchDiscordClockReference,
  monotonicNow = () => performance.now(),
  localNow = () => Date.now(),
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
  syncIntervalMs = DEFAULT_SYNC_INTERVAL_MS,
  retryIntervalMs = DEFAULT_RETRY_INTERVAL_MS,
  maxClockAgeMs = DEFAULT_MAX_CLOCK_AGE_MS,
  logger = console,
} = {}) {
  const validDailyTime = Number.isInteger(hour)
    && hour >= 0
    && hour <= 23
    && Number.isInteger(minute)
    && minute >= 0
    && minute <= 59;

  if (
    !timeZone
    || (!triggerEveryMinute && !validDailyTime)
  ) {
    throw new TypeError(
      triggerEveryMinute
        ? "Dakikalık zamanlayıcı için timeZone zorunludur."
        : "Zamanlayıcı için geçerli bir timeZone, saat ve dakika zorunludur.",
    );
  }
  if (typeof onTrigger !== "function") {
    throw new TypeError("Zamanlayıcı için onTrigger fonksiyonu zorunludur.");
  }

  let clockReference = null;
  let nextSyncAt = 0;
  let syncPromise = null;
  let checkPromise = null;
  let lastTriggeredKey = null;
  let lastStaleWarningAt = Number.NEGATIVE_INFINITY;
  let stopped = false;

  async function syncClock() {
    if (syncPromise) return syncPromise;

    syncPromise = (async () => {
      try {
        const reference = await fetchClockReference();
        if (stopped) return false;

        clockReference = reference;
        const nowMonotonic = monotonicNow();
        nextSyncAt = nowMonotonic + syncIntervalMs;

        const trustedNow = getTrustedEpochMs(reference, monotonicNow);
        const driftMs = localNow() - trustedNow;
        if (Math.abs(driftMs) >= 60 * 1000) {
          logger.warn(
            `⚠️ [YEDEK SİSTEMİ] Sistem saati Discord saatinden ${Math.round(Math.abs(driftMs) / 1000)} saniye `
            + `${driftMs > 0 ? "ileri" : "geri"}. Yedek zamanında güvenilir Discord saati kullanılacak.`,
          );
        }

        return true;
      } catch (error) {
        nextSyncAt = monotonicNow() + retryIntervalMs;
        logger.error(`🔴 [YEDEK SİSTEMİ] Discord saati doğrulanamadı: ${error.message}`);
        return false;
      } finally {
        syncPromise = null;
      }
    })();

    return syncPromise;
  }

  async function checkNow() {
    if (stopped) return;
    if (checkPromise) return checkPromise;

    checkPromise = (async () => {
      const nowMonotonic = monotonicNow();
      if (!clockReference) {
        if (nowMonotonic >= nextSyncAt) await syncClock();
      } else if (nowMonotonic >= nextSyncAt) {
        void syncClock();
      }

      if (!clockReference) return;

      const clockAgeMs = monotonicNow() - clockReference.monotonicMs;
      if (clockAgeMs > maxClockAgeMs) {
        if (nowMonotonic - lastStaleWarningAt >= retryIntervalMs) {
          lastStaleWarningAt = nowMonotonic;
          logger.error(`🔴 [YEDEK SİSTEMİ] Güvenilir saat ${Math.round(clockAgeMs / 1000)} saniyedir yenilenemedi; erken yedek engellendi.`);
        }
        return;
      }

      const trustedEpochMs = getTrustedEpochMs(clockReference, monotonicNow);
      const zoned = getZonedDateTime(trustedEpochMs, timeZone);
      const triggerKey = triggerEveryMinute
        ? `${zoned.dateKey}-${String(zoned.hour).padStart(2, "0")}:${String(zoned.minute).padStart(2, "0")}`
        : zoned.dateKey;
      const matchesSchedule = triggerEveryMinute
        || (zoned.hour === hour && zoned.minute === minute);

      if (!matchesSchedule || lastTriggeredKey === triggerKey) {
        return;
      }

      lastTriggeredKey = triggerKey;
      try {
        await onTrigger({
          dateKey: zoned.dateKey,
          epochMs: trustedEpochMs,
          timeZone,
          hour: zoned.hour,
          minute: zoned.minute,
        });
      } catch (error) {
        lastTriggeredKey = null;
        throw error;
      }
    })()
      .catch((error) => {
        logger.error(`🔴 [YEDEK SİSTEMİ] ${label} çalıştırılamadı:`, error);
      })
      .finally(() => {
        checkPromise = null;
      });

    return checkPromise;
  }

  logger.log(
    triggerEveryMinute
      ? `⏰ [YEDEK SİSTEMİ] ${label}: sunucu planları her dakika kontrol edilecek (${timeZone}).`
      : `⏰ [YEDEK SİSTEMİ] ${label}: her gün ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} (${timeZone}).`,
  );

  const timer = setInterval(() => {
    void checkNow();
  }, checkIntervalMs);
  timer.unref?.();
  void checkNow();

  return {
    checkNow,
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

function startTrustedMinuteScheduler(options = {}) {
  return startTrustedDailyScheduler({
    ...options,
    triggerEveryMinute: true,
  });
}

module.exports = {
  DISCORD_TIME_URL,
  fetchDiscordClockReference,
  getTrustedEpochMs,
  getZonedDateTime,
  isScheduledMinute,
  startTrustedDailyScheduler,
  startTrustedMinuteScheduler,
};