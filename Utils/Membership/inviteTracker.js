const fs = require("../Core/databaseFs");
const path = require("path");

const dbPath = path.join(__dirname, "../../Database/Üye Verileri/davetBilgi.json");
const MAX_RECORDS_PER_GUILD = 1000;

function ensureDBFile() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({}, null, 2));
}

function readDB() {
  try {
    ensureDBFile();
    return JSON.parse(fs.readFileSync(dbPath, "utf8"));
  } catch (err) {
    console.error("🔴 [DAVET] davetBilgi.json okunamadı:", err.message);
    return {};
  }
}

function saveDB(data) {
  ensureDBFile();
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

function ensureGuildData(data, guildId) {
  if (!data[guildId]) data[guildId] = { records: [] };
  if (!Array.isArray(data[guildId].records)) data[guildId].records = [];
  return data[guildId];
}

function ensureInviteCache(client) {
  if (!client.inviteCache) client.inviteCache = new Map();
  return client.inviteCache;
}

function inviteToData(invite) {
  return {
    code: invite.code,
    uses: Number(invite.uses) || 0,
    inviterId: invite.inviter?.id || null,
    inviterName: invite.inviter
      ? invite.inviter.globalName || invite.inviter.username || invite.inviter.tag
      : null,
    channelId: invite.channel?.id || invite.channelId || null,
    createdTimestamp: invite.createdTimestamp || null,
    expiresTimestamp: invite.expiresTimestamp || null,
    maxUses: Number(invite.maxUses) || 0
  };
}

function serializeInvites(invites) {
  const snapshot = new Map();
  invites.forEach(invite => {
    if (invite?.code) snapshot.set(invite.code, inviteToData(invite));
  });
  return snapshot;
}

async function refreshGuildInviteCache(guild) {
  const cache = ensureInviteCache(guild.client);
  const invites = await guild.invites.fetch();
  const snapshot = serializeInvites(invites);
  cache.set(guild.id, snapshot);
  return snapshot;
}

async function initializeInviteCache(client) {
  const guilds = Array.from(client.guilds.cache.values());
  const results = await Promise.allSettled(guilds.map(guild => refreshGuildInviteCache(guild)));
  const readyCount = results.filter(result => result.status === "fulfilled").length;
  console.log(`📩 [DAVET] Invite cache hazır (${readyCount}/${guilds.length}).`);
}

function findUsedInvite(before, after) {
  if (!(before instanceof Map) || before.size === 0) return null;

  let best = null;
  for (const invite of after.values()) {
    const previous = before.get(invite.code);
    let diff = 0;

    if (previous && invite.uses > previous.uses) {
      diff = invite.uses - previous.uses;
    } else if (!previous && invite.uses > 0) {
      diff = 1;
    }

    if (
      diff > 0 &&
      (!best ||
        diff > best.diff ||
        invite.uses > best.invite.uses ||
        (invite.createdTimestamp || 0) > (best.invite.createdTimestamp || 0))
    ) {
      best = { invite, diff };
    }
  }

  return best?.invite || null;
}

async function trackMemberInvite(member) {
  if (!member?.guild) return null;

  const guild = member.guild;
  const cache = ensureInviteCache(guild.client);
  const before = cache.get(guild.id);
  const after = serializeInvites(await guild.invites.fetch());
  const usedInvite = findUsedInvite(before, after);

  cache.set(guild.id, after);

  if (!usedInvite?.inviterId) return null;

  const data = readDB();
  const guildData = ensureGuildData(data, guild.id);
  const record = {
    inviterId: usedInvite.inviterId,
    inviterName: usedInvite.inviterName,
    invitedId: member.id,
    invitedName: member.user.globalName || member.user.username,
    invitedUsername: member.user.username,
    invitedTag: member.user.tag,
    invitedAvatarURL: member.user.displayAvatarURL({ extension: "png", size: 128 }),
    invitedBot: Boolean(member.user.bot),
    inviteCode: usedInvite.code,
    inviteUrl: `https://discord.gg/${usedInvite.code}`,
    channelId: usedInvite.channelId,
    joinedAt: Date.now(),
    usesAfter: usedInvite.uses
  };

  guildData.records.unshift(record);
  guildData.records = guildData.records.slice(0, MAX_RECORDS_PER_GUILD);
  saveDB(data);

  return record;
}

function getInviteHistory(guildId, inviterId) {
  const data = readDB();
  const records = data[guildId]?.records;
  if (!Array.isArray(records)) return [];

  return records
    .filter(record => record.inviterId === inviterId)
    .sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));
}

function markMemberLeft(member) {
  if (!member?.guild) return null;

  const data = readDB();
  const records = data[member.guild.id]?.records;
  if (!Array.isArray(records)) return null;

  const record = records.find(item => item.invitedId === member.id && !item.leftAt);
  if (!record) return null;

  record.leftAt = Date.now();
  saveDB(data);
  return record;
}

function updateCachedInvite(invite) {
  if (!invite?.guild) return;
  const cache = ensureInviteCache(invite.client);
  const snapshot = cache.get(invite.guild.id) || new Map();
  snapshot.set(invite.code, inviteToData(invite));
  cache.set(invite.guild.id, snapshot);
}

function removeCachedInvite(invite) {
  if (!invite?.guild) return;
  const cache = ensureInviteCache(invite.client);
  const snapshot = cache.get(invite.guild.id);
  if (!snapshot) return;
  snapshot.delete(invite.code);
}

module.exports = {
  initializeInviteCache,
  refreshGuildInviteCache,
  trackMemberInvite,
  getInviteHistory,
  markMemberLeft,
  updateCachedInvite,
  removeCachedInvite
};
