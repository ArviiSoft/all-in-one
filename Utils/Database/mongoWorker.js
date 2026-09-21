const { randomUUID } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const { isMainThread, parentPort, workerData } = require("node:worker_threads");
const {
  ENTRIES_COLLECTION,
  METADATA_COLLECTION,
  entryValidator,
  metadataValidator,
} = require("./schemas");

function failure(code, message) {
  return Object.assign(new Error(message), { code, safeDatabaseError: true });
}

function sanitizeError(error) {
  if (error?.safeDatabaseError) return { code: error.code, message: error.message };
  if (error?.code === 18) {
    return { code: "MONGODB_AUTH", message: "MongoDB kimlik doğrulaması başarısız. Kullanıcı adı, şifre ve authSource ayarını kontrol edin." };
  }
  if (error?.code === 13) {
    return { code: "MONGODB_PERMISSION", message: "MongoDB kullanıcısının veritabanı, koleksiyon veya şema işlemleri için yetkisi yok." };
  }
  if (error?.code === 121) {
    return { code: "MONGODB_SCHEMA", message: "MongoDB kaydı veritabanı şemasına uymuyor." };
  }
  if (error?.code === "MODULE_NOT_FOUND") {
    return { code: "MONGODB_DEPENDENCY", message: "MongoDB sürücüsü yüklenemedi. Proje bağımlılıklarını npm install ile kurun." };
  }
  if (["MongoParseError", "MongoInvalidArgumentError"].includes(error?.name)) {
    return { code: "MONGODB_CONFIG", message: "MongoDB bağlantı ayarları geçersiz. Bağlantı adresini ve veritabanı adını kontrol edin." };
  }

  return {
    code: "MONGODB_OPERATION",
    message: "MongoDB işlemi tamamlanamadı. Sunucu bağlantısını ve yetkileri kontrol edin. İşlem sonucu doğrulanamadı; otomatik tekrar uygulanmadı.",
  };
}

function validatePath(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0 || filePath.includes("\0")) {
    throw failure("MONGODB_PATH", "MongoDB kayıt yolu boş olmayan bir metin olmalıdır.");
  }
}

function validateEntry(entry) {
  validatePath(entry?.path);
  if (typeof entry.content !== "string") {
    throw failure("MONGODB_CONTENT", "MongoDB kayıt içeriği JSON metni olmalıdır.");
  }
  try {
    JSON.parse(entry.content);
  } catch {
    throw failure("MONGODB_CONTENT", "Geçersiz JSON içeriği MongoDB veritabanına yazılamaz.");
  }
}

