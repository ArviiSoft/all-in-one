'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ContainerBuilder, SectionBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const fs = require('../../Utils/Core/databaseFs');
const path = require('path');
const emojiler = require('../../Utils/Emojis/emojiler.js');

const DB_PATH = path.join(__dirname, '../../Database/Sunucu Yönetimi/clanTag.json');
const PANEL_ACCENT_COLOR = 0xc9a76a;
const PANEL_REPLY_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PANEL_UPDATE_FLAGS = MessageFlags.IsComponentsV2;
const SESSION_TTL = 5 * 60_000;
const LOG_SETTINGS = {
    generalLog: {
        key: 'generalLogChannel',
        name: 'Genel Tag Log',
        description: 'Sunucudaki üyelerin tag ekleme, kaldırma ve değiştirme bildirimleri bu kanala gönderilir.',
    },
    log: {
        key: 'logChannel', 
        name: 'Tag Rol Log',
        description: 'Tag değişikliğiyle verilen veya geri çekilen rollerin bildirimleri bu kanala gönderilir.',
    },
};

function readDB() {
    if (!fs.existsSync(DB_PATH)) return {};
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch (error) {
        console.error('🔴 [CLAN TAG ROL] Veritabanı okunamadı:', error);
        return {};
    }
}

function writeDB(data) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function guildConfig(guildId) {
    const data = readDB();
    const config = data[guildId] || {};
    return {
        tags: config.tags && typeof config.tags === 'object' ? config.tags : {},
        logChannel: config.logChannel || null,
        generalLogChannel: config.generalLogChannel || null,
    };
}

function updateGuildConfig(guildId, updater) {
    const data = readDB();
    if (!data[guildId]) data[guildId] = { tags: {}, logChannel: null, generalLogChannel: null };
    if (!data[guildId].tags || typeof data[guildId].tags !== 'object') data[guildId].tags = {};
    updater(data[guildId]);
    writeDB(data);
    return data[guildId];
}

function makeId(sessionId, action) {
    return `ctr:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
    const prefix = `ctr:${sessionId}:`;
    return customId?.startsWith(prefix) ? customId.slice(prefix.length) : null;
}

function safeCode(value) {
    return `\`${String(value).replace(/`/g, "'")}\``;
}

function tagSummary(tags) {
    const entries = Object.entries(tags);
    if (!entries.length) return '`Ayarlanmadı`';

    const visible = entries.slice(0, 12)
        .map(([tag, roleId]) => `${safeCode(tag)} ➜ <@&${roleId}>`)
        .join('\n');
    const remaining = entries.length - 12;
    return remaining > 0 ? `${visible}\n*...ve ${remaining} eşleşme daha*` : visible;
}

function settingSection(sessionId, action, line, label = 'Değiştir', danger = false, disabled = false) {
    return new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(line))
        .setButtonAccessory(
            new ButtonBuilder()
                .setCustomId(makeId(sessionId, action))
                .setLabel(label)
                .setStyle(danger ? ButtonStyle.Danger : ButtonStyle.Secondary)
                .setDisabled(disabled)
        );
}

function panelPayload(guildId, sessionId, disabled = false, ephemeral = true) {
    const config = guildConfig(guildId);
    const count = Object.keys(config.tags).length;
    const container = new ContainerBuilder()
        .setAccentColor(PANEL_ACCENT_COLOR)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '## Clan Tag-Rol Ayarları \nDüzenlemek istediğiniz ayarın yanındaki **Değiştir** butonuna tıklayın.'
            )
        )
        .addSectionComponents(
            settingSection(
                sessionId,
                'mappings',
                `🏷️ **Tag-Rol Eşleşmeleri (${count}):**\n${tagSummary(config.tags)}`,
                'Değiştir',
                false,
                disabled
            )
        )
        .addSectionComponents(
            ...Object.entries(LOG_SETTINGS).map(([action, setting]) => settingSection(
                sessionId,
                action,
                `${emojiler.hashtag} **${setting.name}:** ${config[setting.key] ? `<#${config[setting.key]}>` : '`Ayarlanmadı`'}`,
                'Değiştir',
                false,
                disabled
            ))
        )
        .addSectionComponents(
            settingSection(
                sessionId,
                'reset',
                `${emojiler.uyari} **Tüm Ayarlar:** Tag-rol eşleşmelerini ve iki log kanalını sıfırlar.`,
                'Sıfırla',
                true,
                disabled
            )
        );

    return {
        components: [container],
        flags: ephemeral ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
    };
}

