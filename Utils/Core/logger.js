const { ContainerBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, WebhookClient } = require("discord.js");
const fs = require("./databaseFs");
const path = require("path");
const { loadEnv } = require("./env");

loadEnv();

const jsonPath = path.join(__dirname, "../../Database/Sistem/botLog.json");
const nativeConsole = {
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};
const failedWebhooks = new Set();
const webhookClients = new Map();
const lastMessages = new Map();
const suppressedMessages = new Map();
const pendingRecords = [];

// eslint-disable-next-line no-control-regex -- ANSI renk kodlarını temizlemek için ESC karakteri bilerek eşleştirilir.
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const MAX_COMPONENT_BODY_LENGTH = 3_600;
const MAX_COMPONENT_CHARACTERS_PER_MESSAGE = 5_800;
const MAX_CONTAINERS_PER_MESSAGE = 5;
const MAX_RECORD_LENGTH = 3_300;
const MAX_BATCH_RECORDS = 40;
const DEFAULT_BATCH_DELAY_MS = 1_200;
const LOG_COLORS = {
  info: 0x5865f2,
  debug: 0x3498db,
  warning: 0xfee75c,
  error: 0xed4245,
};

const DUPLICATE_COOLDOWNS_MS = {
  log: 2 * 60 * 1000,
  debug: 2 * 60 * 1000,
  warn: 30 * 60 * 1000,
  error: 10 * 60 * 1000,
};

let alreadyHooked = false;
let consoleInterceptor = null;
let flushTimer = null;
let flushPromise = Promise.resolve();

function getBatchDelay() {
  const configured = Number(process.env.DISCORD_LOG_BATCH_MS);
  if (!Number.isFinite(configured)) return DEFAULT_BATCH_DELAY_MS;
  return Math.max(250, Math.min(configured, 5_000));
}