function createMongoRuntime({ url, dbName, timeoutMs = 30000 }, Driver) {
  let client;
  let db;
  let records;
  let metadata;

  function options(deadline) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw failure("MONGODB_TIMEOUT", "MongoDB işlemi için ayrılan süre doldu; otomatik tekrar uygulanmadı.");
    return { timeoutMS: remaining };
  }

  async function ensureCollection(name, validator, deadline) {
    const definitions = await db.listCollections({ name }, options(deadline)).toArray();
    if (definitions.length === 0) {
      try {
        await db.createCollection(name, {
          ...options(deadline), validator, validationLevel: "strict", validationAction: "error",
        });
        return;
      } catch (error) {
        if (error.code !== 48) throw error;
      }
    }
    const definition = definitions[0] || (await db.listCollections({ name }, options(deadline)).toArray())[0];
    if (!isDeepStrictEqual(definition?.options?.validator, validator)
      || (definition.options.validationLevel || "strict") !== "strict"
      || (definition.options.validationAction || "error") !== "error") {
      await db.command({
        collMod: name, validator, validationLevel: "strict", validationAction: "error",
      }, options(deadline));
    }
  }

  async function connect(deadline) {
    if (client) return;
    const { MongoClient } = Driver || require("mongodb");
    client = new MongoClient(url, {
      timeoutMS: timeoutMs,
      serverSelectionTimeoutMS: timeoutMs,
      connectTimeoutMS: timeoutMs,
      socketTimeoutMS: timeoutMs,
      retryWrites: false,
      retryReads: false,
      readPreference: "primary",
      writeConcern: { w: "majority", j: true },
      maxPoolSize: 2,
      appName: "ArvisDatabase",
    });
    await client.connect();
    const uriDatabase = client.db();
    db = dbName ? client.db(dbName) : (uriDatabase.databaseName === "test" && !hasDatabaseInUri(url) ? client.db("arvis") : uriDatabase);
    await db.command({ ping: 1 }, options(deadline));
    await ensureCollection(ENTRIES_COLLECTION, entryValidator, deadline);
    await ensureCollection(METADATA_COLLECTION, metadataValidator, deadline);
    records = db.collection(ENTRIES_COLLECTION);
    metadata = db.collection(METADATA_COLLECTION);
    await records.createIndex({ generation: 1, path: 1 }, { ...options(deadline), unique: true, name: "generation_path" });
    const now = new Date();
    await metadata.updateOne({ _id: "active" }, {
      $setOnInsert: { generation: randomUUID(), previousGeneration: null, createdAt: now, updatedAt: now },
    }, { ...options(deadline), upsert: true });
    await activeGeneration(deadline);
  }

  async function activeGeneration(deadline) {
    const current = await metadata.findOne({ _id: "active" }, options(deadline));
    if (!current || typeof current.generation !== "string" || current.generation.length === 0) {
      throw failure("MONGODB_METADATA", "MongoDB etkin veritabanı kaydı bulunamadı veya geçersiz.");
    }
    return current.generation;
  }

  async function listGeneration(generation, deadline) {
    return records.find({ generation }, {
      ...options(deadline), projection: { _id: 0, path: 1, content: 1 },
    }).sort({ path: 1 }).toArray();
  }

  async function execute(operation, args, deadline) {
    if (operation === "connect") return connect(deadline);
    if (operation === "close") {
      if (client) await client.close();
      client = null;
      return;
    }
    if (!records || !metadata) throw failure("MONGODB_CLOSED", "MongoDB bağlantısı henüz açılmadı.");

    if (operation === "read") {
      validatePath(args.path);
      const generation = await activeGeneration(deadline);
      const result = await records.findOne({ generation, path: args.path }, options(deadline));
      return result ? result.content : null;
    }
    if (operation === "list") {
      return listGeneration(await activeGeneration(deadline), deadline);
    }
    if (operation === "write") {
      validateEntry(args);
      const generation = await activeGeneration(deadline);
      const now = new Date();
      await records.updateOne({ _id: `${generation}:${args.path}` }, {
        $set: { content: args.content, updatedAt: now },
        $setOnInsert: { path: args.path, generation, createdAt: now },
      }, { ...options(deadline), upsert: true });
      return;
    }
    if (operation === "remove") {
      validatePath(args.path);
      const generation = await activeGeneration(deadline);
      await records.deleteOne({ generation, path: args.path }, options(deadline));
      return;
    }
    if (operation === "replaceAll") {
      if (!Array.isArray(args.entries)) throw failure("MONGODB_SNAPSHOT", "MongoDB aktarımı bir kayıt listesi içermelidir.");
      const seen = new Set();
      for (const entry of args.entries) {
        validateEntry(entry);
        if (seen.has(entry.path)) throw failure("MONGODB_SNAPSHOT", "MongoDB aktarımında aynı kayıt yolu birden fazla kez bulunamaz.");
        seen.add(entry.path);
      }
      const previous = await activeGeneration(deadline);
      const generation = randomUUID();
      const now = new Date();

      for (let index = 0; index < args.entries.length; index += 100) {
        const batch = args.entries.slice(index, index + 100).map((entry) => ({
          _id: `${generation}:${entry.path}`,
          path: entry.path,
          content: entry.content,
          generation,
          createdAt: now,
          updatedAt: now,
        }));
        await records.insertMany(batch, { ...options(deadline), ordered: true });
      }
      const staged = await listGeneration(generation, deadline);
      const expected = new Map(args.entries.map((entry) => [entry.path, entry.content]));
      if (staged.length !== expected.size || staged.some((entry) => expected.get(entry.path) !== entry.content)) {
        throw failure("MONGODB_SNAPSHOT", "MongoDB aktarımı doğrulanamadı. Önceki veritabanı etkin bırakıldı.");
      }
      const promoted = await metadata.updateOne({ _id: "active", generation: previous }, {
        $set: { generation, previousGeneration: previous, updatedAt: new Date() },
      }, options(deadline));
      if (promoted.matchedCount !== 1) {
        throw failure("MONGODB_CONFLICT", "Aktarım sırasında etkin MongoDB veritabanı değişti. Yeni aktarım etkinleştirilmedi.");
      }

      try {
        const cleanupDeadline = Math.min(deadline - 100, Date.now() + 250);
        await records.deleteMany({ generation: { $nin: [generation, previous] } }, options(cleanupDeadline));
      } catch {
      }
      return;
    }
    throw failure("MONGODB_OPERATION", "Desteklenmeyen MongoDB işlemi.");
  }

  return { execute };
}

function hasDatabaseInUri(url) {
  const afterScheme = url.slice(url.indexOf("://") + 3);
  const pathIndex = afterScheme.indexOf("/");
  return pathIndex >= 0 && afterScheme.slice(pathIndex + 1).split("?")[0].length > 0;
}

if (!isMainThread) {
  const runtime = createMongoRuntime(workerData);
  let queue = Promise.resolve();
  parentPort.on("message", (request) => {
    queue = queue.then(async () => {
      let response;
      try {
        response = { id: request.id, ok: true, value: await runtime.execute(request.operation, request.args, request.deadline) };
      } catch (error) {
        response = { id: request.id, ok: false, error: sanitizeError(error) };
      }
      const responsePort = request.responsePort || workerData.port;
      responsePort.postMessage(response);
      if (request.responsePort) responsePort.close();
      if (request.signal) {
        Atomics.store(request.signal, 0, 1);
        Atomics.notify(request.signal, 0);
      }
    });
  });
}

module.exports = { createMongoRuntime, sanitizeError };
