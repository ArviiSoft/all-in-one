const os = require("os");
const readline = require("readline");
const stringWidth = require("string-width");
const packageInfo = require("../../package.json");

// eslint-disable-next-line no-control-regex -- Görünür metin genişliği hesaplanırken ANSI kodlarındaki ESC karakteri temizlenir.
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const GRAPHEME_SEGMENTER = new Intl.Segmenter("tr", { granularity: "grapheme" });
const COLORS_ENABLED = process.env.NO_COLOR === undefined
  && process.env.FORCE_COLOR !== "0"
  && (Boolean(process.stdout.isTTY) || process.env.FORCE_COLOR === "1");

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  brightCyan: "\x1b[96m",
  green: "\x1b[32m",
  brightGreen: "\x1b[92m",
  yellow: "\x1b[33m",
  brightYellow: "\x1b[93m",
  red: "\x1b[31m",
  brightRed: "\x1b[91m",
  magenta: "\x1b[35m",
  white: "\x1b[97m",
  gray: "\x1b[90m",
};

function color(text, ...codes) {
  if (!COLORS_ENABLED || codes.length === 0) return String(text);
  return `${codes.join("")}${text}${ANSI.reset}`;
}

function stripAnsi(text) {
  return String(text).replace(ANSI_PATTERN, "");
}

function visibleLength(text) {
  return stringWidth(stripAnsi(text));
}

function truncate(text, width) {
  const value = String(text);
  const plain = stripAnsi(value);
  if (visibleLength(plain) <= width) return value;
  if (width <= 0) return "";
  if (width === 1) return "…";

  const targetWidth = width - 1;
  let result = "";
  let resultWidth = 0;

  for (const { segment } of GRAPHEME_SEGMENTER.segment(plain)) {
    const segmentWidth = stringWidth(segment);
    if (resultWidth + segmentWidth > targetWidth) break;
    result += segment;
    resultWidth += segmentWidth;
  }

  return `${result}…`;
}

function fit(text, width, align = "left") {
  let value = String(text);
  let length = visibleLength(value);

  if (length > width) {
    value = truncate(stripAnsi(value), width);
    length = visibleLength(value);
  }

  const padding = " ".repeat(Math.max(0, width - length));
  return align === "right" ? `${padding}${value}` : `${value}${padding}`;
}

function terminalWidth() {
  const detected = Number(process.stdout.columns) || 96;
  return Math.max(42, Math.min(detected, 118));
}

function alignSides(left, right, width) {
  const safeLeft = String(left);
  const safeRight = String(right);
  const availableForLeft = Math.max(1, width - visibleLength(safeRight) - 1);
  const fittedLeft = fit(safeLeft, availableForLeft);
  return `${fittedLeft} ${safeRight}`;
}

function wrapText(text, width) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (visibleLength(next) <= width) {
      current = next;
      continue;
    }

    if (current) lines.push(current);
    current = visibleLength(word) > width ? truncate(word, width) : word;
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function wrapParts(parts, separator, width) {
  const lines = [];
  let current = "";

  for (const part of parts) {
    const next = current ? `${current}${separator}${part}` : part;
    if (visibleLength(next) <= width) {
      current = next;
      continue;
    }

    if (current) lines.push(current);
    current = visibleLength(part) > width ? truncate(stripAnsi(part), width) : part;
  }

  if (current) lines.push(current);
  return lines;
}

function border(text) {
  return color(text, ANSI.gray);
}

function makePanel(title, lines, options = {}) {
  const width = options.width || terminalWidth();
  const contentWidth = width - 4;
  const safeTitle = truncate(title, Math.max(1, width - 7));
  const titleDashCount = Math.max(0, width - visibleLength(safeTitle) - 5);
  const top = `${border("╭─ ")}${color(safeTitle, ANSI.bold, ANSI.brightCyan)} ${border("─".repeat(titleDashCount) + "╮")}`;
  const bottom = border(`╰${"─".repeat(width - 2)}╯`);
  const separator = border(`├${"─".repeat(width - 2)}┤`);

  const rendered = lines.map((line) => {
    if (line === null) return separator;
    return `${border("│")} ${fit(line, contentWidth)} ${border("│")}`;
  });

  return [top, ...rendered, bottom].join("\n");
}

