const fs = require("node:fs/promises");
const path = require("node:path");
const manifest = require("./applicationEmojiManifest.json");
const MUSIC_EMOJI_DATA = require("./musicEmojiData");
const { BADGES } = require("../Account/accountBadges");
const { installMissingEmojis } = require("./emojiInstaller");

const asset = (...parts) => () => fs.readFile(path.join(__dirname, "../../assets", ...parts));
const APPLICATION_EMOJIS = Object.freeze([
  ...manifest.map(({ name }) => ({
    name, attachment: () => Buffer.from(require("./generalEmojiData")[name], "base64"),
  })),
  ...Object.entries(MUSIC_EMOJI_DATA).map(([name, data]) => ({
    name, attachment: () => Buffer.from(data, "base64"),
  })),
  ...BADGES.map(badge => ({
    name: `account_${badge.id}`, aliases: badge.emojiAliases,
    attachment: asset("Hesap", "Rozetler", `${badge.id}.png`),
  })),
  ...Array.from({ length: 9 }, (_, index) => ({
    name: `arvis_boost_${index + 1}`,
    attachment: asset("Boost", `boost-level-${index + 1}.png`),
  })),
]);

function ensureDefaultApplicationEmojis(client, fetched) {
  return installMissingEmojis(client, fetched, APPLICATION_EMOJIS);
}

module.exports = { APPLICATION_EMOJIS, ensureDefaultApplicationEmojis };
