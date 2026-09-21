const fs = require("../Core/databaseFs");
const os = require("os");
const path = require("path");
const archiver = require("archiver");
const yaml = require("js-yaml");
const { ContainerBuilder, FileBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder, escapeMarkdown } = require("discord.js");
const ayarlar = require('../Core/generalSettings').settings;
const emojiler = require("../Emojis/emojiler.js");
const { getZonedDateTime, startTrustedMinuteScheduler } = require("../Scheduling/trustedDailyScheduler");
const { YEDEK_KLASORU, formatYedekSaati, yedekKlasorunuHazirla } = require("./yedekManager");
const { buildCleanupReport, findPreviousBackups, prunePreviousBackups } = require("./backupRetention");
const { getRuntime, flushDatabase } = require("../Database/runtime");
const { STATE_FILE, BACKUP_DIRECTORY, isInternalDatabasePath } = require("../Database/storagePaths");

const BOT_BACKUP_CONFIG_PATH = path.join(YEDEK_KLASORU, "bot-yedek-ayarlari.yaml");
const BOT_BACKUP_TIME_ZONE = "Europe/Istanbul";
const DAILY_BACKUP_DIR = path.join(__dirname, "../../Database/Yedekler/Bot Yedekleri");
const MEBIBYTE = 1024 ** 2;
const DEFAULT_UPLOAD_LIMIT_BYTES = 10 * MEBIBYTE;
const DEFAULT_BOT_BACKUP_CONFIG = Object.freeze({
  enabled: true,
  hour: 0,
  minute: 0,
  timeZone: BOT_BACKUP_TIME_ZONE,
  backupRoot: process.cwd(),
});
const DAILY_FOLDER_NAMES = Object.freeze([
  "Bot Yedeklerı",
  "Bot Yedekleri"
]);

function inlineCode(value, maxLength = 100) {
  const normalized = String(value ?? "Bilinmiyor").replace(/`/g, "'");
  const shortened = normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
  return `\`${shortened}\``;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Bilinmiyor";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function getTargetUploadLimitBytes(target) {
  const premiumTier = Number(target?.guild?.premiumTier || 0);
  if (premiumTier >= 3) return 100 * MEBIBYTE;
  if (premiumTier >= 2) return 50 * MEBIBYTE;
  return DEFAULT_UPLOAD_LIMIT_BYTES;
}

function buildBotBackupReportPayload({
  client,
  outputFile,
  fileSize,
  config,
  createdAt,
  cleanup,
  includeFile = false,
  attachmentLimitBytes = DEFAULT_UPLOAD_LIMIT_BYTES,
  attachmentFailed = false,
}) {
  const timestamp = Math.floor(createdAt / 1000);
  const fileName = path.basename(outputFile);
  const botName = client.user.displayName
    || client.user.globalName
    || client.user.username
    || "Bot";
  const avatarURL = client.user.displayAvatarURL?.({ extension: "png", size: 128 }) || null;
  const sourceName = path.basename(resolveBackupRoot(config.backupRoot));
  const attachmentStatus = includeFile
    ? `${emojiler.tik} ZIP dosyası rapora eklendi.`
    : attachmentFailed
      ? "⚠️ Discord dosya yüklemesini reddetti; rapor dosyasız gönderildi."
      : fileSize > attachmentLimitBytes
        ? `⚠️ Dosya ${formatBytes(attachmentLimitBytes)} yükleme sınırını aştığı için eklenemedi.`
        : "ZIP dosyası bu rapora eklenmedi.";
  const headerContent = [
    "## 🤖 Günlük Bot ZIP Yedeği",
    `**${escapeMarkdown(botName)}** dosyalarının ZIP yedeği başarıyla oluşturuldu.`,
  ].join("\n");
  const container = new ContainerBuilder().setAccentColor(0x57f287);

  if (avatarURL) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerContent))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarURL))
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(headerContent)
    );
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "### 📦 Yedek Özeti",
          `**ZIP dosyası:** ${inlineCode(fileName, 90)}`,
          `**Kaynak klasör:** ${inlineCode(sourceName, 70)}`,
          `**Kayıt konumu:** ${inlineCode("Database/Yedekler/Bot Yedekleri", 70)}`,
          `**Dosya boyutu:** ${inlineCode(formatBytes(fileSize))}`,
          `**Çalışma planı:** Her gün ${inlineCode(formatYedekSaati(config.hour, config.minute))} · ${inlineCode(config.timeZone)}`,
          `**Dosya eki:** ${attachmentStatus}`,
        ].join("\n")
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        buildCleanupReport(cleanup)
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# ${emojiler.tik} Otomatik ZIP yedeği tamamlandı · <t:${timestamp}:F> · <t:${timestamp}:R>`
      )
    );

  if (includeFile) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      )
      .addFileComponents(
        new FileBuilder().setURL(`attachment://${fileName}`)
      );
  }

  const payload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };

  if (includeFile) {
    payload.files = [{ attachment: outputFile, name: fileName }];
  }

  return payload;
}

