const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { readConfig, mongoDestination } = require("./config");
const { openPendingWrites, replayPendingWrites, createLiveBackend } = require('./pendingWrites');
const { STATE_FILE, PENDING_DIRECTORY, BACKUP_DIRECTORY, isInternalDatabasePath } = require('./storagePaths');

const DEFAULT_ROOT = path.resolve(__dirname, "../..");
let activeRuntime = null;

function exists(file) {
  try { fs.lstatSync(file); return true; } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function assertSafeFsPath(root, target) {
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("[DATABASE] Veritabanı yolu izin verilen klasörün dışına çıkamaz.");
  }
  let current = root;
  for (const segment of ["", ...relative.split(path.sep).filter(Boolean)]) {
    if (segment) current = path.join(current, segment);
    if (!exists(current)) continue;
    if (fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`[DATABASE] Sembolik bağlantı/junction üzerinden veri taşınamaz: ${current}`);
    }
  }
}

function atomicWrite(root, target, content) {
  assertSafeFsPath(root, target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, target);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (exists(temporary)) fs.unlinkSync(temporary);
  }
}

function isIgnored(relative) {
  return isInternalDatabasePath(relative)
    || relative.split("/").some((name) => /\.(?:bak|lock)$/i.test(name) || /\.(?:tmp|corrupt)-/i.test(name));
}

function validateRelativePath(relative) {
  if (typeof relative !== "string" || !relative || relative.includes("\\") || relative.includes(":")) {
    throw new Error("[DATABASE] MongoDB kaydı geçersiz bir dosya yolu içeriyor.");
  }
  const segments = relative.split("/");
  const invalid = segments.some((segment) => !segment || segment === "." || segment === ".."
    // eslint-disable-next-line no-control-regex -- Dosya yollarındaki ASCII kontrol karakterleri güvenlik için reddedilir.
    || /[<>"|?*\x00-\x1f]/.test(segment) || /[ .]$/.test(segment)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment));
  if (invalid || !/\.json$/i.test(relative) || isIgnored(relative) || path.posix.isAbsolute(relative)) {
    throw new Error(`[DATABASE] Güvenli olmayan JSON dosya yolu: ${relative}`);
  }
  return relative;
}

function validateEntries(entries) {
  if (!Array.isArray(entries)) throw new Error("[DATABASE] MongoDB dosya listesi geçersiz.");
  const seen = new Set();
  return entries.map((entry) => {
    const relative = validateRelativePath(entry?.path);
    const key = relative.toLowerCase();
    if (seen.has(key)) throw new Error(`[DATABASE] Birden fazla kayıt aynı dosya yoluna karşılık geliyor: ${relative}`);
    seen.add(key);
    if (typeof entry.content !== "string") throw new Error(`[DATABASE] JSON içeriği metin olmalıdır: ${relative}`);
    try { JSON.parse(entry.content); } catch {
      throw new Error(`[DATABASE] Geçersiz JSON nedeniyle veri taşıma durduruldu: ${relative}`);
    }
    return { path: relative, content: entry.content };
  }).sort((left, right) => left.path.localeCompare(right.path));
}

function walkDatabase(root) {
  const database = path.join(root, "Database");
  assertSafeFsPath(root, database);
  if (!exists(database)) return [];
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (isInternalDatabasePath(path.relative(database, absolute).split(path.sep).join("/"))) continue;
      if (entry.isSymbolicLink()) throw new Error(`[DATABASE] Sembolik bağlantı/junction üzerinden veri taşınamaz: ${absolute}`);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push({ path: path.relative(database, absolute).split(path.sep).join("/"), absolute });
      else throw new Error(`[DATABASE] Desteklenmeyen dosya türü: ${absolute}`);
    }
  }
  walk(database);
  return files;
}

function jsonSnapshot(root, logger) {
  const files = walkDatabase(root);
  const snapshot = [];
  for (const file of files) {
    if (!/\.json$/i.test(file.path) || isIgnored(file.path)) continue;
    let content = fs.readFileSync(file.absolute, "utf8");
    try { JSON.parse(content); } catch {
      const backup = `${file.absolute}.bak`;
      try {
        assertSafeFsPath(root, backup);
        content = fs.readFileSync(backup, "utf8");
        JSON.parse(content);
      } catch {
        throw new Error(`[DATABASE] ${file.path} bozuk ve geçerli .bak yedeği yok. Veri kaybını önlemek için taşıma durduruldu; dosyayı/yedeğini düzeltin ve yeniden başlatın.`);
      }
      logger.warn?.(`⚠️ [DATABASE] ${file.path} aktarım için geçerli .bak yedeğinden kurtarıldı.`);
    }
    snapshot.push({ path: file.path, content });
  }
  return validateEntries(snapshot);
}

