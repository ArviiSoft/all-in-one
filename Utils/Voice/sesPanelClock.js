const fs = require("../Core/databaseFs");
const path = require("path");

const dataPath = path.join(__dirname, "../../Database/Ses Sistemleri/sesPanelleri.json");
const fullHourEmojis = ["🕛", "🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗", "🕘", "🕙", "🕚"];
const halfHourEmojis = ["🕧", "🕜", "🕝", "🕞", "🕟", "🕠", "🕡", "🕢", "🕣", "🕤", "🕥", "🕦"];
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Istanbul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const pendingUpdates = new Map();

function getClockChannelName(date = new Date()) {
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  const emojis = Number(parts.minute) < 30 ? fullHourEmojis : halfHourEmojis;
  return `${emojis[Number(parts.hour) % 12]}・Saat · ${parts.hour}:${parts.minute}`;
}

async function updateClockChannel(channel) {
  if (pendingUpdates.has(channel.id)) return pendingUpdates.get(channel.id);
  const name = getClockChannelName();
  if (channel.name === name) return;

  const update = Promise.resolve().then(() => channel.setName(name));
  pendingUpdates.set(channel.id, update);
  try {
    return await update;
  } finally {
    pendingUpdates.delete(channel.id);
  }
}

function startClockChannelUpdater(client) {
  if (client.sesPanelClockTimer) return;

  function tick() {
    client.sesPanelClockTimer = setTimeout(tick, 60_000 - Date.now() % 60_000);
    client.sesPanelClockTimer.unref?.();

    if (!fs.existsSync(dataPath)) return;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
      if (!data || typeof data !== "object" || Array.isArray(data)) return;
    } catch (error) {
      console.error("🔴 [SAAT KANALI] Ses paneli verileri okunamadı:", error);
      return;
    }

    for (const [guildId, guildData] of Object.entries(data)) {
      if (!guildData?.saatKanalId) continue;
      const channel = client.guilds.cache.get(guildId)?.channels.cache.get(guildData.saatKanalId);
      if (!channel?.isVoiceBased()) continue;
      updateClockChannel(channel).catch(error => {
        console.error(`🔴 [SAAT KANALI] ${guildId} kanal adı güncellenemedi:`, error);
      });
    }
  }

  tick();
}

module.exports = { getClockChannelName, startClockChannelUpdater, updateClockChannel };