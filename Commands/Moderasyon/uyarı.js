const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ContainerBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, escapeMarkdown } = require("discord.js");
const path = require("path");
const { createJsonStore } = require("../../Utils/Core/safeJsonStore");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { formatDuration, parseDuration } = require("../../Utils/Moderation/rolYonetimi.js");

const filePath = path.join(__dirname, "../../Database/Güvenlik ve Moderasyon/uyari.json");
const warningStore = createJsonStore(filePath);
const LIST_ACCENT_COLOR = 0x337fb2;
const LIST_PAGE_SIZE = 5;
const LIST_COLLECTOR_TIME = 2 * 60 * 1000;
const MAX_TIMEOUT_DELAY = 2_147_000_000;
const DISCORD_ID_PATTERN = /^\d{17,20}$/;
const WARNING_ID_PATTERN = /^[a-zA-Z0-9-]{1,32}$/;

let expiryTimer = null;

function makeListButtonId(sessionId, action) {
    return `uyari_list:${sessionId}:${action}`;
}

function normalizePage(requestedPage, warningCount) {
    const pageCount = Math.max(1, Math.ceil(warningCount / LIST_PAGE_SIZE));
    const parsedPage = Number(requestedPage);
    const page = Math.min(
        Math.max(Number.isFinite(parsedPage) ? Math.trunc(parsedPage) : 0, 0),
        pageCount - 1
    );

    return { page, pageCount };
}

function normalizeWarning(warning) {
    if (typeof warning === "string") {
        return {
            id: null,
            reason: warning,
            moderatorId: null,
            createdAt: null,
            durationMs: null,
            expiresAt: null,
        };
    }

    const record = warning && typeof warning === "object" && !Array.isArray(warning)
        ? warning
        : {};
    const createdAt = Number(record.createdAt);
    const durationMs = Number(record.durationMs);
    const expiresAt = Number(record.expiresAt);

    return {
        id: typeof record.id === "string" && WARNING_ID_PATTERN.test(record.id) ? record.id : null,
        reason: typeof record.reason === "string" ? record.reason : "Sebep belirtilmemiş.",
        moderatorId: typeof record.moderatorId === "string" && DISCORD_ID_PATTERN.test(record.moderatorId)
            ? record.moderatorId
            : null,
        createdAt: Number.isFinite(createdAt) && createdAt > 0 ? Math.round(createdAt) : null,
        durationMs: Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : null,
        expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? Math.round(expiresAt) : null,
    };
}

function formatWarningReason(warning) {
    const value = String(normalizeWarning(warning).reason).trim() || "Sebep belirtilmemiş.";
    const escapedValue = escapeMarkdown(value);
    const maxLength = 3400;

    return escapedValue.length > maxLength
        ? `${escapedValue.slice(0, maxLength - 1)}…`
        : escapedValue;
}

function formatWarningDuration(warning) {
    const record = normalizeWarning(warning);
    if (!record.expiresAt) return "Kalıcı";

    const durationMs = record.durationMs
        || (record.createdAt ? record.expiresAt - record.createdAt : null);
    const durationLabel = durationMs && durationMs > 0
        ? formatDuration(durationMs)
        : "Süreli";

    return `${durationLabel} (<t:${Math.floor(record.expiresAt / 1_000)}:R>)`;
}

function formatWarningModerator(warning) {
    if (warning?.source === 'dashboard') return `Dashboard · ${escapeMarkdown(warning.moderatorName || 'Yönetici')}`;
    const { moderatorId } = normalizeWarning(warning);
    return moderatorId ? `<@${moderatorId}> (\`${moderatorId}\`)` : "Bilinmiyor *(eski kayıt)*";
}

function formatWarningRow(warning, number) {
    return [
        `**${number}. Uyarı**`,
        `- ${formatWarningReason(warning)}`,
        `-# ${emojiler.donensaat}  **Süre:** ${formatWarningDuration(warning)}`,
        `-# ${emojiler.kalkan}  **Uyaran:** ${formatWarningModerator(warning)}`,
    ].join("\n");
}

function createWarningId(usedIds, index) {
    const baseId = `l${Date.now().toString(36)}${index.toString(36)}`;
    let warningId = baseId;
    let suffix = 0;

    while (usedIds.has(warningId)) {
        suffix += 1;
        warningId = `${baseId}-${suffix.toString(36)}`;
    }

    usedIds.add(warningId);
    return warningId;
}

