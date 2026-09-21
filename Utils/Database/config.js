const crypto = require("node:crypto");

function readBoolean(env, key, fallback) {
  if (env[key] === undefined) return fallback;
  if (env[key] === "true" || env[key] === true) return true;
  if (env[key] === "false" || env[key] === false) return false;
  throw new Error(`[DATABASE] ${key} yalnızca true veya false olabilir.`);
}

function mongoDestination(url, database) {
  if (typeof url !== "string" || !url.trim()) {
    throw new Error("[DATABASE] MongoDB bağlantısı için MONGODB_URI gereklidir. JSON'a dönüşte de önceki MongoDB adresini koruyun.");
  }

  const match = /^(mongodb(?:\+srv)?):\/\/([^/?#]+)(?:\/([^?#]*))?(?:\?[^#]*)?$/.exec(url.trim());
  if (!match) throw new Error("[DATABASE] MONGODB_URI geçerli bir mongodb:// veya mongodb+srv:// bağlantısı olmalıdır.");
  const authority = match[2].slice(match[2].lastIndexOf("@") + 1);
  if (!authority || authority.split(",").some((host) => !host.trim())) {
    throw new Error("[DATABASE] MONGODB_URI içinde geçerli bir sunucu adresi gereklidir.");
  }
  let uriDatabase;
  try {
    uriDatabase = decodeURIComponent(match[3] || "");
  } catch {
    throw new Error("[DATABASE] MongoDB veritabanı adı geçersiz URL kodlaması içeriyor.");
  }
  const dbName = database || uriDatabase || "arvis";
  if (typeof dbName !== "string" || /[/\\.\s"$\0]/.test(dbName) || !dbName.length) {
    throw new Error("[DATABASE] MONGODB_DATABASE veya URI içindeki veritabanı adı geçersiz.");
  }
  const hosts = authority.toLowerCase().split(",").map((host) => host.trim()).sort();
  const identity = JSON.stringify({ protocol: match[1], hosts, dbName });
  return { dbName, hash: crypto.createHash("sha256").update(identity).digest("hex") };
}

function readConfig(env = process.env) {
  const jsonEnabled = readBoolean(env, "JSON_DB_ENABLED", true);
  const mongoEnabled = readBoolean(env, "MONGODB_ENABLED", false);
  if (jsonEnabled === mongoEnabled) {
    throw new Error("[DATABASE] Tam olarak bir veritabanı açık olmalıdır: JSON_DB_ENABLED=true ve MONGODB_ENABLED=false veya JSON_DB_ENABLED=false ve MONGODB_ENABLED=true kullanın. İkisi aynı anda açık ya da kapalı olamaz.");
  }
  const url = typeof env.MONGODB_URI === "string" ? env.MONGODB_URI.trim() : "";
  const database = typeof env.MONGODB_DATABASE === "string" ? env.MONGODB_DATABASE.trim() : "";
  const timeoutValue = env.MONGODB_TIMEOUT_MS === undefined ? "30000" : String(env.MONGODB_TIMEOUT_MS);
  if (!/^\d+$/.test(timeoutValue) || !Number.isSafeInteger(Number(timeoutValue)) || Number(timeoutValue) < 1 || Number(timeoutValue) > 300000) {
    throw new Error("[DATABASE] MONGODB_TIMEOUT_MS pozitif bir tam sayı olmalıdır (en fazla 300000).");
  }

  const dbName = mongoEnabled ? mongoDestination(url, database).dbName : (database || undefined);
  return { mode: mongoEnabled ? "mongo" : "json", url, dbName, timeoutMs: Number(timeoutValue) };
}

module.exports = { readConfig, mongoDestination };
