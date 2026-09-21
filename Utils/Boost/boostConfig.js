'use strict';

const { GuildSystemChannelFlags, MessageType } = require('discord.js');

const DEFAULT_THANKS = Object.freeze({
  enabled: false,
  channelId: null,
  title: 'Yeni Bir Sunucu Boostu Geldi!',
  message: [
    '{user}, sunucumuza boost bastığın için çok teşekkür ederiz!',
    'Desteğin sayesinde artık {boosts} sunucu boostumuz var.',
    'Bizimle olduğun için mutluyuz!',
  ].join('\n'),
});

const MAX_THANK_TITLE_LENGTH = 80;
const MAX_THANK_MESSAGE_LENGTH = 1000;
const SNOWFLAKE = /^\d{17,20}$/;
const SUPPRESS_PREMIUM_SUBSCRIPTIONS = GuildSystemChannelFlags?.SuppressPremiumSubscriptions ?? 2;
const BOOST_SYSTEM_MESSAGE_TYPES = new Set([
  MessageType.GuildBoost,
  MessageType.GuildBoostTier1,
  MessageType.GuildBoostTier2,
  MessageType.GuildBoostTier3,
]);

function cleanText(value, fallback, maxLength) {
  const text = String(value ?? '').replace(/\r\n?/g, '\n').trim();
  if (!text) return fallback;
  return text.slice(0, maxLength);
}

function cleanChannelId(value) {
  const text = String(value || '');
  return SNOWFLAKE.test(text) ? text : null;
}

function normalizeThanksConfig(config = {}) {
  const channelId = cleanChannelId(config.channelId);
  return {
    enabled: config.enabled === true && Boolean(channelId),
    channelId,
    title: cleanText(config.title, DEFAULT_THANKS.title, MAX_THANK_TITLE_LENGTH),
    message: cleanText(config.message, DEFAULT_THANKS.message, MAX_THANK_MESSAGE_LENGTH),
  };
}

function hasSystemChannelFlag(flags, flag) {
  if (!flags) return false;
  if (typeof flags.has === 'function') {
    try {
      return flags.has(flag);
    } catch {
      return false;
    }
  }
  const bitfield = flags.bitfield ?? flags;
  return Number.isFinite(Number(bitfield)) && (Number(bitfield) & flag) === flag;
}

function getSystemBoostSource(guild) {
  const channelId = cleanChannelId(guild?.systemChannelId);
  const suppressed = hasSystemChannelFlag(guild?.systemChannelFlags, SUPPRESS_PREMIUM_SUBSCRIPTIONS);
  return {
    channelId,
    configured: Boolean(channelId),
    boostMessagesEnabled: !suppressed,
    active: Boolean(channelId) && !suppressed,
  };
}

function isBoostSystemMessage(message) {
  return BOOST_SYSTEM_MESSAGE_TYPES.has(message?.type);
}

function applyBoostTemplate(template, member) {
  const guild = member.guild;
  const boostCount = Number.isFinite(guild?.premiumSubscriptionCount)
    ? guild.premiumSubscriptionCount.toLocaleString('tr-TR')
    : 'mevcut';
  const username = member.user?.username || member.displayName || member.id;
  const replacements = {
    user: `<@${member.id}>`,
    username,
    server: guild?.name || 'sunucu',
    boosts: boostCount,
    boost_count: boostCount,
  };
  return String(template || '').replace(/\{(user|username|server|boosts|boost_count)\}/gi, (match, key) => {
    return replacements[key.toLowerCase()] ?? match;
  });
}

module.exports = {
  DEFAULT_THANKS,
  MAX_THANK_MESSAGE_LENGTH,
  MAX_THANK_TITLE_LENGTH,
  SNOWFLAKE,
  applyBoostTemplate,
  cleanChannelId,
  cleanText,
  getSystemBoostSource,
  isBoostSystemMessage,
  normalizeThanksConfig,
};