function verifyEntries(expected, actual) {
  const verified = validateEntries(actual);
  if (expected.length !== verified.length || expected.some((entry, index) => entry.path !== verified[index].path || entry.content !== verified[index].content)) {
    throw new Error("[DATABASE] Taşıma sonrası doğrulama başarısız. Aktif veritabanı durumu değiştirilmedi; kaynağı koruyarak yeniden başlatın.");
  }
}

function migrateLegacyStorage(root) {
  const moves = [
    ["Settings/database-state.json", STATE_FILE],
    ["Settings/mongodb-pending", PENDING_DIRECTORY],
  ].map(([source, destination]) => ({ source: path.join(root, source), destination: path.join(root, destination) }));
  const legacyBackups = path.join(root, "Settings/database-backups");
  const backupDirectory = path.join(root, BACKUP_DIRECTORY);
  const hasLegacyBackups = exists(legacyBackups);
  if (hasLegacyBackups) {
    assertSafeFsPath(root, legacyBackups);
    assertSafeFsPath(root, backupDirectory);
    for (const name of fs.readdirSync(legacyBackups)) {
      moves.push({ source: path.join(legacyBackups, name), destination: path.join(backupDirectory, name) });
    }
  }
  const pending = moves.filter(({ source }) => exists(source));
  for (const { source, destination } of pending) {
    assertSafeFsPath(root, source);
    assertSafeFsPath(root, destination);
    if (exists(destination)) {
      throw new Error(`[DATABASE] Eski ve yeni kayıt konumları birlikte mevcut: ${source} ve ${destination}. Veri kaybını önlemek için otomatik taşıma durduruldu.`);
    }
  }
  for (const { source, destination } of pending) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.renameSync(source, destination);
  }
  if (hasLegacyBackups) {
    fs.mkdirSync(backupDirectory, { recursive: true });
    fs.rmdirSync(legacyBackups);
  }
}

function readState(root) {
  const file = path.join(root, STATE_FILE);
  assertSafeFsPath(root, file);
  if (!exists(file)) return null;
  let state;
  try { state = JSON.parse(fs.readFileSync(file, "utf8")); } catch {
    throw new Error(`[DATABASE] ${STATE_FILE} okunamıyor. Aktif veritabanını güvenle belirlemek için durum dosyasını yedekten kurtarın; dosyayı silmeyin.`);
  }
  if (state?.version !== 1 || !["json", "mongo"].includes(state.active) || (state.active === "mongo" && !/^[a-f0-9]{64}$/.test(state.mongoTarget || ""))) {
    throw new Error(`[DATABASE] ${STATE_FILE} geçersiz veya desteklenmeyen sürümde. Durum dosyasını geçerli yedekten kurtarın.`);
  }
  return state;
}