function clearTerminal() {
  if (!process.stdout.isTTY || process.env.TERMINAL_CLEAR_ON_START === "0") return;
  process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
}

function isPanelMessage(message) {
  return stripAnsi(message).trimStart().startsWith("╭─");
}

function inferLogLevel(type, source) {
  const text = stripAnsi(source);
  const benignNegative = /(?:bulunamadı|bulunmamaktadır|kimse yok|hata yok|bozuk .* yok)/i.test(text);

  if (type === "error") return "failed";
  if (type === "warn" || text.trimStart().startsWith("⚠")) return "warning";
  if (!benignNegative && /^[\s🔴🛑❌]/u.test(text)) return "failed";
  return "info";
}

function logStyle(level) {
  if (level === "failed") {
    return { symbol: "🔴", label: "HATA", ansi: ANSI.brightRed };
  }
  if (level === "warning") {
    return { symbol: "⚠️", label: "UYARI", ansi: ANSI.brightYellow };
  }
  return { symbol: "🟢", label: "HAZIR", ansi: ANSI.brightGreen };
}

function parseLogLine(line, type = "log", fallbackTag = "SİSTEM") {
  const source = stripAnsi(line).trim();
  if (!source) return null;

  const tagged = source.match(/^.*?\[([^\]]+)\]\s*(.*)$/u);
  const tag = tagged ? tagged[1].trim() : fallbackTag;
  const message = tagged ? tagged[2].trim() : source;

  return {
    tag: tag || fallbackTag,
    message: message || "Durum bilgisi alındı.",
    level: inferLogLevel(type, source),
    type,
    time: new Date(),
    hasTag: Boolean(tagged),
  };
}

function parseConsoleMessage(message, type = "log") {
  const entries = [];
  let fallbackTag = "SİSTEM";

  for (const line of String(message).split(/\r?\n/)) {
    const entry = parseLogLine(line, type, fallbackTag);
    if (!entry) continue;
    if (entry.hasTag) fallbackTag = entry.tag;
    entries.push(entry);
  }

  return entries;
}

function createStartupLogCapture() {
  const entries = [];

  return {
    entries,
    interceptor({ type, message }) {
      if (isPanelMessage(message)) return false;
      entries.push(...parseConsoleMessage(message, type));
      return type !== "error" && type !== "warn";
    },
  };
}

function renderServiceCard(group, width) {
  const worstLevel = group.items.some((item) => item.level === "failed")
    ? "failed"
    : group.items.some((item) => item.level === "warning")
      ? "warning"
      : "info";
  const style = logStyle(worstLevel);
  const lines = [alignSides(
    `${color(style.symbol, style.ansi)} ${color(group.tag, ANSI.bold, ANSI.cyan)}`,
    color(style.label, style.ansi),
    width,
  )];

  for (const item of group.items) {
    const itemStyle = logStyle(item.level);
    const symbolWidth = visibleLength(itemStyle.symbol);
    const wrapped = wrapText(item.message, Math.max(1, width - symbolWidth - 1));
    wrapped.forEach((line, index) => {
      const symbol = index === 0
        ? color(itemStyle.symbol, itemStyle.ansi)
        : " ".repeat(symbolWidth);
      lines.push(`${symbol} ${line}`);
    });
  }

  lines.push("");
  return lines;
}