async function getConfiguredBackupLogChannels(client) {
  const channels = new Map();

  for (const guild of client.guilds.cache.values()) {
    const logPath = path.join(YEDEK_KLASORU, `${guild.id}_log.yaml`);
    if (!fs.existsSync(logPath)) continue;

    try {
      const logData = yaml.load(fs.readFileSync(logPath, "utf8"));
      if (!logData?.kanalId) continue;

      const channel = guild.channels.cache.get(logData.kanalId)
        || await guild.channels.fetch?.(logData.kanalId).catch(() => null);
      if (channel?.isTextBased?.()) channels.set(channel.id, channel);
    } catch (error) {
      console.warn(`⚠️ [BOT YEDEĞİ] ${guild.name} log kanalı okunamadı: ${error.message}`);
    }
  }

  return [...channels.values()];
}

async function sendBotBackupReportToTarget(target, client, reportData, targetLabel) {
  const attachmentLimitBytes = getTargetUploadLimitBytes(target);
  const canAttach = reportData.fileSize <= attachmentLimitBytes;

  if (canAttach) {
    try {
      await target.send(buildBotBackupReportPayload({
        client,
        ...reportData,
        includeFile: true,
        attachmentLimitBytes,
      }));
      return { sent: true, attached: true };
    } catch (attachmentError) {
      console.warn(`⚠️ [BOT YEDEĞİ] ${targetLabel} ZIP dosyasıyla gönderilemedi: ${attachmentError.message}`);

      try {
        await target.send(buildBotBackupReportPayload({
          client,
          ...reportData,
          attachmentLimitBytes,
          attachmentFailed: true,
        }));
        return { sent: true, attached: false };
      } catch (reportError) {
        console.warn(`⚠️ [BOT YEDEĞİ] ${targetLabel} raporu gönderilemedi: ${reportError.message}`);
        return { sent: false, attached: false };
      }
    }
  }

  try {
    await target.send(buildBotBackupReportPayload({
      client,
      ...reportData,
      attachmentLimitBytes,
    }));
    return { sent: true, attached: false };
  } catch (reportError) {
    console.warn(`⚠️ [BOT YEDEĞİ] ${targetLabel} raporu gönderilemedi: ${reportError.message}`);
    return { sent: false, attached: false };
  }
}

async function sendBotBackupReport(client, reportData) {
  const delivery = {
    dmSent: false,
    dmAttached: false,
    logChannelCount: 0,
    logAttachmentCount: 0,
  };
  const botOwner = await client.users.fetch(ayarlar.sahipID).catch(error => {
    console.warn(`⚠️ [BOT YEDEĞİ] Bot sahibi alınamadı: ${error.message}`);
    return null;
  });

  if (botOwner) {
    const dmResult = await sendBotBackupReportToTarget(
      botOwner,
      client,
      reportData,
      "Yedek DM'i",
    );
    delivery.dmSent = dmResult.sent;
    delivery.dmAttached = dmResult.attached;
  }

  const logChannels = await getConfiguredBackupLogChannels(client);
  for (const channel of logChannels) {
    const logResult = await sendBotBackupReportToTarget(
      channel,
      client,
      reportData,
      `${channel.id} log kanalı`,
    );
    if (logResult.sent) delivery.logChannelCount += 1;
    if (logResult.attached) delivery.logAttachmentCount += 1;
  }

  if (logChannels.length === 0) {
    console.warn("⚠️ [BOT YEDEĞİ] Rapor gönderilecek ayarlı bir yedek-log kanalı bulunamadı.");
  }

  return delivery;
}