function saveState(root, mode, mongoTarget) {
  const state = { version: 1, active: mode, updatedAt: new Date().toISOString() };
  if (mongoTarget) state.mongoTarget = mongoTarget;
  atomicWrite(root, path.join(root, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
}

function backupLocalFiles(root, files) {
  const destination = path.join(root, BACKUP_DIRECTORY, `${Date.now()}-${crypto.randomUUID()}`);
  const manifest = [];
  for (const file of files) {
    if (!/\.json(?:$|\.(?:bak|lock)$|\.(?:tmp|corrupt)(?:-|$)|\.\d+\.tmp$)/i.test(file.path)) continue;
    const content = fs.readFileSync(file.absolute);
    atomicWrite(root, path.join(destination, "Database", ...file.path.split("/")), content);
    manifest.push({ path: file.path, sha256: crypto.createHash("sha256").update(content).digest("hex") });
  }
  atomicWrite(root, path.join(destination, "manifest.json"), `${JSON.stringify({ version: 1, createdAt: new Date().toISOString(), files: manifest }, null, 2)}\n`);
  return destination;
}

function exportToJson(root, entries, logger) {
  const snapshot = validateEntries(entries);
  const localFiles = walkDatabase(root);
  for (const entry of snapshot) assertSafeFsPath(root, path.join(root, "Database", ...entry.path.split("/")));
  const backup = backupLocalFiles(root, localFiles);
  logger.info?.(`[DATABASE] Geçiş öncesi yerel dosya yedeği: ${backup}`);
  for (const entry of snapshot) {
    atomicWrite(root, path.join(root, "Database", ...entry.path.split("/")), entry.content);
  }
  const incoming = new Set(snapshot.map((entry) => entry.path.toLowerCase()));
  for (const file of localFiles) {
    if ((/\.json$/i.test(file.path) && !isIgnored(file.path) && !incoming.has(file.path.toLowerCase())) || /\.json\.bak$/i.test(file.path)) {
      assertSafeFsPath(root, file.absolute);
      fs.unlinkSync(file.absolute);
    }
  }
  verifyEntries(snapshot, jsonSnapshot(root, logger));
}

function defaultCreateBackend(options) {
  return require("./mongoBackend").createMongoBackend(options);
}

function initializeDatabase({ root = DEFAULT_ROOT, config = readConfig(), createBackend = defaultCreateBackend, logger = console } = {}) {
  if (activeRuntime) throw new Error("[DATABASE] Veritabanı zaten başlatıldı; yeniden başlatmadan önce closeDatabase() çağırın.");
  root = path.resolve(root);
  if (!["json", "mongo"].includes(config.mode)) throw new Error("[DATABASE] Geçersiz veritabanı modu.");
  migrateLegacyStorage(root);
  const state = readState(root);
  const needsMongo = config.mode === "mongo" || state?.active === "mongo";
  let backend = null;
  let destination;
  let journal;
  try {
    if (needsMongo) {
      destination = mongoDestination(config.url, config.dbName);
      if (state?.active === "mongo" && state.mongoTarget !== destination.hash) {
        throw new Error("[DATABASE] MongoDB adresi/veritabanı önceki aktif kaynakla uyuşmuyor. Önce eski MONGODB_URI ve MONGODB_DATABASE ile JSON'a geçip botu başlatın; ardından yeni MongoDB adresini ayarlayın.");
      }
      const source = config.mode === "mongo" && state?.active === "json" ? jsonSnapshot(root, logger) : null;
      backend = createBackend({ url: config.url, dbName: destination.dbName, timeoutMs: config.timeoutMs });
      journal = openPendingWrites({ root, target: destination.hash, validatePath: validateRelativePath });
      replayPendingWrites(backend, journal);
      if (config.mode === "mongo") {
        const existing = validateEntries(backend.list());
        if (source !== null || (!state && existing.length === 0)) {
          const snapshot = source || jsonSnapshot(root, logger);
          backend.replaceAll(snapshot);
          verifyEntries(snapshot, backend.list());
          logger.info?.(`[DATABASE] ${snapshot.length} JSON dosyası MongoDB'ye aktarıldı ve doğrulandı.`);
        }
      } else {
        exportToJson(root, backend.list(), logger);
        backend.close();
        backend = null;
        logger.info?.("[DATABASE] MongoDB verileri JSON dosyalarına aktarıldı ve doğrulandı.");
      }
    }
    const context = { mode: config.mode, backend, root, close: closeDatabase };
    if (backend?.writeAsync && backend?.removeAsync) {
      context.backend = createLiveBackend({
        backend, journal, entries: validateEntries(backend.list()),
        onError(error) {
          context.failedError = error;
          process.stderr.write(`[DATABASE] ${error.message}\n`);
        },
      });
    }
    saveState(root, config.mode, config.mode === "mongo" ? destination.hash : undefined);
    activeRuntime = context;
    logger.info?.(`[DATABASE] Aktif veritabanı: ${config.mode === "mongo" ? "MongoDB" : "JSON"}.`);
    return context;
  } catch (error) {
    try { backend?.close(); } catch { }
    throw error;
  }
}

function getRuntime() { return activeRuntime; }

async function flushDatabase() {
  if (activeRuntime?.failedError) throw activeRuntime.failedError;
  await activeRuntime?.backend?.flush?.();
}

function closeDatabase() {
  const runtime = activeRuntime;
  activeRuntime = null;
  runtime?.backend?.close();
}

module.exports = { initializeDatabase, getRuntime, closeDatabase, flushDatabase };
