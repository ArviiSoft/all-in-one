const locks = new WeakMap();

function hasMusicSession(queue) {
  if (!queue || queue.deleted) return false;
  const status = queue.metadata?.musicPlayback?.status;
  if (["error", "ended"].includes(status)) return false;
  return Boolean(queue.currentTrack || status === "loading" || status === "playing");
}

async function withMusicQueueLock(player, guildId, operation) {
  let guilds = locks.get(player);
  if (!guilds) locks.set(player, guilds = new Map());
  const previous = guilds.get(guildId) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  guilds.set(guildId, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (guilds.get(guildId) === current) guilds.delete(guildId);
  }
}

module.exports = { hasMusicSession, withMusicQueueLock };