function migrateWarningRecords(data) {
    let changed = false;

    for (const warnings of Object.values(data)) {
        if (!Array.isArray(warnings)) continue;

        const usedIds = new Set(
            warnings
                .map(warning => normalizeWarning(warning).id)
                .filter(Boolean)
        );

        warnings.forEach((warning, index) => {
            const record = normalizeWarning(warning);
            if (record.id) return;

            warnings[index] = {
                id: createWarningId(usedIds, index),
                reason: record.reason,
                moderatorId: record.moderatorId,
                createdAt: record.createdAt,
                durationMs: record.durationMs,
                expiresAt: record.expiresAt,
            };
            changed = true;
        });
    }

    return changed;
}

function buildWarningListPayload(guild, targetId, warnings, requestedPage, sessionId, disabled = false, ephemeral = false) {
    const { page, pageCount } = normalizePage(requestedPage, warnings.length);
    const pageWarnings = warnings.slice(
        page * LIST_PAGE_SIZE,
        (page + 1) * LIST_PAGE_SIZE
    );
    const target = guild.members.cache.get(targetId);
    const targetLabel = target
        ? `${target} (\`${escapeMarkdown(target.user.id)}\`)`
        : `<@${targetId}>`;

    const container = new ContainerBuilder()
        .setAccentColor(LIST_ACCENT_COLOR)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    "## Uyarı Listesi",
                    `${targetLabel} adlı kişi toplam **${warnings.length} uyarı** almış.`,
                ].join("\n")
            )
        );

    pageWarnings.forEach((warning, index) => {
        const warningNumber = page * LIST_PAGE_SIZE + index + 1;
        const warningId = normalizeWarning(warning).id;

        container
            .addSeparatorComponents(
                new SeparatorBuilder()
                    .setSpacing(SeparatorSpacingSize.Small)
                    .setDivider(true)
            )
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            formatWarningRow(warning, warningNumber)
                        )
                    )
                    .setButtonAccessory(
                        new ButtonBuilder()
                            .setCustomId(makeListButtonId(sessionId, `delete:${warningId}`))
                            .setLabel("Uyarıyı Sil")
                            .setEmoji(`${emojiler.cop || "🗑️"}`)
                            .setStyle(ButtonStyle.Danger)
                            .setDisabled(disabled)
                    )
                );
    });

    container
        .addSeparatorComponents(
            new SeparatorBuilder()
                .setSpacing(SeparatorSpacingSize.Small)
                .setDivider(true)
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(makeListButtonId(sessionId, "previous"))
                    .setEmoji("⬅️")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled || page === 0),
                new ButtonBuilder()
                    .setCustomId(makeListButtonId(sessionId, "page"))
                    .setLabel(`${page + 1}/${pageCount}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(makeListButtonId(sessionId, "next"))
                    .setEmoji("➡️")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled || page === pageCount - 1)
            )
        );

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
        allowedMentions: { parse: [] },
    };
}

function readWarningFile() {
    return warningStore.loadData();
}

function writeWarningFile(data) {
    warningStore.update(current => {
        for (const key of Object.keys(current)) delete current[key];
        Object.assign(current, data);
    });
}

function removeExpiredWarnings(data, now = Date.now()) {
    let changed = false;

    for (const [userId, warnings] of Object.entries(data)) {
        if (!Array.isArray(warnings)) {
            delete data[userId];
            changed = true;
            continue;
        }

        const activeWarnings = warnings.filter(warning => {
            const { expiresAt } = normalizeWarning(warning);
            return !expiresAt || expiresAt > now;
        });

        if (activeWarnings.length !== warnings.length) changed = true;

        if (activeWarnings.length === 0) {
            delete data[userId];
            changed = true;
        } else {
            data[userId] = activeWarnings;
        }
    }

    return changed;
}

function findNextExpiry(data) {
    let nextExpiry = null;

    for (const warnings of Object.values(data)) {
        if (!Array.isArray(warnings)) continue;

        for (const warning of warnings) {
            const { expiresAt } = normalizeWarning(warning);
            if (expiresAt && (nextExpiry === null || expiresAt < nextExpiry)) {
                nextExpiry = expiresAt;
            }
        }
    }

    return nextExpiry;
}

function scheduleNextExpiry() {
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = null;

    const data = readWarningFile();
    const now = Date.now();
    const migrated = migrateWarningRecords(data);
    const removed = removeExpiredWarnings(data, now);
    if (migrated || removed) writeWarningFile(data);

    const nextExpiry = findNextExpiry(data);
    if (!nextExpiry) return;

    const delay = Math.max(1, Math.min(nextExpiry - now, MAX_TIMEOUT_DELAY));
    expiryTimer = setTimeout(() => {
        expiryTimer = null;
        const latestData = readWarningFile();
        const latestMigrated = migrateWarningRecords(latestData);
        const latestRemoved = removeExpiredWarnings(latestData);
        if (latestMigrated || latestRemoved) writeWarningFile(latestData);
        scheduleNextExpiry();
    }, delay);
    expiryTimer.unref?.();
}

function readWarnings() {
    const data = readWarningFile();
    const migrated = migrateWarningRecords(data);
    const removed = removeExpiredWarnings(data);
    if (migrated || removed) {
        writeWarningFile(data);
        scheduleNextExpiry();
    }
    return data;
}


function readGuildWarnings(guildId) {
    const prefix = `${guildId}:`;
    return Object.fromEntries(Object.entries(readWarnings())
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => [key.slice(prefix.length), value]));
}

function writeGuildWarnings(guildId, records) {
    const prefix = `${guildId}:`;
    warningStore.update(data => {
        for (const key of Object.keys(data)) if (key.startsWith(prefix)) delete data[key];
        for (const [id, warnings] of Object.entries(records)) {
            if (Array.isArray(warnings) && warnings.length) data[`${prefix}${id}`] = warnings;
        }
    });
    scheduleNextExpiry();
}

function legacyWarningCount() {
    return Object.entries(readWarnings()).filter(([key]) => DISCORD_ID_PATTERN.test(key))
        .reduce((count, [, rows]) => count + rows.length, 0);
}

function importLegacyWarnings(guildId) {
    const count = warningStore.update(data => {
        let imported = 0;
        for (const key of Object.keys(data)) {
            if (!DISCORD_ID_PATTERN.test(key) || !Array.isArray(data[key])) continue;
            const target = data[`${guildId}:${key}`] ||= [];
            target.push(...data[key]); imported += data[key].length; delete data[key];
        }
        return imported;
    });
    scheduleNextExpiry();
    return count;
}

scheduleNextExpiry();

function listUpdatePayload(guild, targetId, warnings, page, sessionId, disabled = false) {
    const { flags, ...payload } = buildWarningListPayload(
        guild,
        targetId,
        warnings,
        page,
        sessionId,
        disabled
    );
    return payload;
}

async function sendWarningList(interaction, targetId, warnings, ephemeral = false) {
    const warningSnapshot = [...warnings];
    const sessionId = interaction.id;
    let currentPage = 0;

    await interaction.reply(
        buildWarningListPayload(
            interaction.guild,
            targetId,
            warningSnapshot,
            currentPage,
            sessionId,
            false,
            ephemeral
        )
    );

    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: LIST_COLLECTOR_TIME,
    });

    collector.on("collect", async buttonInteraction => {
        if (!buttonInteraction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return buttonInteraction.reply({
                content: `${emojiler.uyari} **Bu butonları kullanmak için yetkin yok.**`,
                flags: MessageFlags.Ephemeral,
            });
        }

        const deletePrefix = makeListButtonId(sessionId, "delete:");
        if (buttonInteraction.customId.startsWith(deletePrefix)) {
            const warningId = buttonInteraction.customId.slice(deletePrefix.length);
            const data = readGuildWarnings(interaction.guild.id);
            const targetWarnings = Array.isArray(data[targetId]) ? data[targetId] : [];
            const storedIndex = targetWarnings.findIndex(
                warning => normalizeWarning(warning).id === warningId
            );

            if (storedIndex !== -1) {
                targetWarnings.splice(storedIndex, 1);
                if (targetWarnings.length === 0) delete data[targetId];
                else data[targetId] = targetWarnings;
                writeGuildWarnings(interaction.guild.id, data);
            }

            const snapshotIndex = warningSnapshot.findIndex(
                warning => normalizeWarning(warning).id === warningId
            );
            if (snapshotIndex !== -1) warningSnapshot.splice(snapshotIndex, 1);

            currentPage = normalizePage(currentPage, warningSnapshot.length).page;
            return buttonInteraction.update(
                listUpdatePayload(
                    interaction.guild,
                    targetId,
                    warningSnapshot,
                    currentPage,
                    sessionId
                )
            );
        }

        const { pageCount } = normalizePage(currentPage, warningSnapshot.length);

        if (
            buttonInteraction.customId === makeListButtonId(sessionId, "previous")
            && currentPage > 0
        ) {
            currentPage -= 1;
        } else if (
            buttonInteraction.customId === makeListButtonId(sessionId, "next")
            && currentPage < pageCount - 1
        ) {
            currentPage += 1;
        } else {
            return buttonInteraction.deferUpdate();
        }

        await buttonInteraction.update(
            listUpdatePayload(
                interaction.guild,
                targetId,
                warningSnapshot,
                currentPage,
                sessionId
            )
        );
    });

    collector.on("end", async () => {
        await interaction.editReply(
            listUpdatePayload(
                interaction.guild,
                targetId,
                warningSnapshot,
                currentPage,
                sessionId,
                true
            )
        ).catch(() => null);
    });
}

module.exports = {
    readGuildWarnings,
    writeGuildWarnings,
    legacyWarningCount,
    importLegacyWarnings,
    data: new SlashCommandBuilder()
        .setName('uyarı')
        .setDescription('Uyarı sistem komutları')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addSubcommand(subcommand =>
            subcommand
                .setName('at')
                .setDescription('Kişiyi uyarır.')
                .addUserOption(option =>
                    option.setName('kişi').setDescription('Kişi seç.').setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('sebep').setDescription('Sebep gir.').setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('süre')
                        .setDescription('İsteğe bağlı süre (10 dakika, 2 saat, 3 gün; boşsa kalıcı).')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('liste')
                .setDescription('Kişinin aldığı uyarıları gösterir.')
                .addUserOption(option =>
                    option.setName('kişi').setDescription('Kişi seç.').setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('temizle')
                .setDescription('Kişinin uyarılarını temizler.')
                .addUserOption(option =>
                    option.setName('kişi').setDescription('Kişi seç.').setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('sil')
                .setDescription('Belirtilen sıradaki uyarıyı siler.')
                .addUserOption(option =>
                    option.setName('kişi').setDescription('Kişi seç.').setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('numara').setDescription('Silinecek uyarı numarası.').setRequired(true)
                )
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const user = interaction.options.getMember('kişi');
        if (!user) return interaction.reply({ content: `${emojiler.uyari} **Belirtilen kişi bulunamadı.**`, flags: 64 });

        const warningsData = readGuildWarnings(interaction.guild.id);
        const userId = user.id;
        const userWarnings = warningsData[userId] || [];

        if (sub === 'at') {
            const reason = interaction.options.getString('sebep');
            const durationInput = interaction.options.getString('süre');
            const durationMs = durationInput ? parseDuration(durationInput) : null;

            if (durationInput && !durationMs) {
                return interaction.reply({
                    content: `${emojiler.uyari} **Geçerli bir süre gir. Örnek: \`10 dakika\`, \`2 saat\`, \`3 gün\` (en az 5 saniye, en fazla 1 yıl).**`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (interaction.member.roles.highest.position <= user.roles.highest.position && interaction.user.id !== interaction.guild.ownerId)
                return interaction.reply({ content: `${emojiler.uyari} **Bu kişiyi uyaramazsın. Rolü seninkine eşit veya daha yüksek.**`, flags: 64 });

            const createdAt = Date.now();
            const warningRecord = {
                id: interaction.id,
                reason,
                moderatorId: interaction.user.id,
                createdAt,
                durationMs,
                expiresAt: durationMs ? createdAt + durationMs : null,
            };

            userWarnings.push(warningRecord);
            warningsData[userId] = userWarnings;
            writeGuildWarnings(interaction.guild.id, warningsData);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`uyari_gor_${user.id}`).setLabel('Uyarıları Görüntüle').setEmoji("👁️").setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`uyari_sil_${user.id}_${warningRecord.id}`).setLabel('Uyarıyı Sil').setEmoji(`${emojiler.cop || '🗑️'}`).setStyle(ButtonStyle.Danger)
            );

            await interaction.reply({
                content: [
                    `${emojiler.uyari} ${user} (\`${user.user.id}\`) **uyarıldı.**`,
                    `${emojiler.alt}> Toplam **__${userWarnings.length}__ kez** uyarı almış.`,
                    "",
                    `-# ${emojiler.modernsagok} **Uyarı Sebebi:** __${reason}__`,
                    `-# ${emojiler.donensaat} **Süre:** ${formatWarningDuration(warningRecord)}`,
                ].join("\n"),
                components: [row],
                allowedMentions: { users: [user.id] },
            });

            user.send([
                `${emojiler.uyari} **${interaction.guild.name}** sunucusunda uyarı aldın.`,
                `-# ${emojiler.modernsagok} **Sebep:** ${reason}`,
                `-# ${emojiler.donensaat}  **Süre:** ${formatWarningDuration(warningRecord)}`,
            ].join("\n")).catch(() => {});

        } else if (sub === 'liste') {
            if (userWarnings.length === 0)
                return interaction.reply({ content: `${emojiler.carpi} ${user} (\`${user.user.id}\`) henüz uyarı **almamış.**`, flags: 64 });

            return sendWarningList(interaction, userId, userWarnings);

        } else if (sub === 'temizle') {
            if (userWarnings.length === 0)
                return interaction.reply({ content: `${emojiler.carpi} ${user} **(** ${user.displayName} **)** henüz uyarı **almamış.**`, flags: 64 });
            delete warningsData[userId];
            writeGuildWarnings(interaction.guild.id, warningsData);
            return interaction.reply({ content: `${emojiler.cop} ${user} **(** ${user.displayName} **)** adlı kişinin tüm uyarıları temizlendi.`, flags: 64 });

        } else if (sub === 'sil') {
            const index = interaction.options.getInteger('numara') - 1;
            if (index < 0 || index >= userWarnings.length)
                return interaction.reply({ content: `${emojiler.uyari} **Geçersiz uyarı numarası.**`, flags: 64 });
            userWarnings.splice(index, 1);
            warningsData[userId] = userWarnings;
            writeGuildWarnings(interaction.guild.id, warningsData);
            return interaction.reply({ content: `${emojiler.cop} ${user} adlı kişinin **${index + 1}.** uyarısı silindi.`, flags: 64 });
        }

