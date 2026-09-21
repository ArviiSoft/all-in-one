const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { createHash } = require('node:crypto');
const { getRuntime } = require('../Database/runtime');
const { isInternalDatabasePath } = require('../Database/storagePaths');

const transientFiles = new WeakMap();
const revisions = new WeakMap();
const descriptors = new Map();
let nextDescriptor = -1;
const adapter = { ...fs };

function location(file) {
  if (descriptors.has(file)) return descriptors.get(file);
  if (typeof file === 'number') return null;
  const runtime = getRuntime();
  if (!runtime || runtime.mode !== 'mongo') return null;
  const input = file instanceof URL ? fileURLToPath(file) : Buffer.isBuffer(file) ? file.toString() : file;
  if (typeof input !== 'string') return null;
  const relative = path.relative(path.join(runtime.root, 'Database'), path.resolve(input));
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  const key = relative.split(path.sep).join('/');
  if (isInternalDatabasePath(key)) return null;
  const managed = /\.json(?:$|\.(?:bak|lock|tmp|corrupt)(?:$|[.-])|\.\d+\.tmp$)/i.test(key);
  return { runtime, key, managed, primary: /\.json$/i.test(key) };
}

function memory(runtime) {
  if (!transientFiles.has(runtime)) transientFiles.set(runtime, new Map());
  return transientFiles.get(runtime);
}

function databaseCall(runtime, method, ...args) {
  if (runtime.failedError) throw runtime.failedError;
  try { return runtime.backend[method](...args); }
  catch (cause) {
    const error = new Error('MongoDB işlemi başarısız. Veri kaybını önlemek için veritabanı erişimi durduruldu; bağlantıyı kontrol edip botu yeniden başlatın.');
    error.code = 'DATABASE_UNAVAILABLE';
    runtime.failedError = error;
    throw error;
  }
}

function fsError(code, operation, key) {
  return Object.assign(new Error(`${code}: ${operation}, '${key}'`), { code, path: key });
}

function contents(entry) {
  if (entry.runtime.failedError) throw entry.runtime.failedError;
  return entry.primary
    ? databaseCall(entry.runtime, 'read', entry.key)
    : memory(entry.runtime).get(entry.key) ?? null;
}

function requireContents(entry, operation = 'open') {
  const value = contents(entry);
  if (value === null) throw fsError('ENOENT', operation, entry.key);
  return value;
}

function setContents(entry, content) {
  if (entry.runtime.failedError) throw entry.runtime.failedError;
  if (entry.primary) {
    JSON.parse(content);
    databaseCall(entry.runtime, 'write', entry.key, content);
  } else memory(entry.runtime).set(entry.key, content);
}

function encoding(options) { return typeof options === 'string' ? options : options?.encoding; }

adapter.readFileSync = function (file, options) {
  const entry = location(file);
  if (!entry?.managed) return fs.readFileSync(file, options);
  const buffer = Buffer.from(requireContents(entry), 'utf8');
  const format = encoding(options);
  return format ? buffer.toString(format) : buffer;
};

adapter.writeFileSync = function (file, data, options) {
  const entry = location(file);
  if (!entry?.managed) return fs.writeFileSync(file, data, options);
  const flag = typeof options === 'object' ? options.flag || 'w' : 'w';
  if (flag.includes('x') && contents(entry) !== null) throw fsError('EEXIST', 'open', entry.key);
  const text = Buffer.isBuffer(data) || ArrayBuffer.isView(data)
    ? Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8')
    : Buffer.from(String(data), encoding(options) || 'utf8').toString('utf8');
  setContents(entry, flag.startsWith('a') ? (contents(entry) || '') + text : text);
};

adapter.existsSync = function (file) {
  const entry = location(file);
  if (!entry?.managed) return fs.existsSync(file);
  return contents(entry) !== null;
};

adapter.unlinkSync = function (file) {
  const entry = location(file);
  if (!entry?.managed) return fs.unlinkSync(file);
  requireContents(entry, 'unlink');
  if (entry.primary) databaseCall(entry.runtime, 'remove', entry.key);
  else memory(entry.runtime).delete(entry.key);
};

adapter.renameSync = function (source, target) {
  const from = location(source);
  const to = location(target);
  if (!from?.managed && !to?.managed) return fs.renameSync(source, target);
  if (!from?.managed || !to?.managed) throw fsError('EXDEV', 'rename', from?.key || to?.key);
  const value = requireContents(from, 'rename');
  if (from.key === to.key) return;
  setContents(to, value);
  adapter.unlinkSync(source);
};

