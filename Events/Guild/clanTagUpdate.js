'use strict';

const {  Events, ContainerBuilder, SectionBuilder, ThumbnailBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const fs = require('../../Utils/Core/databaseFs');
const path = require('path');
const emojiler = require('../../Utils/Emojis/emojiler.js');
const { getDisplayedClanTag, getClanRoleId } = require('../../Utils/Membership/clanTag');

const DB_PATH = path.join(__dirname, '../../Database/Sunucu Yönetimi/clanTag.json');

function readDB() {
    if (!fs.existsSync(DB_PATH)) return {};
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch (error) {
        console.error('🔴 [CLAN] Veritabanı okunamadı:', error);
        return {};
    }
}

function getClanBadgeURL(user) {
    const clan = user?.primaryGuild;
    if (!getDisplayedClanTag(user) || !clan.identityGuildId || !clan.badge) return null;

    return user.guildTagBadgeURL?.({ size: 128 })
        || `https://cdn.discordapp.com/guild-tag-badges/${clan.identityGuildId}/${clan.badge}.webp?size=128`;
}

function sameClanIdentity(oldUser, newUser) {
    return getDisplayedClanTag(oldUser) === getDisplayedClanTag(newUser)
        && oldUser?.primaryGuild?.identityGuildId === newUser?.primaryGuild?.identityGuildId
        && oldUser?.primaryGuild?.identityEnabled === newUser?.primaryGuild?.identityEnabled;
}

function snapshotUser(user) {
    return {
        id: user.id, tag: user.tag, bot: user.bot,
        primaryGuild: user.primaryGuild ? { ...user.primaryGuild } : null,
    };
}

async function sendLog(guild, logChannelId, oldUser, newUser, operation, roleId) {
    const channel = guild.channels.cache.get(logChannelId);
    if (!channel?.isTextBased()) return;

    const oldTag = getDisplayedClanTag(oldUser) || 'Yok';
    const newTag = getDisplayedClanTag(newUser) || 'Yok';
    const oldGuildId = getDisplayedClanTag(oldUser) ? oldUser.primaryGuild?.identityGuildId || 'Bilinmiyor' : 'Yok';
    const newGuildId = getDisplayedClanTag(newUser) ? newUser.primaryGuild?.identityGuildId || 'Bilinmiyor' : 'Yok';
    const useOldBadge = operation === 'alindi' || !getDisplayedClanTag(newUser);
    const badgeUser = useOldBadge ? oldUser : newUser;
    let badgeURL = getClanBadgeURL(badgeUser);

    if (!badgeURL && !useOldBadge) {
        const freshUser = await guild.client.users.fetch(newUser.id, { force: true }).catch(() => null);
        if (freshUser && sameClanIdentity(badgeUser, freshUser)) {
            badgeURL = getClanBadgeURL(freshUser);
        }
    }

    if (!badgeURL && sameClanIdentity(oldUser, newUser)) badgeURL = getClanBadgeURL(useOldBadge ? newUser : oldUser);
    let color;
    let title;
    let description;

    if (operation === 'verildi') {
        color = 0x57F287;
        title = `${emojiler.tik} Clan Tag Rolü Verildi`;
        description = `${emojiler.uye} **Kişi:** <@${newUser.id}> (${newUser.id})\n${emojiler.hashtag} **Tag:** \`${newTag}\`\n${emojiler.home} **Tag Sunucu ID:** \`${newGuildId}\`\n${emojiler.ampul} **Rol:** <@&${roleId}>`;
    } else if (operation === 'alindi') {
        color = 0xED4245;
        title = `${emojiler.carpi} Clan Tag Rolü Alındı`;
        description = `${emojiler.uye} **Kişi:** <@${newUser.id}> (${newUser.id})\n${emojiler.hashtag} **Eski Tag:** \`${oldTag}\`\n${emojiler.hashtag} **Eski Tag Sunucu ID:** \`${oldGuildId}\`\n${emojiler.ampul} **Rol:** <@&${roleId}>`;
    } else {
        color = 0xFEE75C;
        title = '♻️ Clan Tag Değişti';
        description = `${emojiler.uye} **Kişi:** <@${newUser.id}> (${newUser.id})\n${emojiler.hashtag} **Eski Tag:** \`${oldTag}\`\n${emojiler.home} **Eski Tag Sunucu ID:** \`${oldGuildId}\`\n${emojiler.hashtag} **Yeni Tag:** \`${newTag}\`\n${emojiler.home} **Yeni Tag Sunucu ID:** \`${newGuildId}\``;
    }

    const container = new ContainerBuilder().setAccentColor(color);
    const header = new TextDisplayBuilder().setContent(`## ${title}`);

    if (badgeURL) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(header)
                .setThumbnailAccessory(
                    new ThumbnailBuilder()
                        .setURL(badgeURL)
                        .setDescription(`${useOldBadge ? oldTag : newTag} clan tag sembolü`)
                )
        );
    } else {
        container.addTextDisplayComponents(header);
    }

    container
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(description))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# <t:${Math.floor(Date.now() / 1000)}:F>`)
        );

    await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
    }).catch(error => {
        console.error('🔴 [CLAN] Log mesajı gönderilemedi:', error);
    });
}

