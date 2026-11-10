const MUSIC_EMOJI_DATA = require("./musicEmojiData");
const { installMissingEmojis } = require("./emojiInstaller");
const MUSIC_EMOJIS = Object.freeze(Object.keys(MUSIC_EMOJI_DATA));

async function ensureMusicEmojis(client, fetched) {
  await installMissingEmojis(client, fetched, MUSIC_EMOJIS.map(name => ({
    name, attachment: () => Buffer.from(MUSIC_EMOJI_DATA[name], "base64"),
  })));
  return fetched;
}

module.exports = { MUSIC_EMOJIS, ensureMusicEmojis };