function renderServicePanel(entries) {
  const width = terminalWidth();
  const contentWidth = width - 4;
  const grouped = new Map();

  for (const entry of entries) {
    if (!grouped.has(entry.tag)) grouped.set(entry.tag, []);
    grouped.get(entry.tag).push(entry);
  }

  const failedCount = entries.filter((entry) => entry.level === "failed").length;
  const warningCount = entries.filter((entry) => entry.level === "warning").length;
  const summary = wrapParts([
    color(`🔧 ${grouped.size} SERVİS`, ANSI.white, ANSI.bold),
    color(`📖 ${entries.length} KAYIT`, ANSI.gray),
    color(`⚠️ ${warningCount} UYARI`, warningCount > 0 ? ANSI.brightYellow : ANSI.gray),
    color(`🔴 ${failedCount} HATA`, failedCount > 0 ? ANSI.brightRed : ANSI.gray),
  ], color("  ·  ", ANSI.gray), contentWidth);

  const columnCount = contentWidth >= 78 ? 2 : 1;
  const gap = columnCount === 2 ? 4 : 0;
  const columnWidth = Math.floor((contentWidth - gap) / columnCount);
  const columns = Array.from({ length: columnCount }, () => []);

  for (const [tag, items] of grouped) {
    const card = renderServiceCard({ tag, items }, columnWidth);
    const target = columns.reduce(
      (shortest, column) => column.length < shortest.length ? column : shortest,
      columns[0],
    );
    target.push(...card);
  }

  const body = [];
  const bodyHeight = Math.max(1, ...columns.map((column) => column.length));
  for (let row = 0; row < bodyHeight; row++) {
    const cells = columns.map((column) => fit(column[row] || "", columnWidth));
    body.push(columnCount === 2
      ? `${cells[0]}${color("  │ ", ANSI.gray)}${cells[1]}`
      : cells[0]);
  }

  const lines = [
    ...summary,
    null,
    ...(entries.length > 0 ? body : [color("Başlatma servisi kaydı bulunmuyor.", ANSI.gray)]),
    null,
    color("BAŞLATMA KONTROLLERİ TOPLANDI", failedCount > 0 ? ANSI.brightYellow : ANSI.brightGreen, ANSI.bold),
  ];

  return makePanel("◆ SERVICE MATRIX", lines, { width });
}

function statusStyle(status) {
  if (status === "loaded") {
    return { symbol: "🟢", label: "YÜKLENDİ", ansi: ANSI.brightGreen };
  }
  if (status === "failed") {
    return { symbol: "🔴", label: "HATA", ansi: ANSI.brightRed };
  }
  if (status === "ignored") {
    return { symbol: "⚪", label: "YARDIMCI", ansi: ANSI.gray };
  }
  return { symbol: "🟡", label: "ATLANDI", ansi: ANSI.brightYellow };
}

function gridColumns(contentWidth) {
  if (contentWidth >= 102) return 3;
  if (contentWidth >= 68) return 2;
  return 1;
}

function renderItemGrid(items, contentWidth) {
  const columns = gridColumns(contentWidth);
  const gap = 2;
  const cellWidth = Math.floor((contentWidth - gap * (columns - 1)) / columns);
  const rows = [];

  for (let index = 0; index < items.length; index += columns) {
    const cells = [];
    for (let column = 0; column < columns; column++) {
      const item = items[index + column];
      if (!item) {
        cells.push(" ".repeat(cellWidth));
        continue;
      }

      const style = statusStyle(item.status);
      const name = truncate(item.name, Math.max(1, cellWidth - visibleLength(style.symbol) - 1));
      cells.push(fit(`${color(style.symbol, style.ansi)} ${name}`, cellWidth));
    }
    rows.push(cells.join(" ".repeat(gap)).trimEnd());
  }

  return rows;
}

