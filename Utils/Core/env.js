const fs = require("fs");
const path = require("path");
const { randomUUID } = require("node:crypto");

const envPaths = [
  path.join(__dirname, "../../Settings/.env"),
  path.join(__dirname, "../../Setting/.env"),
];

let loaded = false;

function parseEnvValue(rawValue) {
  let value = rawValue.trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return value.replace(/\\n/g, "\n");
}

function loadEnv() {
  if (loaded) return;
  loaded = true;

  const envPath = envPaths.find((filePath) => fs.existsSync(filePath));
  if (!envPath) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = parseEnvValue(trimmed.slice(separatorIndex + 1));

    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    process.env[key] = value;
  }
}

function getEnv(key, fallback = undefined) {
  loadEnv();
  return process.env[key] || fallback;
}

function getRequiredEnv(key) {
  const value = getEnv(key);
  if (!value) {
    throw new Error(`${key} Settings/.env dosyasında tanımlı değil.`);
  }
  return value;
}

function updateEnv(patch) {
  const entries = Object.entries(patch);
  if (!entries.length) return;
  for (const [key, value] of entries) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key) || typeof value !== "string" || /[\r\n\0]/.test(value)) {
      throw new TypeError("Ortam ayarları geçerli anahtarlar ve tek satırlık metin değerleri içermelidir.");
    }
  }

  loadEnv();
  const envPath = envPaths.find((filePath) => fs.existsSync(filePath)) || envPaths[0];
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const newline = current.includes("\r\n") ? "\r\n" : "\n";
  const remaining = new Map(entries);
  const lines = current ? current.split(/\r?\n/) : [];
  if (lines.at(-1) === "") lines.pop();
  const updated = lines.map((line) => {
    const separator = line.indexOf("=");
    const key = separator < 0 ? "" : line.slice(0, separator).trim();
    if (!Object.prototype.hasOwnProperty.call(patch, key)) return line;
    remaining.delete(key);
    return `${key}=${patch[key]}`;
  });
  for (const [key, value] of remaining) updated.push(`${key}=${value}`);

  const temporary = `${envPath}.tmp-${randomUUID()}`;
  try {
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(temporary, updated.join(newline) + newline, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, envPath);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  for (const [key, value] of entries) process.env[key] = value;
}

module.exports = {
  loadEnv,
  getEnv,
  getRequiredEnv,
  updateEnv,
};
