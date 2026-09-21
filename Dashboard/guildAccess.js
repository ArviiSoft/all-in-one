'use strict';

const { PermissionFlagsBits: P } = require('discord.js');
const { AyarHatasi } = require('./validation');

const BOT_OWNER_MODULES = new Set(['yedek-plani', 'temp-voice', 'ses-kanali', 'bot-log', 'yardim', 'genel', 'aktif-uye']);
const MODULE_PERMISSIONS = {
  ban: [P.BanMembers], forceban: [P.BanMembers], kick: [P.KickMembers],
  'nickname-degistir': [P.ManageNicknames], 'rol-ver': [P.ManageRoles], 'rol-al': [P.ManageRoles],
  'toplu-rol': [P.ManageRoles], timeout: [P.ModerateMembers], uyari: [P.ModerateMembers],
  temizle: [P.ManageMessages], yavasmod: [P.ManageChannels],
  'kanal-kilitle': [P.ManageRoles], nuke: [P.ManageChannels, P.ManageRoles],
  'clan-tag': [P.ManageRoles], 'emoji-rol': [P.ManageRoles],
  'durum-rol': [P.ManageRoles], abonelik: [P.ManageRoles],
  'yetkili-basvuru': [P.ManageRoles], 'dogum-gunu': [P.ManageRoles],
  'ses-panelleri': [P.ManageChannels], destek: [P.ManageChannels, P.ManageRoles],
  'emoji-ekle': [P.ManageGuildExpressions], honeypot: [P.KickMembers],
  audit: [P.ViewAuditLog], youtube: [P.ManageWebhooks], yedek: [P.Administrator],
};
const CHANNEL_ACTION_PERMISSIONS = {
  temizle: [P.ManageMessages, P.ReadMessageHistory],
  yavasmod: [P.ManageChannels], 'kanal-kilitle': [P.ManageRoles],
  nuke: [P.ManageChannels, P.ManageRoles],
  sticky: [P.SendMessages, P.ReadMessageHistory],
  'emoji-rol': [P.SendMessages], 'ses-panelleri': [P.ManageChannels],
};
const HIERARCHY_ACTIONS = new Set([
  'ban:ban', 'forceban:ban', 'kick:kick', 'nickname-degistir:set',
  'rol-ver:apply', 'rol-al:apply', 'timeout:apply', 'timeout:remove', 'uyari:add',
]);

function isOwner(guild, member) {
  return Boolean(member?.id && guild.ownerId === member.id);
}
function hasPermission(guild, member, permissions) {
  return isOwner(guild, member) || Boolean(member?.permissions?.has(permissions));
}
function requirePermissions(guild, member, permissions) {
  if (!hasPermission(guild, member, permissions)) throw new AyarHatasi('Bu işlem için Discord hesabınızın sunucu izinleri yeterli değil.', 403);
}
function valueAt(values, key) {
  if (!values || typeof values !== 'object') return undefined;
  if (Object.hasOwn(values, key)) return values[key];
  return key.split('.').reduce((value, part) => value && typeof value === 'object' && Object.hasOwn(value, part) ? value[part] : undefined, values);
}
function belowMember(role, member) {
  const highest = member?.roles?.highest;
  if (!role || !highest) return false;
  return typeof role.comparePositionTo === 'function'
    ? role.comparePositionTo(highest) < 0
    : Number.isFinite(role.position) && Number.isFinite(highest.position) && role.position < highest.position;
}
function canViewChannel(guild, member, channel) {
  if (!channel || (channel.guildId || channel.guild?.id) !== guild.id) return false;
  if (isOwner(guild, member)) return true;
  const permissions = channel.permissionsFor?.(member);
  if (!permissions?.has(P.ViewChannel)) return false;
  return channel.type !== 12 || permissions.has(P.ManageThreads) || channel.members?.cache?.has(member.id) === true;
}
function assertRoleAccess(guild, member, role, label) {
  if (!role || role.id === guild.id || role.managed || (role.guild && role.guild.id !== guild.id)) throw new AyarHatasi(`${label}: bu rol yönetilemez.`, 403);
  requirePermissions(guild, member, [P.ManageRoles]);
  if (isOwner(guild, member)) return;
  if (!belowMember(role, member)) throw new AyarHatasi(`${label}: rol, kendi en yüksek rolünüzün altında olmalı.`, 403);
  if (role.permissions?.bitfield === undefined || !member.permissions.has(role.permissions.bitfield)) throw new AyarHatasi(`${label}: kendi izinlerinizden daha fazla yetki veren bir rol seçemezsiniz.`, 403);
}

function checkFields(fields, values, guild, member, assignableRoles) {
  const visit = (field, value) => {
    if (value === undefined || value === null || value === '') return;
    if (field.type === 'array' && Array.isArray(value)) {
      for (const item of value) visit(field.item, item);
    } else if (field.type === 'list' && Array.isArray(value)) {
      for (const row of value) for (const child of field.fields || []) visit(child, valueAt(row, child.key));
    } else if (field.type === 'channel') {
      if (!canViewChannel(guild, member, guild.channels.cache.get(value))) throw new AyarHatasi(`${field.label}: yalnızca erişiminiz olan sunucu kanallarını kullanabilirsiniz.`, 403);
    } else if (assignableRoles && field.type === 'role' && field.assignable) {
      assertRoleAccess(guild, member, guild.roles.cache.get(value), field.label);
    }
  };
  for (const field of fields || []) visit(field, valueAt(values, field.key));
}
function assertFieldAccess(fields, values, guild, member) {
  checkFields(fields, values, guild, member, true);
}
function assertFieldReadAccess(fields, values, guild, member) {
  checkFields(fields, values, guild, member, false);
}

