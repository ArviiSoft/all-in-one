const path = require("node:path");
const { MessageChannel, Worker, receiveMessageOnPort } = require("node:worker_threads");

function databaseError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createMongoBackend({ url, dbName, timeoutMs = 30000 } = {}) {
  if (typeof url !== "string" || !/^mongodb(?:\+srv)?:\/\//i.test(url.trim())) {
    throw databaseError("MONGODB_CONFIG", "MongoDB bağlantı adresi geçerli bir mongodb:// veya mongodb+srv:// adresi olmalıdır.");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) {
    throw databaseError("MONGODB_CONFIG", "MongoDB zaman aşımı 1 ile 300000 milisaniye arasında bir tam sayı olmalıdır.");
  }

  const { port1, port2 } = new MessageChannel();
  let worker;
  let disposed = false;
  let connected = false;
  let nextId = 0;
  let workerFailed = false;
  const pendingAsync = new Set();

  function dispose() {
    if (disposed) return;
    disposed = true;
    connected = false;
    for (const reject of pendingAsync) reject(databaseError('MONGODB_CLOSED', 'MongoDB bağlantısı kapalı. Bot yeniden başlatılmalıdır.'));
    pendingAsync.clear();
    port1.close();
    if (worker) worker.terminate().catch(() => {});
  }

  function requestAsync(operation, args = {}) {
    if (disposed || workerFailed) return Promise.reject(databaseError('MONGODB_CLOSED', 'MongoDB bağlantısı kapalı.'));
    return new Promise((resolve, reject) => {
      const { port1: response, port2: reply } = new MessageChannel();
      const id = ++nextId;
      const finish = (error, value) => {
        clearTimeout(timer);
        pendingAsync.delete(fail);
        response.close();
        if (error) reject(error); else resolve(value);
      };
      const fail = error => finish(error);
      const timer = setTimeout(() => {
        finish(databaseError('MONGODB_TIMEOUT', 'MongoDB işlemi zaman aşımına uğradı. Bekleyen kayıtlar yeniden başlatmada kurtarılacak.'));
        dispose();
      }, timeoutMs);
      pendingAsync.add(fail);
      response.once('message', message => {
        if (message.ok) finish(null, message.value);
        else { finish(databaseError(message.error.code, message.error.message)); dispose(); }
      });
      try {
        worker.postMessage({ id, operation, args, deadline: Date.now() + timeoutMs, responsePort: reply }, [reply]);
      } catch {
        reply.close();
        finish(databaseError('MONGODB_WORKER', 'MongoDB işlemi bağlantı işçisine iletilemedi.'));
        dispose();
      }
    });
  }

  try {
    worker = new Worker(path.join(__dirname, "mongoWorker.js"), {
      workerData: { port: port2, url: url.trim(), dbName, timeoutMs },
      transferList: [port2],
      stdout: true,
      stderr: true,
    });
    worker.stdout.resume();
    worker.stderr.resume();
    worker.on("error", () => { workerFailed = true; });
    worker.on("exit", () => { workerFailed = true; });
    worker.unref();
    port1.unref();
  } catch {
    port1.close();
    port2.close();
    throw databaseError("MONGODB_WORKER", "MongoDB bağlantı işçisi başlatılamadı.");
  }

  function request(operation, args = {}) {
    if (disposed || workerFailed) {
      throw databaseError("MONGODB_CLOSED", "MongoDB bağlantısı kapalı. Bot yeniden başlatılmalıdır.");
    }
    const id = ++nextId;
    const signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
    const deadline = Date.now() + timeoutMs;
    try {
      worker.postMessage({ id, operation, args, signal, deadline });
    } catch {
      dispose();
      throw databaseError("MONGODB_WORKER", "MongoDB işlemi bağlantı işçisine iletilemedi.");
    }

    while (true) {
      const received = receiveMessageOnPort(port1);
      if (received && received.message.id === id) {
        const response = received.message;
        if (!response.ok) {
          dispose();
          throw databaseError(response.error.code, response.error.message);
        }
        return response.value;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        dispose();
        throw databaseError(
          "MONGODB_TIMEOUT",
          "MongoDB işlemi zaman aşımına uğradı. İşlem sonucu doğrulanamadı; otomatik tekrar uygulanmadı. Bağlantıyı kontrol edip botu yeniden başlatın.",
        );
      }

      const state = Atomics.load(signal, 0);
      Atomics.wait(signal, 0, state, state === 0 ? remaining : Math.min(remaining, 5));
    }
  }

  const backend = {
    connect() {
      if (!connected) {
        request("connect");
        connected = true;
      }
      return backend;
    },
    list: () => request("list"),
    read: (filePath) => request("read", { path: filePath }),
    write: (filePath, content) => request("write", { path: filePath, content }),
    remove: (filePath) => request("remove", { path: filePath }),
    replaceAll: (entries) => request("replaceAll", { entries }),
    writeAsync: (filePath, content) => requestAsync('write', { path: filePath, content }),
    removeAsync: (filePath) => requestAsync('remove', { path: filePath }),
    close() {
      if (disposed) return;
      try {
        request("close");
      } finally {
        dispose();
      }
    },
  };

  try {
    return backend.connect();
  } catch (error) {
    dispose();
    throw error;
  }
}

module.exports = { createMongoBackend };