const sent = await interaction.fetchReply();

const collector = sent.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 2 * 60 * 1000
});

collector.on('collect', async (i) => {
    try {
        if (!i.member.permissions.has(PermissionFlagsBits.ModerateMembers))
            return i.reply({ content: `${emojiler.uyari} **Bu butonu kullanmak için yetkin yok.**`, flags: 64 });

        if (i.customId.startsWith('uyari_gor_')) {
            const targetId = i.customId.split('_')[2];
            const warns = readGuildWarnings(interaction.guild.id)[targetId] || [];

            if (warns.length === 0)
                return i.reply({ content: `${emojiler.uyari} **Hiç uyarı bulunamadı.**`, flags: MessageFlags.Ephemeral });

            return sendWarningList(i, targetId, warns, true);
        }

        else if (i.customId.startsWith('uyari_sil_')) {
            await i.deferReply({ flags: MessageFlags.Ephemeral });
            const [, , targetId, warningId] = i.customId.split('_');
            const data = readGuildWarnings(interaction.guild.id);
            const targetWarnings = data[targetId];

            if (!Array.isArray(targetWarnings))
                return i.editReply({ content: `${emojiler.uyari} **Bu uyarı zaten silinmiş.**` });

            let warningIndex = targetWarnings.findIndex(
                warning => normalizeWarning(warning).id === warningId
            );

            if (warningIndex === -1) {
                const legacyIndex = Number(warningId);
                if (Number.isInteger(legacyIndex) && legacyIndex >= 0 && legacyIndex < targetWarnings.length) {
                    warningIndex = legacyIndex;
                }
            }

            if (warningIndex === -1)
                return i.editReply({ content: `${emojiler.uyari} **Bu uyarı zaten silinmiş.**` });

            targetWarnings.splice(warningIndex, 1);
            if (targetWarnings.length === 0) delete data[targetId];
            writeGuildWarnings(interaction.guild.id, data);
            await i.editReply({ content: `${emojiler.cop} **Uyarı silindi.**` });
        }

    } catch (err) {
        console.error("🔴 [UYARI] (collector):", err);
        try {
            await i.followUp({ content: `${emojiler.uyari} **İşlem sırasında hata oluştu.**`, flags: 64 });
        } catch {}
    }
});
    }
};
