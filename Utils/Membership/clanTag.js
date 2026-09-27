'use strict';

function normalizeTag(value) {
    if (typeof value !== 'string') return '';
    return value
        .normalize('NFC')
        .replace(/[\uFF01-\uFF5E]/g, character => String.fromCharCode(character.charCodeAt(0) - 0xFEE0))
        .trim()
        .toUpperCase();
}

function getDisplayedClanTag(user) {
    const clan = user?.primaryGuild;
    return clan?.identityEnabled === true ? normalizeTag(clan.tag) : '';
}

function getClanRoleId(user, guildId, tags) {
    if (!guildId || user?.primaryGuild?.identityGuildId !== guildId) return null;
    const tag = getDisplayedClanTag(user);
    return tag && tags && Object.hasOwn(tags, tag) ? tags[tag] : null;
}

module.exports = { normalizeTag, getDisplayedClanTag, getClanRoleId };