function renderLoadPanel({
  title,
  groups,
  counts,
  durationMs,
  footer,
  footerStatus = counts.failed > 0 ? "warning" : "success",
  total = counts.loaded + counts.skipped + (counts.ignored || 0) + counts.failed,
}) {
  const width = terminalWidth();
  const contentWidth = width - 4;
  const lines = [];
  const summaryParts = [
    color(`📂 ${total} DOSYA`, ANSI.white, ANSI.bold),
    color(`🟢 ${counts.loaded} YÜKLENDİ`, ANSI.brightGreen),
    color(`🟡 ${counts.skipped} ATLANDI`, ANSI.brightYellow),
    ...((counts.ignored || 0) > 0
      ? [color(`⚪ ${counts.ignored} YARDIMCI`, ANSI.gray)]
      : []),
    color(`🔴 ${counts.failed} HATA`, counts.failed > 0 ? ANSI.brightRed : ANSI.gray),
    color(`🕚 ${durationMs} ms`, ANSI.brightCyan),
  ];

  lines.push(...wrapParts(summaryParts, color("  ·  ", ANSI.gray), contentWidth));
  lines.push(null);

  groups.forEach((group, groupIndex) => {
    const loaded = group.items.filter((item) => item.status === "loaded");
    const exceptional = group.items.filter((item) => item.status !== "loaded");
    const categorySummary = `${loaded.length}/${group.items.length} YÜKLENDİ`;

    lines.push(alignSides(
      color((group.label || group.name).toLocaleUpperCase("tr-TR"), ANSI.bold, ANSI.cyan),
      color(categorySummary, ANSI.gray),
      contentWidth,
    ));

    lines.push(...renderItemGrid(loaded, contentWidth));

    for (const item of exceptional) {
      const style = statusStyle(item.status);
      const detail = item.detail || style.label;
      const nameWidth = contentWidth
        - visibleLength(detail)
        - visibleLength(style.symbol)
        - 2;
      lines.push(alignSides(
        `${color(style.symbol, style.ansi)} ${truncate(item.name, Math.max(1, nameWidth))}`,
        color(detail, style.ansi),
        contentWidth,
      ));
    }

    if (groupIndex < groups.length - 1) lines.push("");
  });

  lines.push(null);
  const footerColor = footerStatus === "failed"
    ? ANSI.brightRed
    : footerStatus === "warning"
      ? ANSI.brightYellow
      : ANSI.brightGreen;
  lines.push(...wrapText(footer, contentWidth).map((line) => color(line, footerColor, ANSI.bold)));

  return makePanel(title, lines, { width });
}

function formatBytes(bytes, decimals = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** unitIndex);
  return `${value.toFixed(unitIndex === 0 ? 0 : decimals)} ${units[unitIndex]}`;
}

function formatDuration(totalSeconds) {
  let seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;

  const parts = [];
  if (days) parts.push(`${days}g`);
  if (hours) parts.push(`${hours}sa`);
  if (minutes) parts.push(`${minutes}dk`);
  if (seconds || parts.length === 0) parts.push(`${seconds}sn`);
  return parts.join(" ");
}

function progressBar(value, total, size = 18) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  const filled = Math.round(ratio * size);
  return `${color("━".repeat(filled), ANSI.brightCyan)}${color("─".repeat(size - filled), ANSI.gray)}`;
}

function metric(label, value, width) {
  const rawLabel = color(label, ANSI.gray);
  const rawValue = color(value, ANSI.white, ANSI.bold);
  return fit(alignSides(rawLabel, rawValue, width), width);
}

function runtimeMetrics(client) {
  const memory = process.memoryUsage();
  const totalMemory = os.totalmem();
  const usedMemory = totalMemory - os.freemem();
  const guildCount = client?.guilds?.cache?.size || 0;
  const userCount = client?.guilds?.cache
    ? client.guilds.cache.reduce((sum, guild) => sum + (guild.memberCount || 0), 0)
    : 0;
  const ping = Number.isFinite(client?.ws?.ping) && client.ws.ping >= 0
    ? `${Math.round(client.ws.ping)} ms`
    : "hazırlanıyor";

  return {
    memory,
    totalMemory,
    usedMemory,
    guildCount,
    userCount,
    ping,
  };
}