function normalizeBotBackupConfig(data = {}) {
  const timeMatch = typeof data?.saat === "string"
    ? data.saat.match(/^(\d{2}):(\d{2})$/)
    : null;
  const requestedHour = timeMatch ? Number(timeMatch[1]) : Number(data?.hour);
  const requestedMinute = timeMatch ? Number(timeMatch[2]) : Number(data?.minute);
  const validTime = Number.isInteger(requestedHour)
    && requestedHour >= 0
    && requestedHour <= 23
    && Number.isInteger(requestedMinute)
    && requestedMinute >= 0
    && requestedMinute <= 59;
  const configuredPath = typeof data?.dosyaYolu === "string"
    ? data.dosyaYolu.trim()
    : typeof data?.backupRoot === "string"
      ? data.backupRoot.trim()
      : "";

  return {
    enabled: data?.aktif !== false && data?.enabled !== false,
    hour: validTime ? requestedHour : DEFAULT_BOT_BACKUP_CONFIG.hour,
    minute: validTime ? requestedMinute : DEFAULT_BOT_BACKUP_CONFIG.minute,
    timeZone: BOT_BACKUP_TIME_ZONE,
    backupRoot: configuredPath || DEFAULT_BOT_BACKUP_CONFIG.backupRoot,
  };
}

function getBotBackupConfig() {
  if (!fs.existsSync(BOT_BACKUP_CONFIG_PATH)) {
    return { ...DEFAULT_BOT_BACKUP_CONFIG };
  }

  try {
    return normalizeBotBackupConfig(yaml.load(fs.readFileSync(BOT_BACKUP_CONFIG_PATH, "utf8")));
  } catch (error) {
    console.warn(`⚠️ [BOT YEDEĞİ] Ayarlar okunamadı: ${error.message}`);
    return { ...DEFAULT_BOT_BACKUP_CONFIG };
  }
}

function saveBotBackupConfig(updates = {}) {
  const current = getBotBackupConfig();
  const config = normalizeBotBackupConfig({
    aktif: updates.enabled ?? current.enabled,
    hour: updates.hour ?? current.hour,
    minute: updates.minute ?? current.minute,
    backupRoot: updates.backupRoot ?? current.backupRoot,
  });

  yedekKlasorunuHazirla();
  fs.writeFileSync(BOT_BACKUP_CONFIG_PATH, yaml.dump({
    aktif: config.enabled,
    saat: formatYedekSaati(config.hour, config.minute),
    saatDilimi: config.timeZone,
    dosyaYolu: config.backupRoot,
    updatedAt: Date.now(),
  }), "utf8");

  return config;
}

function isAbsoluteBackupPath(value) {
  const normalized = String(value || "").trim();
  return path.isAbsolute(normalized) || /^[A-Za-z]:[\\/]/.test(normalized);
}

function resolveBackupRoot(value) {
  const configured = String(value || process.cwd()).trim();
  return path.resolve(configured || process.cwd());
}

function validateBotBackupRoot(value) {
  const configured = String(value || "").trim();
  if (!configured) return "Bot dosyalarının bulunduğu klasör yolu boş bırakılamaz.";
  if (!isAbsoluteBackupPath(configured)) return "Dosya yolu mutlak olmalı. Örnek: `C:\\Botlar\\ALL In One` veya `/srv/bot`.";

  const runtimePath = resolveBackupRoot(configured);
  if (!fs.existsSync(runtimePath)) return "Belirtilen klasör bu sistemde bulunamadı.";

  try {
    if (!fs.statSync(runtimePath).isDirectory()) return "Belirtilen yol bir klasör değil.";
    fs.accessSync(runtimePath, fs.constants.R_OK | fs.constants.W_OK);
  } catch (error) {
    return `Klasör okunamıyor veya klasöre yazılamıyor: ${error.message}`;
  }

  return null;
}

function getDailyBackupFolder() {
  fs.mkdirSync(DAILY_BACKUP_DIR, { recursive: true });
  return DAILY_BACKUP_DIR;
}

function normalizeArchiveGlobPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function getArchiveIgnorePatterns(backupRoot = process.cwd()) {
  const ignorePatterns = [
    "node_modules/**",
    "Database/Yedekler/Bot Yedekleri",
    "Database/Yedekler/Bot Yedekleri/**",
    "**/Database/Yedekler/Bot Yedekleri",
    "**/Database/Yedekler/Bot Yedekleri/**",
  ];
  const resolvedBackupRoot = path.resolve(backupRoot);
  const backupFolders = [
    DAILY_BACKUP_DIR,
    ...DAILY_FOLDER_NAMES.map(folderName => path.join(resolvedBackupRoot, folderName)),
  ];

  for (const folder of backupFolders) {
    const relativePath = path.relative(resolvedBackupRoot, folder);
    if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) continue;

    const archivePath = normalizeArchiveGlobPath(relativePath);
    ignorePatterns.push(archivePath, archivePath + "/**");
  }

  return [...new Set(ignorePatterns)];
}

function currentDateKey() {
  return getZonedDateTime(Date.now(), BOT_BACKUP_TIME_ZONE).dateKey;
}

function mongoArchiveSnapshot(database, backupRoot) {
  if (database?.mode !== "mongo") return null;
  if (database.failedError) throw database.failedError;

  const databaseRoot = path.join(database.root, "Database");
  const isWithin = relative => relative !== ".."
    && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  const databaseRelative = path.relative(backupRoot, databaseRoot);
  let archivePrefix = "";
  let sourcePrefix = "";
  if (isWithin(databaseRelative)) {
    archivePrefix = normalizeArchiveGlobPath(databaseRelative);
  } else {
    const sourceRelative = path.relative(databaseRoot, backupRoot);
    if (!isWithin(sourceRelative)) return null;
    if (isInternalDatabasePath(normalizeArchiveGlobPath(sourceRelative))) return null;
    sourcePrefix = `${normalizeArchiveGlobPath(sourceRelative)}/`;
  }

  const archivePath = relative => archivePrefix ? `${archivePrefix}/${relative}` : relative;
  const entries = database.backend.list()
    .filter(entry => entry.path.startsWith(sourcePrefix))
    .map(entry => ({ name: archivePath(entry.path.slice(sourcePrefix.length)), content: entry.content }));
  const stateFile = path.join(database.root, STATE_FILE);
  const stateRelative = path.relative(backupRoot, stateFile);
  if (isWithin(stateRelative) && fs.existsSync(stateFile)) {
    entries.push({ name: normalizeArchiveGlobPath(stateRelative), content: fs.readFileSync(stateFile, "utf8") });
  }
  const backupRelative = path.relative(backupRoot, path.join(database.root, BACKUP_DIRECTORY));
  const localBackupJson = isWithin(backupRelative)
    ? ["**/*.json", "**/*.json.*"].map(pattern => `${normalizeArchiveGlobPath(backupRelative)}/${pattern}`)
    : [];
  return {
    entries,
    localBackupJson,
    ignore: [archivePath("**/*.json"), archivePath("**/*.json.*")],
  };
}

