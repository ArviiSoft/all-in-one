const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { PENDING_DIRECTORY } = require('./storagePaths');

function openPendingWrites({ root, target, validatePath }) {
  if (!/^[a-f0-9]{64}$/.test(target)) throw new Error('Geçersiz MongoDB hedef kimliği.');
  const directory = path.join(root, PENDING_DIRECTORY, target);
  for (const part of ['Database', 'Database/MongoDB', PENDING_DIRECTORY, `${PENDING_DIRECTORY}/${target}`]) {
    const current = path.join(root, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('MongoDB bekleyen kayıt klasörü sembolik bağlantı olamaz.');
  }
  const fileFor = key => path.join(directory, `${createHash('sha256').update(key).digest('hex')}.pending`);
  function validate(record) {
    if (record?.version !== 1) throw new Error('MongoDB bekleyen kayıt sürümü geçersiz.');
    validatePath(record.path);
    if (record.content !== null) {
      if (typeof record.content !== 'string') throw new Error('MongoDB bekleyen kayıt içeriği geçersiz.');
      JSON.parse(record.content);
    }
    return record;
  }
  return {
    load() {
      if (!fs.existsSync(directory)) return [];
      return fs.readdirSync(directory, { withFileTypes: true }).filter(item => item.name.endsWith('.pending')).map(item => {
        if (!item.isFile()) throw new Error('MongoDB bekleyen kayıt dosyası geçersiz.');
        const file = path.join(directory, item.name);
        const record = validate(JSON.parse(fs.readFileSync(file, 'utf8')));
        if (fileFor(record.path) !== file) throw new Error('MongoDB bekleyen kayıt yolu doğrulanamadı.');
        return record;
      });
    },
    save(key, content) {
      const record = validate({ version: 1, path: key, content });
      fs.mkdirSync(directory, { recursive: true });
      const file = fileFor(key);
      const temporary = `${file}.tmp-${randomUUID()}`;
      let fd;
      try {
        fd = fs.openSync(temporary, 'wx', 0o600);
        fs.writeFileSync(fd, JSON.stringify(record), 'utf8');
        fs.fsyncSync(fd);
        fs.closeSync(fd); fd = undefined;
        fs.renameSync(temporary, file);
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
    },
    remove(key) { fs.rmSync(fileFor(key), { force: true }); },
  };
}

function replayPendingWrites(backend, journal) {
  for (const record of journal.load()) {
    if (record.content === null) backend.remove(record.path);
    else backend.write(record.path, record.content);
    journal.remove(record.path);
  }
}

function createLiveBackend({ backend, journal, entries, onError = () => {} }) {
  const cache = new Map(entries.map(entry => [entry.path, entry.content]));
  const pending = new Map();
  let running = null;
  let failed = null;
  let closing = false;
  let closed = false;
  let revision = 0;
  const delivered = new Map();
  const waiters = new Set();
  function settleWaiters() {
    for (const waiter of waiters) {
      if (failed || waiter.required.every(([key, version]) => (delivered.get(key) || 0) >= version)) {
        waiters.delete(waiter);
        if (failed) waiter.reject(failed); else waiter.resolve();
      }
    }
  }
  const assertHealthy = () => {
    if (failed) throw failed;
    if (closed || closing) throw new Error('MongoDB veritabanı kapatılıyor.');
  };
  function pump() {
    if (running || failed || closing || closed || !pending.size) return;
    running = Promise.resolve().then(async () => {
      while (pending.size && !closing) {
        const [key, record] = pending.entries().next().value;
        if (record.content === null) await backend.removeAsync(key);
        else await backend.writeAsync(key, record.content);
        delivered.set(key, record.revision);
        if (!closing && pending.get(key) === record) {
          journal.remove(key);
          pending.delete(key);
        } else if (!closing && pending.has(key)) {
          const latest = pending.get(key);
          pending.delete(key);
          pending.set(key, latest);
        }
        settleWaiters();
      }
    }).catch(() => {
      if (closed || closing) return;
      failed = Object.assign(new Error('MongoDB kaydı tamamlanamadı. Bekleyen kayıtlar diskte korundu; bağlantıyı kontrol edip botu yeniden başlatın.'), { code: 'DATABASE_UNAVAILABLE' });
      settleWaiters();
      try { onError(failed); } catch { }
    }).finally(() => { running = null; pump(); });
  }
  function enqueue(key, content) {
    assertHealthy();
    if ((cache.get(key) ?? null) === content) return;
    journal.save(key, content);
    pending.set(key, { content, revision: ++revision });
    if (content === null) cache.delete(key); else cache.set(key, content);
    pump();
  }
  return {
    read(key) { assertHealthy(); return cache.get(key) ?? null; },
    list() { assertHealthy(); return [...cache].map(([key, content]) => ({ path: key, content })); },
    write: (key, content) => enqueue(key, content),
    remove: key => enqueue(key, null),
    async flush() {
      assertHealthy();
      const required = [...pending].map(([key, record]) => [key, record.revision]);
      if (!required.length) return;
      await new Promise((resolve, reject) => { waiters.add({ required, resolve, reject }); settleWaiters(); });
    },
    close() {
      if (closed) return;
      closing = true;
      try {
        if (!failed) for (const [key, record] of pending) {
          if (record.content === null) backend.remove(key);
          else backend.write(key, record.content);
          journal.remove(key);
          delivered.set(key, record.revision);
        }
        settleWaiters();
      } catch (error) {
        failed = error;
        settleWaiters();
        throw error;
      } finally {
        closed = true;
        backend.close();
      }
    },
  };
}

module.exports = { openPendingWrites, replayPendingWrites, createLiveBackend };