function renderSystemPanel(client, stats = {}, activities = []) {
  const width = terminalWidth();
  const contentWidth = width - 4;
  const gap = 3;
  const useTwoColumns = contentWidth >= 60;
  const cellWidth = useTwoColumns ? Math.floor((contentWidth - gap) / 2) : contentWidth;
  const metrics = runtimeMetrics(client);
  const botName = client?.user?.tag || client?.user?.username || "Discord botu";
  const now = new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date());
  const recentActivities = activities.slice(-4);

  const metricRows = useTwoColumns
    ? [
      `${metric("UPTIME", formatDuration(process.uptime()), cellWidth)}${" ".repeat(gap)}${metric("PING", metrics.ping, cellWidth)}`,
      `${metric("BOT RAM", formatBytes(metrics.memory.rss), cellWidth)}${" ".repeat(gap)}${metric("HEAP", `${formatBytes(metrics.memory.heapUsed)} / ${formatBytes(metrics.memory.heapTotal)}`, cellWidth)}`,
      `${metric("SUNUCU / KULLANICI", `${metrics.guildCount} / ${metrics.userCount}`, cellWidth)}${" ".repeat(gap)}${metric("EVENT / KOMUT", `${stats.events || 0} / ${stats.commands || 0}`, cellWidth)}`,
    ]
    : [
      metric("UPTIME", formatDuration(process.uptime()), cellWidth),
      metric("PING", metrics.ping, cellWidth),
      metric("BOT RAM", formatBytes(metrics.memory.rss), cellWidth),
      metric("HEAP", `${formatBytes(metrics.memory.heapUsed)} / ${formatBytes(metrics.memory.heapTotal)}`, cellWidth),
      metric("SUNUCU / KULLANICI", `${metrics.guildCount} / ${metrics.userCount}`, cellWidth),
      metric("EVENT / KOMUT", `${stats.events || 0} / ${stats.commands || 0}`, cellWidth),
    ];

  const lines = [
    alignSides(
      `${color("💚", ANSI.brightGreen)} ${color("SİSTEM ÇEVRİMİÇİ", ANSI.brightGreen, ANSI.bold)}  ${color(botName, ANSI.white)}`,
      `${color("● LIVE", ANSI.brightGreen, ANSI.bold)}  ${color(now, ANSI.gray)}`,
      contentWidth,
    ),
    null,
    ...metricRows,
    "",
    alignSides(
      `${color("SİSTEM RAM", ANSI.gray)}  ${progressBar(metrics.usedMemory, metrics.totalMemory, Math.max(8, Math.min(24, Math.floor(contentWidth / 3))))}`,
      color(`${formatBytes(metrics.usedMemory, 1)} / ${formatBytes(metrics.totalMemory, 1)}  ${Math.round((metrics.usedMemory / metrics.totalMemory) * 100)}%`, ANSI.white),
      contentWidth,
    ),
    color(`${os.platform()} ${os.arch()}  ·  Node ${process.version}  ·  PID ${process.pid}`, ANSI.gray),
    null,
    alignSides(
      color("CANLI AKIŞ", ANSI.bold, ANSI.cyan),
      color(`${recentActivities.length} SON KAYIT`, ANSI.gray),
      contentWidth,
    ),
    ...(recentActivities.length > 0
      ? recentActivities.map((entry) => {
        const style = logStyle(entry.level);
        const time = entry.time.toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        return `${color(time, ANSI.gray)}  ${color(style.symbol, style.ansi)} ${color(`[${entry.tag}]`, ANSI.cyan)} ${entry.message}`;
      })
      : [color("Canlı servis aktivitesi bekleniyor...", ANSI.gray)]),
  ];

  return makePanel("◆ ALL IN ONE  /  RUNTIME", lines, { width });
}

function printStartupBanner() {
  const width = terminalWidth();
  const contentWidth = width - 4;
  const now = new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "full",
    timeStyle: "medium",
  }).format(new Date());
  const environmentLines = contentWidth >= 68
    ? [alignSides(
      color(`Node ${process.version}  ·  ${os.platform()} ${os.arch()}`, ANSI.gray),
      color(now, ANSI.gray),
      contentWidth,
    )]
    : [
      color(`Node ${process.version}  ·  ${os.platform()} ${os.arch()}`, ANSI.gray),
      color(now, ANSI.gray),
    ];
  const lines = [
    alignSides(
      color("ALL IN ONE", ANSI.white, ANSI.bold),
      color(`v${packageInfo.version}`, ANSI.brightCyan, ANSI.bold),
      contentWidth,
    ),
    color("Sistem başlatılıyor...", ANSI.gray),
    "",
    ...environmentLines,
  ];

  console.log(`\n${makePanel("◆ BOOT SEQUENCE", lines, { width })}\n`);
}

