const fs = require("../Core/databaseFs");
const path = require("path");
const emojiler = require("../Emojis/emojiler.js");
const { startYoutubeCommentTracker } = require("./youtubeCommentTracker");

const pendingPath = path.join(__dirname, "../../Database/Abonelik/abonePending.json");

function readPending() {
if (!fs.existsSync(pendingPath)) return {};
return JSON.parse(fs.readFileSync(pendingPath, "utf8"));
}

function writePending(data) {
fs.writeFileSync(pendingPath, JSON.stringify(data, null, 4));
}

async function aboneKontrol(client) {
const pending = readPending();
const tikEmoji = emojiler.getReactionEmoji("tik", "✅");
const carpiEmoji = emojiler.getReactionEmoji("carpi", "❌");
const tikId = emojiler.getEmojiId("tik", "✅");
const carpiId = emojiler.getEmojiId("carpi", "❌");

for (const [msgId, record] of Object.entries(pending)) {
try {
const guild = client.guilds.cache.get(record.guildId);
if (!guild) {
delete pending[msgId];
continue;
}
const channel = await guild.channels.fetch(record.channelId).catch(() => null);
if (!channel || !channel.isTextBased()) {
delete pending[msgId];
continue;
}
const msg = await channel.messages.fetch(record.messageId).catch(() => null);
if (!msg) {
delete pending[msgId];
continue;
}
const hasTik = msg.reactions.cache.has(tikId) || msg.reactions.cache.has("✅");
const hasCarpi = msg.reactions.cache.has(carpiId) || msg.reactions.cache.has("❌");
if (!hasTik) await msg.react(tikEmoji).catch(() => msg.react("✅"));
if (!hasCarpi) await msg.react(carpiEmoji).catch(() => msg.react("❌"));
} catch {
delete pending[msgId];
}
}
writePending(pending);
}

function aboneKontrolYukle(client) {
console.log("▶️ [ABONE] Kontrol sistemi başlatıldı.");
aboneKontrol(client);
const pendingTimer = setInterval(() => aboneKontrol(client), 5 * 60 * 1000);
pendingTimer.unref?.();
startYoutubeCommentTracker(client);
}

module.exports = { aboneKontrolYukle };