function filterGuildEntities(guild, member) {
  return {
    channels: [...guild.channels.cache.values()].filter(channel => canViewChannel(guild, member, channel)),
    roles: [...guild.roles.cache.values()].filter(role => role.id !== guild.id && !role.managed),
  };
}

function assertModuleWriteAccess(moduleId, guild, member, changes = {}) {
  if (BOT_OWNER_MODULES.has(moduleId)) throw new AyarHatasi('Bu modül yalnızca yerel bot sahibi hesabından yönetilebilir.', 403);
  requirePermissions(guild, member, MODULE_PERMISSIONS[moduleId] || [P.ManageGuild]);
  if (moduleId === 'automod') {
    const action = valueAt(changes, 'raid.action');
    if (action === 'ban') requirePermissions(guild, member, [P.BanMembers]);
    if (action === 'kick') requirePermissions(guild, member, [P.KickMembers]);
  }
}
function assertModuleReadAccess(moduleId, guild, member) {
  assertModuleWriteAccess(moduleId, guild, member);
}

function assertTargetHierarchy(guild, member, target) {
  if (!target || isOwner(guild, member)) return;
  if ((target.guild && target.guild.id !== guild.id) || target.id === guild.ownerId || (target.id !== member.id && !belowMember(target.roles?.highest, member))) {
    throw new AyarHatasi('Kendi rolünüzle eşit veya daha yüksek yetkili üyeler üzerinde bu işlemi yapamazsınız.', 403);
  }
}

async function assertBulkHierarchy(moduleId, guild, member, input, savedValues) {
  if (isOwner(guild, member)) return;
  if (moduleId === 'clan-tag' && !Array.isArray(savedValues.tags)) throw new AyarHatasi('Toplu rol işlemi için kayıtlı roller doğrulanamadı.', 403);
  const tags = new Map((savedValues.tags || []).map(row => [row.tag, row.roleId]));
  const roleIds = new Set(tags.values());
  if (moduleId === 'clan-tag' && !roleIds.size) return;
  const members = await guild.members.fetch();
  for (const target of members.values()) {
    if (moduleId === 'toplu-rol') {
      if (target.user.bot !== (input.target === 'bots')) continue;
      if ([guild.ownerId, guild.members.me?.id].includes(target.id) || !target.manageable || target.roles.cache.has(input.roleId) === (input.operation === 'add')) continue;
    } else {
      if (target.user.bot) continue;
      const primary = target.user.primaryGuild;
      const tag = primary?.identityEnabled !== false && primary?.tag
        ? primary.tag.normalize('NFC').replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).trim().toUpperCase()
        : null;
      const desired = tags.get(tag);
      const removing = [...roleIds].some(id => id !== desired && target.roles.cache.has(id));
      const adding = desired && !target.roles.cache.has(desired);
      if (!removing && !adding) continue;
    }
    assertTargetHierarchy(guild, member, target);
  }
}

async function assertActionAccess(moduleId, actionId, guild, member, input = {}, savedValues = {}) {
  if ((moduleId === 'yedek' && actionId === 'zip') || (moduleId === 'uyari' && actionId === 'import-legacy')) throw new AyarHatasi('Bu işlem yalnızca yerel bot sahibi hesabından yapılabilir.', 403);
  assertModuleWriteAccess(moduleId, guild, member);
  if (moduleId === 'yedek' && actionId === 'restore' && !isOwner(guild, member)) throw new AyarHatasi('Sunucunun tüm yapısını geri yüklemek için sunucu sahibi olmalısınız.', 403);
  const channelPermissions = CHANNEL_ACTION_PERMISSIONS[moduleId];
  if (channelPermissions && input.channelId) {
    const channel = guild.channels.cache.get(input.channelId);
    if (!canViewChannel(guild, member, channel) || (!isOwner(guild, member) && !channel.permissionsFor(member)?.has(channelPermissions))) throw new AyarHatasi('Discord hesabınızın seçili kanaldaki işlem izinleri yeterli değil.', 403);
  }
  if (HIERARCHY_ACTIONS.has(`${moduleId}:${actionId}`) && input.userId && !isOwner(guild, member)) {
    const target = await guild.members.fetch({ user: input.userId, force: true }).catch(error => {
      if (error.code === 10007) return null;
      throw error;
    });
    assertTargetHierarchy(guild, member, target);
  }
  if ((moduleId === 'toplu-rol' && actionId === 'apply') || (moduleId === 'clan-tag' && actionId === 'sync')) await assertBulkHierarchy(moduleId, guild, member, input, savedValues);
}

module.exports = { assertFieldAccess, assertFieldReadAccess, filterGuildEntities, assertModuleWriteAccess, assertModuleReadAccess, assertActionAccess, canViewChannel };