function renderRuntimePulse(client) {
  const metrics = runtimeMetrics(client);
  return [
    color("◆ RUNTIME", ANSI.brightCyan, ANSI.bold),
    `${color("UPTIME", ANSI.gray)} ${color(formatDuration(process.uptime()), ANSI.white)}`,
    `${color("RAM", ANSI.gray)} ${color(formatBytes(metrics.memory.rss), ANSI.white)}`,
    `${color("HEAP", ANSI.gray)} ${color(`${formatBytes(metrics.memory.heapUsed)} / ${formatBytes(metrics.memory.heapTotal)}`, ANSI.white)}`,
    `${color("PING", ANSI.gray)} ${color(metrics.ping, ANSI.white)}`,
    `${color("SUNUCU", ANSI.gray)} ${color(metrics.guildCount, ANSI.white)}`,
  ].join(color("  ·  ", ANSI.gray));
}

function startRuntimeMonitor(client, stats = {}) {
  const configuredRefresh = Number(process.env.TERMINAL_STATUS_REFRESH_MS);
  const refreshMs = Number.isFinite(configuredRefresh)
    ? Math.max(250, Math.min(configuredRefresh, 60_000))
    : 1000;
  const interactive = Boolean(process.stdout.isTTY)
    && process.env.TERMINAL_LIVE_DASHBOARD !== "0";
  const activities = [parseLogLine(
    `[İZLEME] Canlı metrik akışı ${refreshMs} ms yenileme aralığıyla başlatıldı.`,
    "log",
  )];
  let renderedLineCount = 0;
  let rendered = false;
  let rendering = false;

  function clearRenderedPanel() {
    if (!interactive || !rendered) return;
    readline.moveCursor(process.stdout, 0, -renderedLineCount);
    readline.cursorTo(process.stdout, 0);
    readline.clearScreenDown(process.stdout);
    rendered = false;
  }

  function render() {
    if (rendering) return;
    rendering = true;

    try {
      const panel = renderSystemPanel(client, stats, activities);
      if (interactive) clearRenderedPanel();
      process.stdout.write(`${panel}\n`);
      renderedLineCount = panel.split("\n").length;
      rendered = interactive;
    } finally {
      rendering = false;
    }
  }

  function addActivities(message, type) {
    activities.push(...parseConsoleMessage(message, type));
    if (activities.length > 50) activities.splice(0, activities.length - 50);
  }

  function interceptor(context) {
    if (!interactive) return false;

    const panelMessage = isPanelMessage(context.message);
    if (!panelMessage) addActivities(context.message, context.type);
    const mustPrintAbove = context.type === "warn"
      || context.type === "error"
      || panelMessage;

    if (mustPrintAbove) {
      clearRenderedPanel();
      context.write();
      rendered = false;
    }

    render();
    return true;
  }

  render();

  const timer = interactive
    ? setInterval(render, refreshMs)
    : setInterval(() => process.stdout.write(`${renderRuntimePulse(client)}\n`), 30 * 60 * 1000);
  timer.unref?.();

  const resizeHandler = () => render();
  if (interactive) process.stdout.on("resize", resizeHandler);

  return {
    interceptor,
    stop({ clear = false } = {}) {
      clearInterval(timer);
      if (interactive) process.stdout.off("resize", resizeHandler);
      if (clear) clearRenderedPanel();
    },
  };
}

module.exports = {
  clearTerminal,
  createStartupLogCapture,
  printStartupBanner,
  renderLoadPanel,
  renderRuntimePulse,
  renderServicePanel,
  renderSystemPanel,
  startRuntimeMonitor,
};
