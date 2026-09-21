const path = require("path");

function isPathInside(baseDir, targetPath) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedBase, resolvedTarget);

  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveInside(baseDir, ...segments) {
  const targetPath = path.resolve(baseDir, ...segments);
  return isPathInside(baseDir, targetPath) ? targetPath : null;
}

function isSafeGuildBackupId(backupId, guildId) {
  return typeof backupId === "string" && new RegExp(`^yedek_${guildId}_\\d{10,}$`).test(backupId);
}

function canMemberManageRole(member, role, guild) {
  if (!member || !role || !guild) return false;
  return member.id === guild.ownerId || member.roles.highest.position > role.position;
}

function canBotManageRole(guild, role) {
  if (!guild?.members?.me || !role) return false;
  return guild.members.me.roles.highest.position > role.position;
}

module.exports = {
  isPathInside,
  resolveInside,
  isSafeGuildBackupId,
  canMemberManageRole,
  canBotManageRole,
};