adapter.statSync = function (file, options) {
  const entry = location(file);
  if (!entry?.managed) return fs.statSync(file, options);
  const content = contents(entry);
  if (content === null) {
    if (options?.throwIfNoEntry === false) return undefined;
    throw fsError('ENOENT', 'stat', entry.key);
  }
  if (!revisions.has(entry.runtime)) revisions.set(entry.runtime, new Map());
  const records = revisions.get(entry.runtime);
  const digest = createHash('sha256').update(content).digest('hex');
  let record = records.get(entry.key);
  if (!record || record.digest !== digest) {
    record = { digest, time: Math.max(Date.now(), (record?.time || 0) + 1) };
    records.set(entry.key, record);
  }
  const bigint = options?.bigint;
  const value = number => bigint ? BigInt(number) : number;
  const stats = {
    size: value(Buffer.byteLength(content)), ino: value(parseInt(digest.slice(0, 12), 16)),
    mtimeMs: value(record.time), ctimeMs: value(record.time), atimeMs: value(record.time), birthtimeMs: value(record.time),
    mtime: new Date(record.time), ctime: new Date(record.time), atime: new Date(record.time), birthtime: new Date(record.time),
    mode: value(0o100600), nlink: value(1), uid: value(0), gid: value(0), dev: value(0),
    isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false,
    isBlockDevice: () => false, isCharacterDevice: () => false, isFIFO: () => false, isSocket: () => false,
  };
  if (bigint) for (const name of ['mtime', 'ctime', 'atime', 'birthtime']) stats[`${name}Ns`] = BigInt(record.time) * 1000000n;
  return stats;
};
adapter.lstatSync = (file, options) => location(file)?.managed ? adapter.statSync(file, options) : fs.lstatSync(file, options);

adapter.readdirSync = function (directory, options) {
  const entry = location(directory);
  if (!entry || entry.managed) return fs.readdirSync(directory, options);
  const prefix = entry.key ? `${entry.key}/` : '';
  const items = new Map();
  if (fs.existsSync(directory)) for (const child of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!location(path.join(String(directory), child.name))?.managed) items.set(child.name, child);
  }
  const keys = [...databaseCall(entry.runtime, 'list').map(item => item.path), ...memory(entry.runtime).keys()];
  for (const key of keys) {
    if (!key.startsWith(prefix)) continue;
    const remaining = key.slice(prefix.length);
    const name = remaining.split('/')[0];
    if (!name || items.has(name)) continue;
    const isDirectory = remaining.includes('/');
    items.set(name, { name, parentPath: String(directory), path: String(directory), isDirectory: () => isDirectory,
      isFile: () => !isDirectory, isSymbolicLink: () => false, isBlockDevice: () => false,
      isCharacterDevice: () => false, isFIFO: () => false, isSocket: () => false });
  }
  return [...items.values()].sort((a, b) => a.name.localeCompare(b.name)).map(item => options?.withFileTypes ? item : encoding(options) === 'buffer' ? Buffer.from(item.name) : item.name);
};

adapter.openSync = function (file, flags, mode) {
  const entry = location(file);
  if (!entry?.managed) return fs.openSync(file, flags, mode);
  if (typeof flags !== 'string') throw fsError('EINVAL', 'open flags', entry.key);
  const current = contents(entry);
  if (flags.includes('x') && current !== null) throw fsError('EEXIST', 'open', entry.key);
  if (flags.startsWith('r') && current === null) throw fsError('ENOENT', 'open', entry.key);
  if (entry.primary && !flags.startsWith('r')) throw fsError('ENOTSUP', 'open JSON for writing', entry.key);
  if (flags.startsWith('w') || current === null) setContents(entry, '');
  const fd = nextDescriptor--;
  descriptors.set(fd, entry);
  return fd;
};
adapter.closeSync = fd => descriptors.has(fd) ? void descriptors.delete(fd) : fs.closeSync(fd);
adapter.accessSync = function (file, mode) {
  const entry = location(file);
  if (!entry?.managed) return fs.accessSync(file, mode);
  requireContents(entry, 'access');
};
adapter.copyFileSync = function (source, target, mode = 0) {
  if (!location(source)?.managed && !location(target)?.managed) return fs.copyFileSync(source, target, mode);
  if ((mode & fs.constants.COPYFILE_EXCL) && adapter.existsSync(target)) throw fsError('EEXIST', 'copyfile', String(target));
  adapter.writeFileSync(target, adapter.readFileSync(source));
};
adapter.appendFileSync = (file, data, options) => adapter.writeFileSync(file, data, { ...(typeof options === 'string' ? { encoding: options } : options), flag: options?.flag || 'a' });

const promises = { ...fs.promises };
for (const method of ['readFile', 'writeFile', 'appendFile', 'unlink', 'rename', 'stat', 'lstat', 'readdir', 'access', 'copyFile']) {
  promises[method] = async (...args) => {
    const relevant = location(args[0])?.managed || ((method === 'rename' || method === 'copyFile') && location(args[1])?.managed)
      || (method === 'readdir' && location(args[0]));
    return relevant ? adapter[`${method}Sync`](...args) : fs.promises[method](...args);
  };
  adapter[method] = (...args) => {
    const callback = args.pop();
    if (typeof callback !== 'function') throw new TypeError('Dosya işlemi için callback gerekli.');
    promises[method](...args).then(result => callback(null, result), callback);
  };
}
adapter.promises = promises;

module.exports = adapter;
