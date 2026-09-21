const fs = require("../Core/databaseFs").promises;
const path = require("node:path");
const { GatewayIntentBits } = require("discord.js");
const db = require("../Core/jsonDB");
const { getAccountMessageStats, unavailableMessages } = require("./accountMessageStats");

const INVITE_PATH = path.join(__dirname, "../../Database/Üye Verileri/davetBilgi.json");
const MEMBER_FETCH_TIMEOUT_MS = 4_000;
const MEMBER_FETCH_COOLDOWN_MS = 5 * 60_000;
const MAX_MEMBERS_TO_FETCH = 25_000;
const JOIN_RECORD_TOLERANCE_MS = 2 * 60_000;
const memberFetches = new WeakMap();

function joinedTimestamp(member) {
  const value = member?.joinedTimestamp ?? member?.joinedAt?.getTime?.();
  return Number.isFinite(value) && value > 0 ? value : null;
}

function compareIds(first, second) {
  const left = String(first);
  const right = String(second);
  return left.length - right.length || (left < right ? -1 : left > right ? 1 : 0);
}

function positionFromCompleteCache(guild, member) {
  const cache = guild?.members?.cache;
  const targetJoinedAt = joinedTimestamp(member);
  if (!cache || !targetJoinedAt || !Number.isInteger(guild.memberCount)
    || cache.size !== guild.memberCount || !cache.has(member.id)
    || joinedTimestamp(cache.get(member.id)) !== targetJoinedAt) return null;

  let position = 1;
  for (const other of cache.values()) {
    const otherJoinedAt = joinedTimestamp(other);
    if (!otherJoinedAt || other.partial) return null;
    if (other.id === member.id) continue;
    if (otherJoinedAt < targetJoinedAt
      || (otherJoinedAt === targetJoinedAt && compareIds(other.id, member.id) < 0)) position++;
  }
  return position;
}

async function getJoinPosition(guild, member) {
  const cached = positionFromCompleteCache(guild, member);
  if (cached !== null) return cached;
  if (!guild || !member || !joinedTimestamp(member) || !guild.members?.fetch
    || !Number.isInteger(guild.memberCount) || guild.memberCount > MAX_MEMBERS_TO_FETCH
    || !guild.client?.options?.intents?.has?.(GatewayIntentBits.GuildMembers)) return null;

  let state = memberFetches.get(guild);
  if (state?.pending) {
    await state.pending;
    return positionFromCompleteCache(guild, member);
  }
  if (state && Date.now() - state.attemptedAt < MEMBER_FETCH_COOLDOWN_MS) return null;

  state = { attemptedAt: Date.now(), pending: null };
  memberFetches.set(guild, state);
  state.pending = (async () => {
    let timer;
    try {
      const fetch = Promise.resolve().then(() => guild.members.fetch({
        withPresences: false, time: MEMBER_FETCH_TIMEOUT_MS,
      }));
      await Promise.race([
        fetch,
        new Promise(resolve => { timer = setTimeout(resolve, MEMBER_FETCH_TIMEOUT_MS); }),
      ]);
    } catch {
    } finally {
      clearTimeout(timer);
      state.pending = null;
    }
  })();
  await state.pending;
  return positionFromCompleteCache(guild, member);
}

function inviteForCurrentMembership(records, member) {
  const joinedAt = joinedTimestamp(member);
  if (!Array.isArray(records) || !joinedAt) return null;
  const record = records.filter(item => item && item.invitedId === member.id && !item.leftAt
    && Number.isFinite(item.joinedAt) && Math.abs(item.joinedAt - joinedAt) <= JOIN_RECORD_TOLERANCE_MS
    && /^\d+$/.test(String(item.inviterId || "")) && /^[\w-]+$/.test(String(item.inviteCode || "")))
    .sort((first, second) => second.joinedAt - first.joinedAt)[0];
  return record ? {
    type: "invite", inviterId: record.inviterId, inviteCode: record.inviteCode,
    joinedAt: record.joinedAt, source: "inviteTracker",
  } : null;
}

async function readJoinMethod(guild, member) {
  try {
    const data = JSON.parse(await fs.readFile(INVITE_PATH, "utf8"));
    return inviteForCurrentMembership(data[guild.id]?.records, member);
  } catch {
    return null;
  }
}

async function getMembershipDetails(guild, member) {
  if (!guild || !member) return null;
  const roles = Array.from(member.roles?.cache?.values?.() || [])
    .filter(role => role.id !== guild.id)
    .sort((first, second) => second.position - first.position || compareIds(first.id, second.id));
  const [joinPosition, joinMethod] = await Promise.all([
    getJoinPosition(guild, member), readJoinMethod(guild, member),
  ]);
  let messages = unavailableMessages();
  if (!member.user?.bot) {
    try {
      messages = getAccountMessageStats(guild, member.id, db.loadData());
    } catch (error) {
      console.warn("🟡 [HESAP BİLGİ] Mesaj istatistikleri okunamadı:", error?.message || error);
    }
  }
  return { roles, joinedTimestamp: joinedTimestamp(member), joinPosition, joinMethod, messages };
}

module.exports = { getMembershipDetails, getJoinPosition, positionFromCompleteCache, inviteForCurrentMembership };