async function synchronizeMember(member, tags, user = member.user) {
    const currentTag = getDisplayedClanTag(user);
    const wantedRoleId = getClanRoleId(user, member.guild.id, tags);
    const configuredRoleIds = new Set(Object.values(tags));
    const changes = [];

    for (const roleId of configuredRoleIds) {
        if (roleId !== wantedRoleId && member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId, 'Clan tag-rol eşleşmesi: tag veya kaynak sunucu uygun değil').then(() => {
                changes.push({ operation: 'alindi', roleId });
            }).catch(error => {
                console.error(`🔴 [CLAN] ${member.user.tag} kullanıcısından ${roleId} rolü alınamadı:`, error);
            });
        }
    }

    if (wantedRoleId && !member.roles.cache.has(wantedRoleId)) {
        await member.roles.add(wantedRoleId, `Clan tag: ${currentTag} | Sunucu: ${member.guild.id}`).then(() => {
            changes.push({ operation: 'verildi', roleId: wantedRoleId });
        }).catch(error => {
            console.error(`🔴 [CLAN] ${member.user.tag} kullanıcısına ${wantedRoleId} rolü verilemedi:`, error);
        });
    }
    return changes;
}

async function synchronizeClanRoles(client) {
    const db = readDB();

    for (const [guildId, settings] of Object.entries(db)) {
        const guild = client.guilds.cache.get(guildId);
        const tags = settings.tags || {};
        if (!guild || !Object.keys(tags).length) continue;

        const members = await guild.members.fetch().catch(error => {
            console.error(`🔴 [CLAN] ${guild.name} üyeleri alınamadı:`, error);
            return null;
        });
        if (!members) continue;

        for (const member of members.values()) {
            if (!member.user.bot) await synchronizeMember(member, tags);
        }
    }
}

module.exports = {
    name: Events.UserUpdate,
    synchronizeClanRoles,

    async execute(oldUser, newUser, client) {
        if (newUser.bot || sameClanIdentity(oldUser, newUser)) return;
        oldUser = snapshotUser(oldUser);
        newUser = snapshotUser(newUser);
        const oldTag = getDisplayedClanTag(oldUser);
        const newTag = getDisplayedClanTag(newUser);

        const db = readDB();
        for (const [guildId, settings] of Object.entries(db)) {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;

            const member = await guild.members.fetch(newUser.id).catch(() => null);
            if (!member) continue;

            const tags = settings.tags || {};
            const changes = await synchronizeMember(member, tags, newUser);
            for (const { operation, roleId } of changes) {
                console.log(`🛡️ [CLAN] ${newUser.tag} ➜ \`${operation === 'alindi' ? oldTag : newTag}\` rolü ${operation === 'alindi' ? 'alındı' : 'verildi'}.`);
                if (settings.logChannel) await sendLog(guild, settings.logChannel, oldUser, newUser, operation, roleId);
            }

            if (settings.generalLogChannel && (oldTag || newTag)) {
                await sendLog(guild, settings.generalLogChannel, oldUser, newUser, 'degisti');
            }
        }
    },
};
