const fs = require("fs");
const path = require("path");

const WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));
const STARTUP_LOCK_TIMEOUT_MS = 5_000;
const STARTUP_LOCK_STALE_MS = 30_000;
const STARTUP_LOCK_RETRY_MS = 10;

function sleepSync(milliseconds) {
  Atomics.wait(WAIT_BUFFER, 0, 0, milliseconds);
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

function lockToken() {
  return JSON.stringify({
    pid: process.pid,
    createdAt: Date.now(),
    nonce: `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  });
}

function removeStaleStartupLock(lockPath) {
  try {
    const stats = fs.statSync(lockPath);
    const contents = fs.readFileSync(lockPath, "utf8");
    let ownerPid = null;

    try {
      ownerPid = Number(JSON.parse(contents).pid);
    } catch {
    }

    const isStale = Date.now() - stats.mtimeMs > STARTUP_LOCK_STALE_MS;
    if (!isStale || isProcessRunning(ownerPid)) return false;

    const latestStats = fs.statSync(lockPath);
    const latestContents = fs.readFileSync(lockPath, "utf8");
    if (
      latestContents !== contents
      || latestStats.mtimeMs !== stats.mtimeMs
      || latestStats.size !== stats.size
    ) {
      return false;
    }

    fs.unlinkSync(lockPath);
    return true;
  } catch (error) {
    return error?.code === "ENOENT";
  }
}

function acquireStartupLock(lockPath) {
  const token = lockToken();
  const startedAt = Date.now();

  while (Date.now() - startedAt <= STARTUP_LOCK_TIMEOUT_MS) {
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
      if (removeStaleStartupLock(lockPath)) continue;
      sleepSync(STARTUP_LOCK_RETRY_MS);
    }
  }

  throw new Error(`Başlangıç kilidi ${STARTUP_LOCK_TIMEOUT_MS} ms içinde alınamadı: ${lockPath}`);
}

function acquireSingleInstance(pidFilePath) {
  const resolvedPidFile = path.resolve(pidFilePath);
  const startupLockPath = `${resolvedPidFile}.starting`;
  const pidText = `${process.pid}\n`;
  fs.mkdirSync(path.dirname(resolvedPidFile), { recursive: true });
  const releaseStartupLock = acquireStartupLock(startupLockPath);

  try {
    let ownerPid = null;
    try {
      ownerPid = Number(fs.readFileSync(resolvedPidFile, "utf8").trim());
    } catch (error) {
      if (error?.code !== "ENOENT") ownerPid = null;
    }

    if (isProcessRunning(ownerPid)) {
      throw new Error(`Bot zaten çalışıyor (PID ${ownerPid}). İkinci Discord oturumu engellendi.`);
    }

    fs.writeFileSync(resolvedPidFile, pidText, { encoding: "utf8", flag: "w", mode: 0o600 });
  } finally {
    releaseStartupLock();
  }

  const cleanupPidFile = () => {
    try {
      if (fs.readFileSync(resolvedPidFile, "utf8").trim() === String(process.pid)) {
        fs.unlinkSync(resolvedPidFile);
      }
    } catch {
    }
  };

  process.once("exit", cleanupPidFile);
  process.once("SIGTERM", () => {
    process.exit(143);
  });
  process.once("SIGINT", () => {
    process.exit(130);
  });

  return resolvedPidFile;
}

module.exports = { acquireSingleInstance };