async function createZipBackup(options = {}) {
  const config = getBotBackupConfig();
  const requestedRoot = typeof options === "string" ? options : options.backupRoot;
  const dateKey = typeof options === "object" && options.dateKey
    ? options.dateKey
    : currentDateKey();
  const backupRoot = resolveBackupRoot(requestedRoot || config.backupRoot);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error("Geçersiz yedek tarihi.");

  if (!fs.existsSync(backupRoot) || !fs.statSync(backupRoot).isDirectory()) {
    throw new Error(`Bot kaynak klasörü bulunamadı: ${backupRoot}`);
  }

  await flushDatabase();
  const mongoSnapshot = mongoArchiveSnapshot(getRuntime(), backupRoot);

  const dailyFolder = getDailyBackupFolder();
  const previousBackups = findPreviousBackups(
    [dailyFolder, ...DAILY_FOLDER_NAMES.map(folderName => path.join(backupRoot, folderName))],
    file => /^backup-\d{4}-\d{2}-\d{2}\.zip$/.test(file),
  );

  const outputFile = path.join(dailyFolder, `backup-${dateKey}.zip`);
  const stagingFile = `${outputFile}.${process.pid}.tmp`;
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "all-in-one-backup-"));
  const tempFile = path.join(tempDirectory, `${path.basename(outputFile)}.tmp`);

  if (fs.existsSync(stagingFile)) fs.unlinkSync(stagingFile);

  const output = fs.createWriteStream(tempFile);
  const archive = archiver("zip", { zlib: { level: 9 } });
  const closePromise = new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("warning", error => {
      if (error.code === "ENOENT") console.warn("[AUTO BACKUP] Dosya atlandı:", error.message);
      else reject(error);
    });
    archive.on("error", reject);
  });

  archive.pipe(output);
  archive.glob("**/*", {
    cwd: backupRoot,
    dot: true,
    nocase: true,
    ignore: [
      ...getArchiveIgnorePatterns(backupRoot),
      ...(mongoSnapshot?.ignore || []),
    ],
  });

  if (mongoSnapshot) for (const entry of mongoSnapshot.entries) {
    archive.append(entry.content, { name: entry.name });
  }
  if (mongoSnapshot?.localBackupJson.length) {
    archive.glob(mongoSnapshot.localBackupJson, { cwd: backupRoot, dot: true, nocase: true });
  }

  try {
    await archive.finalize();
    await closePromise;

    const stats = fs.statSync(tempFile);
    if (stats.size < 22) throw new Error("ZIP dosyası boş veya eksik oluştu.");

    fs.copyFileSync(tempFile, stagingFile);
    fs.renameSync(stagingFile, outputFile);
    const cleanup = prunePreviousBackups(previousBackups, outputFile);

    console.log(`[AUTO BACKUP] Bot yedeği oluşturuldu: ${outputFile} ( ${stats.size} byte )`);
    return options.returnDetails ? { outputFile, cleanup } : outputFile;
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    if (fs.existsSync(stagingFile)) fs.unlinkSync(stagingFile);
    try {
      fs.rmdirSync(tempDirectory);
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn(`⚠️ [AUTO BACKUP] Geçici klasör temizlenemedi: ${error.message}`);
      }
    }
  }
}

function getLatestBotZip(config = getBotBackupConfig()) {
  const backupRoot = resolveBackupRoot(config.backupRoot);
  const candidates = [];
  const folders = [
    getDailyBackupFolder(),
    ...DAILY_FOLDER_NAMES.map(folderName => path.join(backupRoot, folderName)),
  ];

  for (const folder of [...new Set(folders.map(candidate => path.resolve(candidate)))]) {
    if (!fs.existsSync(folder)) continue;

    try {
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".zip")) continue;

        const filePath = path.join(folder, entry.name);
        const stats = fs.statSync(filePath);
        candidates.push({
          file: entry.name,
          folder: path.basename(folder),
          filePath,
          modifiedAt: stats.mtimeMs,
          size: stats.size,
        });
      }
    } catch (error) {
      console.warn(`⚠️ [BOT YEDEĞİ] ${path.basename(folder)} klasörü okunamadı: ${error.message}`);
    }
  }

  return candidates.sort((first, second) => second.modifiedAt - first.modifiedAt)[0] || null;
}

function getStatePath(botId) {
  return path.join(YEDEK_KLASORU, `.otomatik-bot-yedek-${botId}-durum.json`);
}

