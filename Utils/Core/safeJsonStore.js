const fs = require("./databaseFs");
const path = require("path");

const WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));

function sleepSync(milliseconds) {
  Atomics.wait(WAIT_BUFFER, 0, 0, milliseconds);
}

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function uniqueSuffix() {
  return `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function writeTextAtomically(filePath, contents) {
  ensureDirectory(filePath);
  const temporaryPath = `${filePath}.tmp-${uniqueSuffix()}`;

  try {
    fs.writeFileSync(temporaryPath, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
    }
    throw error;
  }
}

function writeJsonAtomically(filePath, data) {
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  JSON.parse(serialized);
  writeTextAtomically(filePath, serialized);
}

function readJsonFile(filePath, validate = () => true) {
  try {
    if (!fs.existsSync(filePath)) return { status: "missing" };
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) throw new SyntaxError("JSON dosyası boş.");
    const data = JSON.parse(raw);
    if (!validate(data)) throw new TypeError("JSON verisi beklenen yapıda değil.");
    return { status: "valid", data };
  } catch (error) {
    return { status: "invalid", error };
  }
}

function quarantineFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const quarantinePath = `${filePath}.corrupt-${uniqueSuffix()}`;
  fs.renameSync(filePath, quarantinePath);
  return quarantinePath;
}

function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function removeAbandonedLock(lockPath, staleLockMs) {
  try {
    const stats = fs.statSync(lockPath);
    const lockContents = fs.readFileSync(lockPath, "utf8");
    let ownerPid = null;

    try {
      ownerPid = JSON.parse(lockContents).pid;
    } catch {
    }

    const lockIsStale = Date.now() - stats.mtimeMs > staleLockMs;
    if (!lockIsStale || isProcessRunning(Number(ownerPid))) return false;

    const latestStats = fs.statSync(lockPath);
    const latestContents = fs.readFileSync(lockPath, "utf8");
    const lockDidNotChange = latestContents === lockContents
      && latestStats.mtimeMs === stats.mtimeMs
      && latestStats.size === stats.size;

    if (!lockDidNotChange) return false;

    fs.unlinkSync(lockPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
  }

  return false;
}

function acquireFileLock(lockPath, { timeoutMs, staleLockMs, retryMs }) {
  ensureDirectory(lockPath);
  const startedAt = Date.now();
  const token = JSON.stringify({ pid: process.pid, createdAt: Date.now(), nonce: uniqueSuffix() });

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      fs.writeFileSync(lockPath, token, { encoding: "utf8", flag: "wx", mode: 0o600 });

      return () => {
        try {
          if (fs.readFileSync(lockPath, "utf8") === token) fs.unlinkSync(lockPath);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (removeAbandonedLock(lockPath, staleLockMs)) continue;
      sleepSync(retryMs);
    }
  }

  throw new Error(`JSON veritabanı kilidi ${timeoutMs} ms içinde alınamadı: ${lockPath}`);
}

function createJsonStore(filePath, options = {}) {
  const backupPath = options.backupPath || `${filePath}.bak`;
  const lockPath = options.lockPath || `${filePath}.lock`;
  const timeoutMs = options.timeoutMs ?? 1_000;
  const staleLockMs = options.staleLockMs ?? 30_000;
  const retryMs = options.retryMs ?? 10;
  const logger = options.logger || console;

  const validateObject = (data) => Boolean(data) && typeof data === "object" && !Array.isArray(data);

  function withLock(operation) {
    const release = acquireFileLock(lockPath, { timeoutMs, staleLockMs, retryMs });
    try {
      return operation();
    } finally {
      release();
    }
  }

  function recoverLocked() {
    const current = readJsonFile(filePath, validateObject);
    if (current.status === "valid") return current.data;

    let quarantinedPath = null;
    if (current.status === "invalid") quarantinedPath = quarantineFile(filePath);

    const backup = readJsonFile(backupPath, validateObject);
    if (backup.status === "valid") {
      writeJsonAtomically(filePath, backup.data);
      logger.warn(
        `⚠️ [JSON DB] Bozuk veri geçerli yedekten kurtarıldı: ${filePath}`
        + (quarantinedPath ? ` (bozuk kopya: ${quarantinedPath})` : "")
      );
      return backup.data;
    }

    if (backup.status === "invalid") quarantineFile(backupPath);

    if (current.status === "invalid") {
      writeJsonAtomically(filePath, {});
      writeJsonAtomically(backupPath, {});
      logger.error(
        `🔴 [JSON DB] Geçerli yedek bulunamadı, bozuk dosya karantinaya alınıp boş veritabanı oluşturuldu: ${filePath}`
        + (quarantinedPath ? ` (bozuk kopya: ${quarantinedPath})` : "")
      );
    }

    return {};
  }

  function readData() {
    const current = readJsonFile(filePath, validateObject);
    if (current.status === "valid") return current.data;
    return withLock(recoverLocked);
  }

  function persistLocked(data) {
    if (!validateObject(data)) throw new TypeError("JSON veritabanı yalnızca nesne biçiminde veri kabul eder.");
    writeJsonAtomically(filePath, data);

    try {
      writeJsonAtomically(backupPath, data);
    } catch (error) {
      logger.error(`🔴 [JSON DB] Yedek yazılamadı: ${backupPath}`, error);
    }
  }

  function update(updater) {
    if (typeof updater !== "function") throw new TypeError("JSON güncellemesi için bir fonksiyon gerekli.");

    return withLock(() => {
      const data = recoverLocked();
      const result = updater(data);

      if (result && typeof result.then === "function") {
        throw new TypeError("JSON güncelleme fonksiyonu eşzamanlı olmalıdır.");
      }

      persistLocked(data);
      return result;
    });
  }

  function get(key) {
    return readData()[key];
  }

  function set(key, value) {
    update((data) => {
      data[key] = value;
    });
  }

  function add(key, value) {
    if (!Number.isFinite(value)) throw new TypeError("Eklenecek değer sonlu bir sayı olmalıdır.");

    update((data) => {
      const current = Number.isFinite(data[key]) ? data[key] : 0;
      data[key] = current + value;
    });
  }

  function addMany(entries) {
    if (!Array.isArray(entries)) throw new TypeError("Toplu artış verisi bir dizi olmalıdır.");

    update((data) => {
      for (const [key, value] of entries) {
        if (!Number.isFinite(value)) throw new TypeError("Eklenecek değer sonlu bir sayı olmalıdır.");
        const current = Number.isFinite(data[key]) ? data[key] : 0;
        data[key] = current + value;
      }
    });
  }

  function deleteKey(key) {
    update((data) => {
      delete data[key];
    });
  }

  function all() {
    return Object.entries(readData()).map(([ID, data]) => ({ ID, data }));
  }

  return { get, set, add, addMany, delete: deleteKey, all, update, loadData: readData };
}

module.exports = {
  createJsonStore,
  quarantineFile,
  readJsonFile,
  writeJsonAtomically,
};
