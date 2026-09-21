const OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const KEY_PREFIX = "account_messages_v1_";

function count(value) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function calendarKeys(timestamp = Date.now()) {
  const local = new Date(timestamp + OFFSET_MS);
  const today = local.toISOString().slice(0, 10);
  const monday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
    - ((local.getUTCDay() + 6) % 7) * DAY_MS);
  return { today, month: today.slice(0, 7), week: monday.toISOString().slice(0, 10) };
}

function recordAccountMessage(data, message, timestamp = message?.createdTimestamp || Date.now()) {
  if (!message?.guild?.id || !message.author?.id || message.author.bot || message.webhookId) return;
  if (!Number.isFinite(timestamp) || timestamp <= 0) return;

  const key = `${KEY_PREFIX}${message.guild.id}`;
  let guildData = data[key];
  if (!guildData || guildData.version !== 1 || !guildData.users
    || typeof guildData.users !== "object" || Array.isArray(guildData.users)) {
    guildData = data[key] = { version: 1, startedAt: timestamp, users: {} };
  }
  if (!Number.isFinite(guildData.startedAt) || guildData.startedAt <= 0) guildData.startedAt = timestamp;

  const keys = calendarKeys(timestamp);
  let userData = guildData.users[message.author.id];
  if (!userData || typeof userData !== "object" || Array.isArray(userData)) {
    userData = guildData.users[message.author.id] = { total: 0 };
  }
  userData.total = count(userData.total) + 1;
  for (const period of ["today", "week", "month"]) {
    const previous = userData[period];
    if (previous?.key === keys[period]) {
      previous.count = count(previous.count) + 1;
    } else if (!previous?.key || previous.key < keys[period]) {
      userData[period] = { key: keys[period], count: 1 };
    }
  }
}

function unavailableMessages() {
  return {
    total: null, month: null, week: null, today: null,
    available: false, source: "unavailable", trackedSince: null, partial: true,
    timeZone: "Europe/Istanbul", utcOffset: "+03:00", weekStartsOn: "monday",
  };
}

function legacyKnownChannelTotal(guild, userId, data) {
  let total = 0;
  let found = false;
  for (const channel of guild?.channels?.cache?.values?.() || []) {
    const value = data[`channelMsgCount_${channel.id}_${userId}`];
    if (!Number.isFinite(value) || value < 0) continue;
    found = true;
    total += Math.floor(value);
  }
  return found ? total : null;
}

function getAccountMessageStats(guild, userId, data, timestamp = Date.now()) {
  const result = unavailableMessages();
  if (!guild?.id || !userId || !data || typeof data !== "object") return result;
  const guildData = data[`${KEY_PREFIX}${guild.id}`];
  if (guildData?.version === 1 && guildData.users && typeof guildData.users === "object"
    && !Array.isArray(guildData.users) && Number.isFinite(guildData.startedAt) && guildData.startedAt > 0) {
    const userData = guildData.users[userId];
    const keys = calendarKeys(timestamp);
    return {
      ...result,
      total: count(userData?.total),
      ...Object.fromEntries(["month", "week", "today"].map(period => [
        period, userData?.[period]?.key === keys[period] ? count(userData[period].count) : 0,
      ])),
      available: true,
      source: "guild-calendar",
      trackedSince: guildData.startedAt,
      partial: true,
    };
  }

  const total = legacyKnownChannelTotal(guild, userId, data);
  return total === null ? result : {
    ...result, total, available: true, source: "legacy-known-channels",
  };
}

module.exports = { calendarKeys, recordAccountMessage, getAccountMessageStats, unavailableMessages };