const manifest = require("./applicationEmojiManifest.json");

const EMOJI_NAME_ALIASES = Object.freeze({
  ...Object.fromEntries(manifest.map(({ alias, name }) => [alias.toLowerCase(), name])),
  bilgi: "info",
  girissagok: "girisok",
  cikissagok: "cikisok",
  system2: "sistemler",
});

function getLookupKeys(value) {
  const originalName = String(value ?? "").trim().toLowerCase();
  if (!originalName) return [];

  const withoutLegacyId = originalName.replace(/_(?:\d{17,20})?$/, "");
  const withoutBrandSuffix = withoutLegacyId.replace(/_(?:arviis|avriis)$/, "");
  const keys = new Set([originalName, withoutLegacyId, withoutBrandSuffix]);
  for (const key of [...keys]) keys.add(key.replaceAll("_", ""));
  keys.delete("");
  return [...keys];
}

function getEmojiLookupKeys(value) {
  const keys = new Set(getLookupKeys(value));
  for (const key of [...keys]) {
    const alias = EMOJI_NAME_ALIASES[key];
    if (alias) for (const aliasKey of getLookupKeys(alias)) keys.add(aliasKey);
  }
  return [...keys];
}

module.exports = { getEmojiLookupKeys };
