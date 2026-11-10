const { getEmojiLookupKeys } = require("./emojiNames");

async function installMissingEmojis(client, fetched, definitions) {
  const manager = client.application.emojis;
  const existingKeys = new Set();
  const remember = emoji => {
    for (const key of getEmojiLookupKeys(emoji.name)) existingKeys.add(key);
  };
  for (const emoji of fetched.values()) remember(emoji);

  const result = { created: 0, existing: 0, failed: [] };
  for (const definition of definitions) {
    const { name, aliases = [], attachment } = definition;
    const keys = [name, ...aliases].flatMap(getEmojiLookupKeys);
    if (keys.some(key => existingKeys.has(key))) {
      result.existing++;
      continue;
    }
    if (typeof manager.create !== "function") continue;
    try {
      const emoji = await manager.create({ name, attachment: await attachment() });
      fetched.set(emoji.id, emoji);
      remember(emoji);
      result.created++;
    } catch (error) {
      result.failed.push(name);
      console.warn(`[EMOJİ] ${name} yüklenemedi: ${error.code || error.name}. Sonraki açılışta yeniden denenecek.`);
    }
  }
  return result;
}

module.exports = { installMissingEmojis };
