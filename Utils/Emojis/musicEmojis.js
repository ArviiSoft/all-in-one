const MUSIC_EMOJI_DATA = require("./musicEmojiData");
const MUSIC_EMOJIS = Object.freeze(Object.keys(MUSIC_EMOJI_DATA));

async function ensureMusicEmojis(client, fetched) {
  const manager = client.application.emojis;
  const existingNames = new Set([...fetched.values()].map(emoji => emoji.name));
  for (const name of MUSIC_EMOJIS) {
    if (existingNames.has(name)) continue;
    if (typeof manager.create !== "function") continue;
    try {
      const attachment = Buffer.from(MUSIC_EMOJI_DATA[name], "base64");
      const emoji = await manager.create({ name, attachment });
      fetched.set(emoji.id, emoji);
      existingNames.add(name);
    } catch (error) {
      console.warn(`[MÜZİK] ${name} emojisi yüklenemedi: ${error.code || error.name}. Metin çubuğu kullanılacak.`);
    }
  }
  return fetched;
}

module.exports = { MUSIC_EMOJIS, ensureMusicEmojis };