function readRunState(botId) {
  const statePath = getStatePath(botId);
  if (!fs.existsSync(statePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch (error) {
    console.warn(`⚠️ [BOT YEDEĞİ] Son çalışma kaydı okunamadı: ${error.message}`);
    return null;
  }
}

function getScheduledRun(dateKey, config) {
  const time = formatYedekSaati(config.hour, config.minute);
  return {
    runKey: `${dateKey}-${time.replace(":", "-")}`,
    scheduledFor: `${dateKey} ${time} ${config.timeZone}`,
  };
}

function hasCompletedRun(botId, runKey, scheduledFor) {
  const state = readRunState(botId);
  if (!state) return false;

  return state.lastRunKey === runKey
    || (!state.lastRunKey && state.scheduledFor === scheduledFor);
}

function writeRunState(botId, state) {
  const statePath = getStatePath(botId);
  const tempPath = `${statePath}.${process.pid}.tmp`;

  fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, statePath);
}

function acquireScheduledLock(botId, runKey) {
  const lockPath = path.join(YEDEK_KLASORU, `.otomatik-bot-yedek-${botId}-${runKey}.lock`);

  try {
    const descriptor = fs.openSync(lockPath, "wx");
    fs.writeFileSync(descriptor, `${process.pid}\n`, "utf8");
    fs.closeSync(descriptor);
  } catch (error) {
    if (error.code === "EEXIST") return null;
    throw error;
  }

  return () => {
    try {
      fs.unlinkSync(lockPath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn(`⚠️ [BOT YEDEĞİ] Zamanlayıcı kilidi silinemedi: ${error.message}`);
      }
    }
  };
}

function isBotBackupDue(config, { hour, minute }) {
  return config.enabled && config.hour === hour && config.minute === minute;
}

async function runScheduledBotBackup(client, { dateKey, epochMs, hour, minute }) {
  const config = getBotBackupConfig();
  if (!isBotBackupDue(config, { hour, minute })) return;

  const botId = client.user.id;
  const { runKey, scheduledFor } = getScheduledRun(dateKey, config);
  if (hasCompletedRun(botId, runKey, scheduledFor)) return;

  const releaseLock = acquireScheduledLock(botId, runKey);
  if (!releaseLock) return;

  try {
    if (hasCompletedRun(botId, runKey, scheduledFor)) return;

    console.log("⌛ [AUTO BACKUP] Planlanan bot ZIP yedeklemesi başlatılıyor...");
    const { outputFile, cleanup } = await createZipBackup({
      backupRoot: config.backupRoot,
      dateKey,
      returnDetails: true,
    });
    const stats = fs.statSync(outputFile);

    writeRunState(botId, {
      lastRunKey: runKey,
      lastRunDate: dateKey,
      scheduledFor,
      outputFile,
      size: stats.size,
    });

    await sendBotBackupReport(client, {
      outputFile,
      cleanup,
      fileSize: stats.size,
      config,
      createdAt: Number.isFinite(epochMs) ? epochMs : Date.now(),
    }).catch(error => {
      console.warn(`⚠️ [BOT YEDEĞİ] Yedek oluşturuldu ancak rapor dağıtılamadı: ${error.message}`);
    });
  } catch (error) {
    console.error("🔴 [AUTO BACKUP] Bot ZIP yedekleme hatası:", error);
  } finally {
    releaseLock();
  }
}

module.exports = function autoBackup(client) {
  getDailyBackupFolder();
  if (client.dailyBotBackupScheduler) return;

  client.dailyBotBackupScheduler = startTrustedMinuteScheduler({
    timeZone: BOT_BACKUP_TIME_ZONE,
    label: "Bot ZIP yedeği planı",
    onTrigger: scheduleInfo => runScheduledBotBackup(client, scheduleInfo),
  });
};

module.exports.BOT_BACKUP_CONFIG_PATH = BOT_BACKUP_CONFIG_PATH;
module.exports.DAILY_BACKUP_DIR = DAILY_BACKUP_DIR;
module.exports.DEFAULT_BOT_BACKUP_CONFIG = DEFAULT_BOT_BACKUP_CONFIG;
module.exports.buildBotBackupReportPayload = buildBotBackupReportPayload;
module.exports.createZipBackup = createZipBackup;
module.exports.getConfiguredBackupLogChannels = getConfiguredBackupLogChannels;
module.exports.getTargetUploadLimitBytes = getTargetUploadLimitBytes;
module.exports.getBotBackupConfig = getBotBackupConfig;
module.exports.getLatestBotZip = getLatestBotZip;
module.exports.isAbsoluteBackupPath = isAbsoluteBackupPath;
module.exports.isBotBackupDue = isBotBackupDue;
module.exports.normalizeBotBackupConfig = normalizeBotBackupConfig;
module.exports.resolveBackupRoot = resolveBackupRoot;
module.exports.runScheduledBotBackup = runScheduledBotBackup;
module.exports.saveBotBackupConfig = saveBotBackupConfig;
module.exports.sendBotBackupReport = sendBotBackupReport;
module.exports.sendBotBackupReportToTarget = sendBotBackupReportToTarget;
module.exports.validateBotBackupRoot = validateBotBackupRoot;