function promptPayload(title, description, rows, error = false, ephemeral = true) {
    const container = new ContainerBuilder()
        .setAccentColor(error ? 0xed4245 : PANEL_ACCENT_COLOR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}\n${description}`));
    for (const row of rows) container.addActionRowComponents(row);
    return {
        components: [container],
        flags: ephemeral ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
    };
}

function noticePayload(title, description, error = false, ephemeral = true) {
    return promptPayload(title, description, [], error, ephemeral);
}

function mappingsPrompt(config, sessionId) {
    const rows = [
        new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
                .setCustomId(makeId(sessionId, 'role'))
                .setPlaceholder('Eklenecek veya güncellenecek rolü seç.')
                .setMinValues(1)
                .setMaxValues(1)
        ),
    ];
    const entries = Object.entries(config.tags).slice(0, 25);
    if (entries.length) {
        rows.push(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(makeId(sessionId, 'remove'))
                    .setPlaceholder('Silinecek tag-rol eşleşmesini seç.')
                    .addOptions(entries.map(([tag, roleId]) => ({
                        label: tag.slice(0, 100),
                        value: tag.slice(0, 100),
                        description: `Rol: ${roleId}`.slice(0, 100),
                    })))
            )
        );
    }
    rows.push(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(makeId(sessionId, 'removeByTag'))
                .setLabel('Tag Yazarak Sil')
                .setStyle(ButtonStyle.Danger)
        )
    );
    return promptPayload(
        'Tag-Rol Eşleşmelerini Yönet',
        'Ekleme veya güncelleme için önce bir **rol seçin**, ardından açılan forma clan tagını yazın. Silmek için alttaki listeden bir eşleşme seçin.',
        rows
    );
}

function tagModal(sessionId, roleId) {
    return new ModalBuilder()
        .setCustomId(makeId(sessionId, `tag:${roleId}`))
        .setTitle('Clan Tag Eşleşmesi')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('tag')
                    .setLabel('Clan tag')
                    .setPlaceholder('TKP')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(32)
            )
        );
}

function removeTagModal(sessionId) {
    return new ModalBuilder()
        .setCustomId(makeId(sessionId, 'removeTag'))
        .setTitle('Clan Tag Eşleşmesini Sil')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('tag')
                    .setLabel('Silinecek clan tag')
                    .setPlaceholder('TKP')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(32)
            )
        );
}

function logPrompt(sessionId, action) {
    const setting = LOG_SETTINGS[action];
    return promptPayload(
        setting.name,
        `${setting.description}\nYeni log kanalını seçebilir veya mevcut ayarı sıfırlayabilirsiniz.`,
        [
            new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId(makeId(sessionId, `${action}Select`))
                    .setPlaceholder(`${setting.name} kanalını seç.`)
                    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                    .setMinValues(1)
                    .setMaxValues(1)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(makeId(sessionId, `${action}Clear`))
                    .setLabel(`${setting.name} Sıfırla`)
                    .setStyle(ButtonStyle.Secondary)
            ),
        ]
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clan-tag-rol')
        .setDescription('Clan Tag-Rol sistemini panelden ayarlar.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client) {
        const botClient = client || interaction.client;
        const { guildId, user } = interaction;
        const sessionId = interaction.id;

        await interaction.reply(panelPayload(guildId, sessionId));

        let closed = false;
        const refreshPanel = () => interaction.editReply(panelPayload(guildId, sessionId, false, false)).catch(() => null);
        const listener = async componentInteraction => {
            const action = parseAction(componentInteraction.customId, sessionId);
            if (!action || closed) return;

            if (componentInteraction.user.id !== user.id) {
                return componentInteraction.reply(
                    noticePayload('Bu panel sana ait değil', `${emojiler.uyari} Bu paneli sadece komutu kullanan kişi düzenleyebilir.`, true)
                ).catch(() => null);
            }

            try {
                if (componentInteraction.isButton()) {
                    if (action === 'mappings') {
                        return componentInteraction.reply(mappingsPrompt(guildConfig(guildId), sessionId));
                    }
                    if (action === 'removeByTag') return componentInteraction.showModal(removeTagModal(sessionId));
                    if (Object.hasOwn(LOG_SETTINGS, action)) return componentInteraction.reply(logPrompt(sessionId, action));
                    const clearSetting = Object.entries(LOG_SETTINGS).find(([key]) => action === `${key}Clear`)?.[1];
                    if (clearSetting) {
                        updateGuildConfig(guildId, config => { config[clearSetting.key] = null; });
                        await componentInteraction.update(noticePayload(`${clearSetting.name} sıfırlandı`, `${emojiler.tik} **${clearSetting.name}** ayarı **sıfırlandı**.`, false, false));
                        return refreshPanel();
                    }
                    if (action === 'reset') {
                        updateGuildConfig(guildId, config => {
                            config.tags = {};
                            config.logChannel = null;
                            config.generalLogChannel = null;
                        });
                        await componentInteraction.update(panelPayload(guildId, sessionId, false, false));
                        return componentInteraction.followUp(
                            noticePayload('Tüm ayarlar sıfırlandı', `${emojiler.tik} Tag-rol eşleşmeleri ve iki log kanalı **sıfırlandı**.`)
                        );
                    }
                }

                if (componentInteraction.isRoleSelectMenu() && action === 'role') {
                    return componentInteraction.showModal(tagModal(sessionId, componentInteraction.values[0]));
                }

                if (componentInteraction.isStringSelectMenu() && action === 'remove') {
                    const tag = componentInteraction.values[0];
                    const config = guildConfig(guildId);
                    const roleId = config.tags[tag];
                    if (!roleId) return componentInteraction.update(noticePayload('Eşleşme bulunamadı', `${safeCode(tag)} artık kayıtlı değil.`, true, false));

                    updateGuildConfig(guildId, current => { delete current.tags[tag]; });
                    await componentInteraction.update(noticePayload('Eşleşme silindi', `${emojiler.tik} ${safeCode(tag)} ➜ <@&${roleId}> eşleşmesi **silindi**.`, false, false));
                    return refreshPanel();
                }

                const selectSetting = Object.entries(LOG_SETTINGS).find(([key]) => action === `${key}Select`)?.[1];
                if (componentInteraction.isChannelSelectMenu() && selectSetting) {
                    const channelId = componentInteraction.values[0];
                    updateGuildConfig(guildId, config => { config[selectSetting.key] = channelId; });
                    await componentInteraction.update(noticePayload(`${selectSetting.name} güncellendi`, `${emojiler.tik} **${selectSetting.name}** kanalı <#${channelId}> olarak **güncellendi**.`, false, false));
                    return refreshPanel();
                }

                if (componentInteraction.isModalSubmit() && action.startsWith('tag:')) {
                    await componentInteraction.deferReply({ flags: MessageFlags.Ephemeral });
                    const roleId = action.slice('tag:'.length);
                    const tag = componentInteraction.fields.getTextInputValue('tag').trim().toUpperCase();
                    if (!tag) return componentInteraction.editReply(noticePayload('Geçersiz tag', `${emojiler.uyari} Clan tag boş olamaz.`, true, false));

                    updateGuildConfig(guildId, config => { config.tags[tag] = roleId; });
                    await componentInteraction.editReply(noticePayload('Eşleşme kaydedildi', `${emojiler.tik} ${safeCode(tag)} ➜ <@&${roleId}> eşleşmesi **kaydedildi**.`, false, false));
                    return refreshPanel();
                }

                if (componentInteraction.isModalSubmit() && action === 'removeTag') {
                    await componentInteraction.deferReply({ flags: MessageFlags.Ephemeral });
                    const tag = componentInteraction.fields.getTextInputValue('tag').trim().toUpperCase();
                    const config = guildConfig(guildId);
                    const roleId = config.tags[tag];
                    if (!roleId) {
                        return componentInteraction.editReply(noticePayload('Eşleşme bulunamadı', `${safeCode(tag)} kayıtlı değil.`, true, false));
                    }

                    updateGuildConfig(guildId, current => { delete current.tags[tag]; });
                    await componentInteraction.editReply(noticePayload('Eşleşme silindi', `${emojiler.tik} ${safeCode(tag)} ➜ <@&${roleId}> eşleşmesi **silindi**.`, false, false));
                    return refreshPanel();
                }
            } catch (error) {
                console.error('🔴 [CLAN TAG ROL PANEL HATASI]', error);
                const payload = noticePayload('İşlem başarısız', `${emojiler.uyari} Ayar güncellenirken bir hata oluştu.`, true);
                if (componentInteraction.deferred && !componentInteraction.replied) {
                    return componentInteraction.editReply(payload).catch(() => null);
                }
                if (componentInteraction.replied) {
                    return componentInteraction.followUp(payload).catch(() => null);
                }
                return componentInteraction.reply(payload).catch(() => null);
            }
        };

        botClient.on('interactionCreate', listener);
        setTimeout(async () => {
            closed = true;
            botClient.off('interactionCreate', listener);
            await interaction.editReply(panelPayload(guildId, sessionId, true, false)).catch(() => null);
        }, SESSION_TTL);
    },
};