function getWebhookEntries() {
  try {
    if (!fs.existsSync(jsonPath)) return [];
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const seen = new Set();
    const unique = [];

    for (const [guildId, entry] of Object.entries(data)) {
      const url = entry?.webhookURL;
      if (entry.enabled !== false && url && !failedWebhooks.has(url) && !seen.has(url)) {
        seen.add(url);
        unique.push({ ...entry, guildId });
      }
    }

    return unique;
  } catch {
    return [];
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripAnsi(message) {
  return String(message).replace(ANSI_PATTERN, "");
}

function maskSensitive(message) {
  let safeMessage = String(message);
  const secretKeys = [
    "DISCORD_TOKEN",
    "MONGODB_URI",
    "ABUSEIPDB_API_KEY",
    "IPINFO_TOKEN",
    "OPENWEATHER_API_KEY",
    "API_NINJAS_KEY",
    "SCREENSHOTMACHINE_KEY",
  ];

  for (const key of secretKeys) {
    const value = process.env[key];
    if (value && value.length >= 6) {
      safeMessage = safeMessage.replace(new RegExp(escapeRegExp(value), "g"), `[${key}_GIZLENDI]`);
    }
  }

  return safeMessage
    .replace(/mongodb(?:\+srv)?:\/\/[^\s'"<>]+/gi, "[MONGODB_URI_GIZLENDI]")
    .replace(/[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}/g, "[DISCORD_TOKEN_GIZLENDI]")
    .replace(/https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/gi, "[WEBHOOK_GIZLENDI]");
}

function normalizeForDedupe(message) {
  return stripAnsi(message)
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeMarkdown(message) {
  return String(message)
    .replace(/\\/g, "\\\\")
    .replace(/([`*_~|>])/g, "\\$1");
}

function severityFor(type, message) {
  const source = stripAnsi(message).trimStart();
  const benignNegative = /(?:bulunamadı|bulunmamaktadır|kimse yok|hata yok|hatalı .* bulunamadı|\b0\s+hata\b)/i.test(source);

  if (type === "error" || /^[🛑❌🔴]/u.test(source)) return "error";
  if (type === "warn" || /^[⚠🟡]/u.test(source)) return "warning";
  if (!benignNegative && /(?:^|\s)\[?(?:HATA|ERROR|FATAL)\]?(?:\s|:|$)/i.test(source)) return "error";
  if (type === "debug") return "debug";
  return "info";
}

function severityIcon(severity) {
  return {
    error: "🔴",
    warning: "🟡",
    debug: "🔵",
    info: "🟢",
  }[severity] || "🟢";
}

function severityLabel(severity) {
  return {
    error: "Hata",
    warning: "Uyarı",
    debug: "Debug",
    info: "Bilgi",
  }[severity] || "Bilgi";
}

function panelTitleFrom(message) {
  const firstLine = stripAnsi(message).trim().split(/\r?\n/, 1)[0] || "";
  const match = firstLine.match(/^╭─\s*(.*?)\s+─+╮$/u);
  return match?.[1]?.trim() || null;
}

function panelContentLines(message) {
  const lines = stripAnsi(message).trim().split(/\r?\n/);
  const content = [];

  for (const rawLine of lines.slice(1, -1)) {
    const line = rawLine.trim();
    if (/^[├┝┠┣┤┥┨┫─]+$/u.test(line)) continue;
    if (!line.startsWith("│")) continue;

    const withoutEdges = line
      .replace(/^│\s?/u, "")
      .replace(/\s?│$/u, "")
      .trim();
    content.push(withoutEdges);
  }

  return content;
}

function normalizePanelLine(line) {
  return String(line)
    .trim()
    .replace(/\s*·\s*/g, " · ")
    .replace(/\s{2,}/g, " · ");
}

function createPanelRecord(message, type, now) {
  const rawTitle = panelTitleFrom(message);
  if (!rawTitle) return null;

  if (/SERVICE MATRIX/i.test(rawTitle)) return { skip: true };

  const content = panelContentLines(message);
  const titleMap = [
    [/BOOT SEQUENCE/i, "🚀 Bot başlatılıyor"],
    [/EVENT LOADER/i, "🧩 Event yükleyici"],
    [/COMMAND LOADER/i, "⌨️ Komut yükleyici"],
  ];
  const mappedTitle = titleMap.find(([pattern]) => pattern.test(rawTitle))?.[1];
  const isLoader = /(?:EVENT|COMMAND) LOADER/i.test(rawTitle);
  let selectedLines;

  if (isLoader) {
    const summary = content.find((line) => /\bDOSYA\b/i.test(line));
    const footer = [...content].reverse().find((line) => (
      /(?:TAMAMLANDI|YÜKLENDİ|SENKRONİZE|BAŞARISIZ|İPTAL)/i.test(line)
    ));
    const problemLines = content.filter((line) => (
      line !== summary
      && line !== footer
      && /(?:🔴|🟡|⚪|\bHATA\b|\bATLANDI\b|\bYARDIMCI\b)/u.test(line)
    ));
    selectedLines = [summary, ...problemLines.slice(0, 8), footer].filter(Boolean);
  } else {
    selectedLines = content.filter(Boolean);
  }

  const description = selectedLines
    .map(normalizePanelLine)
    .filter((line, index, lines) => line && line !== lines[index - 1])
    .join("\n");

  return {
    kind: "panel",
    title: mappedTitle || `📋 ${rawTitle.replace(/^◆\s*/u, "")}`,
    message: description || "Panel güncellendi.",
    severity: severityFor(type, message),
    time: now,
  };
}

function createLogRecord(message, type, now = new Date()) {
  const safeMessage = stripAnsi(maskSensitive(message)).trim();
  if (!safeMessage) return null;

  const panel = createPanelRecord(safeMessage, type, now);
  if (panel) return panel;

  return {
    kind: "line",
    message: safeMessage,
    severity: severityFor(type, safeMessage),
    time: now,
  };
}

function formatLineRecord(record) {
  const flattened = record.message
    .replace(/\r?\n+/g, "  ↳  ")
    .replace(/[\t ]+/g, " ")
    .trim();
  const tagged = flattened.match(/^(?:[^[]*?)\[([^\]\n]{1,60})\]\s*(.*)$/u);
  if (!tagged) return `- ${escapeMarkdown(flattened)}`;

  const tag = escapeMarkdown(tagged[1].trim());
  const body = escapeMarkdown(tagged[2].trim() || "Durum bilgisi alındı.");
  return `- **${tag}** · ${body}`;
}

function splitText(text, limit) {
  const chunks = [];
  let remaining = String(text).trim();

  while (remaining.length > limit) {
    const candidate = remaining.slice(0, limit + 1);
    const newlineAt = candidate.lastIndexOf("\n");
    const spaceAt = candidate.lastIndexOf(" ");
    const splitAt = newlineAt > limit * 0.55
      ? newlineAt
      : spaceAt > limit * 0.55
        ? spaceAt
        : limit;

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function unixTimestamp(date) {
  return Math.floor(date.getTime() / 1000);
}

function smallDivider() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function logContainer({ title, body, color, time, recordCount = null }) {
  const timestamp = unixTimestamp(time);
  const footer = recordCount === null
    ? `-# Güncellendi <t:${timestamp}:R>`
    : `-# ${recordCount} kayıt · <t:${timestamp}:R>`;

  return new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}`),
    )
    .addSeparatorComponents(smallDivider())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(body),
    )
    .addSeparatorComponents(smallDivider())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(footer),
    );
}

function containerForLines(lines, records, severity) {
  const recordCount = new Set(records).size;
  const latestTime = records.reduce((latest, record) => (
    record.time > latest ? record.time : latest
  ), records[0].time);

  return logContainer({
    title: `${severityIcon(severity)} ${severityLabel(severity)}`,
    body: lines.join("\n"),
    color: LOG_COLORS[severity],
    time: latestTime,
    recordCount,
  });
}

function groupRecordsBySeverity(records) {
  const groups = new Map();

  for (const record of records) {
    if (!groups.has(record.severity)) groups.set(record.severity, []);
    groups.get(record.severity).push(record);
  }

  return groups;
}

function buildLineContainers(records) {
  const containers = [];

  for (const [severity, severityRecords] of groupRecordsBySeverity(records)) {
    let lines = [];
    let usedRecords = [];
    let length = 0;

    function commit() {
      if (lines.length === 0) return;
      containers.push(containerForLines(lines, usedRecords, severity));
      lines = [];
      usedRecords = [];
      length = 0;
    }

    for (const record of severityRecords) {
      const formatted = formatLineRecord(record);
      const pieces = splitText(formatted, MAX_RECORD_LENGTH);

      for (let index = 0; index < pieces.length; index++) {
        const piece = index === 0 ? pieces[index] : `↳ ${pieces[index]}`;
        const separatorLength = lines.length > 0 ? 1 : 0;

        if (length + separatorLength + piece.length > MAX_COMPONENT_BODY_LENGTH) commit();
        lines.push(piece);
        usedRecords.push(record);
        length += (lines.length > 1 ? 1 : 0) + piece.length;
      }
    }

    commit();
  }

  return containers;
}

function buildPanelContainers(record) {
  const chunks = splitText(escapeMarkdown(record.message), MAX_COMPONENT_BODY_LENGTH);

  return chunks.map((body, index) => logContainer({
    title: chunks.length > 1
      ? `${record.title} · ${index + 1}/${chunks.length}`
      : record.title,
    body,
    color: LOG_COLORS[record.severity],
    time: record.time,
  }));
}

function buildDiscordComponents(records) {
  const components = [];
  let lineRecords = [];

  function commitLines() {
    if (lineRecords.length === 0) return;
    components.push(...buildLineContainers(lineRecords));
    lineRecords = [];
  }

  for (const record of records) {
    if (!record || record.skip) continue;
    if (record.kind === "panel") {
      commitLines();
      components.push(...buildPanelContainers(record));
    } else {
      lineRecords.push(record);
    }
  }

  commitLines();
  return components;
}

function componentCharacterCount(component) {
  const json = typeof component.toJSON === "function" ? component.toJSON() : component;
  return String(json.content || "").length
    + (json.components || []).reduce((total, child) => (
      total + componentCharacterCount(child)
    ), 0);
}

function packComponentsForMessages(components) {
  const groups = [];
  let current = [];
  let currentLength = 0;

  for (const component of components) {
    const componentLength = componentCharacterCount(component);
    const exceedsCount = current.length >= MAX_CONTAINERS_PER_MESSAGE;
    const exceedsLength = current.length > 0
      && currentLength + componentLength > MAX_COMPONENT_CHARACTERS_PER_MESSAGE;

    if (exceedsCount || exceedsLength) {
      groups.push(current);
      current = [];
      currentLength = 0;
    }

    current.push(component);
    currentLength += componentLength;
  }

  if (current.length > 0) groups.push(current);
  return groups;
}

function getWebhookClient(url) {
  if (!webhookClients.has(url)) {
    webhookClients.set(url, new WebhookClient({ url }));
  }
  return webhookClients.get(url);
}

function forgetWebhook(url, permanently = false) {
  const webhook = webhookClients.get(url);
  webhook?.destroy?.();
  webhookClients.delete(url);
  if (permanently) failedWebhooks.add(url);
}

async function deliverComponents(entries, components) {
  const componentGroups = packComponentsForMessages(components);

  await Promise.all(entries.map(async (entry) => {
    const webhook = getWebhookClient(entry.webhookURL);
    const username = entry.username || "Bot Log";
    const avatarURL = entry.avatarURL || "https://cdn.discordapp.com/embed/avatars/0.png";

    for (const group of componentGroups) {
      try {
        await webhook.send({
          components: group,
          flags: MessageFlags.IsComponentsV2,
          withComponents: true,
          username,
          avatarURL,
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        const status = Number(error?.status || error?.httpStatus);
        const permanent = [401, 403, 404].includes(status);
        forgetWebhook(entry.webhookURL, permanent);
        nativeConsole.warn(
          `⚠️ [LOGGER] Webhook gönderimi başarısız (${entry.guildId || "bilinmeyen sunucu"}):`,
          error?.message || error,
        );
        break;
      }
    }
  }));
}

async function flushRecordBatch(records) {
  const entries = getWebhookEntries();
  if (entries.length === 0) return;

  const components = buildDiscordComponents(records);
  if (components.length === 0) return;
  await deliverComponents(entries, components);
}

function flushDiscordLogs() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (pendingRecords.length === 0) return flushPromise;
  const records = pendingRecords.splice(0, pendingRecords.length);
  flushPromise = flushPromise
    .then(() => flushRecordBatch(records))
    .catch((error) => {
      nativeConsole.error("🔴 [LOGGER] Log kuyruğu gönderilemedi:", error?.message || error);
    });
  return flushPromise;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flushDiscordLogs, getBatchDelay());
  flushTimer.unref?.();
}

function sendToDiscordLog(message, type = "log") {
  if (!message) return;

  const now = Date.now();
  const key = `${type}:${normalizeForDedupe(message)}`;
  const last = lastMessages.get(key);
  const cooldown = DUPLICATE_COOLDOWNS_MS[type] || DUPLICATE_COOLDOWNS_MS.log;

  if (last && now - last < cooldown) {
    const suppressed = suppressedMessages.get(key) || { count: 0, since: now };
    suppressed.count += 1;
    suppressedMessages.set(key, suppressed);
    return;
  }

  lastMessages.set(key, now);
  const suppressed = suppressedMessages.get(key);
  suppressedMessages.delete(key);

  for (const [storedKey, storedAt] of lastMessages) {
    if (now - storedAt > 60 * 60 * 1000) {
      lastMessages.delete(storedKey);
      suppressedMessages.delete(storedKey);
    }
  }

  let messageWithSummary = message;
  if (suppressed?.count) {
    const minutes = Math.max(1, Math.round((now - suppressed.since) / 60_000));
    messageWithSummary += `\n[LOGGER] Aynı kayıt ${minutes} dakika içinde ${suppressed.count} kez tekrarlandı; tekrarlar gizlendi.`;
  }

  const record = createLogRecord(messageWithSummary, type, new Date(now));
  if (!record || record.skip) return;
  pendingRecords.push(record);

  if (pendingRecords.length >= MAX_BATCH_RECORDS) {
    flushDiscordLogs();
  } else {
    scheduleFlush();
  }
}

function serializeConsoleArg(value) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack || value.message || String(value);
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value, (_, nestedValue) => (
        typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue
      ), 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function hookConsole() {
  if (alreadyHooked) return;
  alreadyHooked = true;

  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  for (const type of Object.keys(original)) {
    console[type] = (...args) => {
      const msg = args.map(serializeConsoleArg).join(" ");

      let handled = false;
      if (typeof consoleInterceptor === "function") {
        try {
          handled = consoleInterceptor({
            type,
            args,
            message: msg,
            write: () => original[type](...args),
          }) === true;
        } catch (interceptorError) {
          original.error("🔴 [TERMINAL UI] Konsol yönlendiricisi hata verdi:", interceptorError);
        }
      }

      if (!handled) original[type](...args);
      sendToDiscordLog(msg, type);
    };
  }

  process.on("unhandledRejection", (reason) => {
    const msg = `🔴 Unhandled Promise Rejection:\n${reason?.stack || reason}`;
    console.error(msg);
  });

  process.on("uncaughtException", (error) => {
    const msg = `🛑 Uncaught Exception:\n${error?.stack || error}`;
    console.error(msg);
  });

  process.on("warning", (warning) => {
    const msg = `⚠️ Node Warning:\n${warning?.stack || warning}`;
    console.warn(msg);
  });

  process.once("beforeExit", () => {
    flushDiscordLogs();
  });
}

function setConsoleInterceptor(interceptor) {
  consoleInterceptor = typeof interceptor === "function" ? interceptor : null;
}

module.exports = { flushDiscordLogs, hookConsole, setConsoleInterceptor };
