'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ContainerBuilder, SectionBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const emojiler = require('../../Utils/Emojis/emojiler.js');

const PANEL_ACCENT_COLOR = 0xc9a76a;
const PANEL_REPLY_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PANEL_UPDATE_FLAGS = MessageFlags.IsComponentsV2;
const SESSION_TTL = 5 * 60_000;

const { guildConfig, updateGuildConfig } = require("../../Dashboard/stores/durumRol");

function makeId(sessionId, action) {
    return `drr:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
    const prefix = `drr:${sessionId}:`;
    return customId?.startsWith(prefix) ? customId.slice(prefix.length) : null;
}

function safeCode(value) {
    return `\`${String(value).replace(/`/g, "'")}\``;
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
    const container = new ContainerBuilder()
        .setAccentColor(PANEL_ACCENT_COLOR)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '## Durum Rol Ayarları \nDüzenlemek istediğiniz ayarın yanındaki **Değiştir** butonuna tıklayın.'
            )
        )
        .addSectionComponents(
            settingSection(
                sessionId,
                'tag',
                `🏷️ **Durum Tagı:** ${config.tag ? safeCode(config.tag) : '`Ayarlanmadı`'}`,
                'Değiştir',
                false,
                disabled
            )
        )
        .addSectionComponents(
            settingSection(
                sessionId,
                'role',
                `${emojiler.ampul} **Verilecek Rol:** ${config.rolId ? `<@&${config.rolId}>` : '`Ayarlanmadı`'}`,
                'Değiştir',
                false,
                disabled
            )
        )
        .addSectionComponents(
            settingSection(
                sessionId,
                'log',
                `${emojiler.hashtag} **Log Kanalı:** ${config.logId ? `<#${config.logId}>` : '`Ayarlanmadı`'}`,
                'Değiştir',
                false,
                disabled
            )
        )
        .addSectionComponents(
            settingSection(
                sessionId,
                'reset',
                `${emojiler.uyari} **Tüm Ayarlar:** Durum tagını, rolü ve log kanalını sıfırlar.`,
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

function tagModal(sessionId, currentTag) {
    const input = new TextInputBuilder()
        .setCustomId('tag')
        .setLabel('Durum tagı')
        .setPlaceholder('Durumda aranacak kelime veya tag')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(64);
    if (currentTag) input.setValue(currentTag.slice(0, 64));

    return new ModalBuilder()
        .setCustomId(makeId(sessionId, 'tagSubmit'))
        .setTitle('Durum Tagını Değiştir')
        .addComponents(new ActionRowBuilder().addComponents(input));
}

function rolePrompt(sessionId) {
    return promptPayload(
        'Durum Rolü',
        'Durum tagını taşıyan üyelere verilecek rolü seçin.',
        [
            new ActionRowBuilder().addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId(makeId(sessionId, 'roleSelect'))
                    .setPlaceholder('Verilecek rolü seç.')
                    .setMinValues(1)
                    .setMaxValues(1)
            ),
        ]
    );
}

function logPrompt(sessionId) {
    return promptPayload(
        'Log Kanalı',
        'Durum rolü değişikliklerinin gönderileceği kanalı seçin.',
        [
            new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId(makeId(sessionId, 'logSelect'))
                    .setPlaceholder('Log kanalı seç.')
                    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                    .setMinValues(1)
                    .setMaxValues(1)
            ),
        ]
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('durum-rol')
        .setDescription('Durum rol sistemini ayarlar.')
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
                    if (action === 'tag') {
                        return componentInteraction.showModal(tagModal(sessionId, guildConfig(guildId).tag));
                    }
                    if (action === 'role') return componentInteraction.reply(rolePrompt(sessionId));
                    if (action === 'log') return componentInteraction.reply(logPrompt(sessionId));
                    if (action === 'reset') {
                        updateGuildConfig(guildId, config => {
                            delete config.tag;
                            delete config.rolId;
                            delete config.logId;
                        });
                        await componentInteraction.update(panelPayload(guildId, sessionId, false, false));
                        return componentInteraction.followUp(
                            noticePayload('Tüm ayarlar sıfırlandı', `${emojiler.tik} Durum tagı, rol ve log kanalı **sıfırlandı**.`)
                        );
                    }
                }

                if (componentInteraction.isRoleSelectMenu() && action === 'roleSelect') {
                    const roleId = componentInteraction.values[0];
                    updateGuildConfig(guildId, config => { config.rolId = roleId; });
                    await componentInteraction.update(noticePayload('Rol güncellendi', `${emojiler.tik} Durum rolü <@&${roleId}> olarak **güncellendi**.`, false, false));
                    return refreshPanel();
                }

                if (componentInteraction.isChannelSelectMenu() && action === 'logSelect') {
                    const channelId = componentInteraction.values[0];
                    updateGuildConfig(guildId, config => { config.logId = channelId; });
                    await componentInteraction.update(noticePayload('Log kanalı güncellendi', `${emojiler.tik} Log kanalı <#${channelId}> olarak **güncellendi**.`, false, false));
                    return refreshPanel();
                }

                if (componentInteraction.isModalSubmit() && action === 'tagSubmit') {
                    await componentInteraction.deferReply({ flags: MessageFlags.Ephemeral });
                    const tag = componentInteraction.fields.getTextInputValue('tag').trim();
                    if (!tag) {
                        return componentInteraction.editReply(
                            noticePayload('Geçersiz tag', `${emojiler.uyari} Durum tagı boş olamaz.`, true, false)
                        );
                    }

                    updateGuildConfig(guildId, config => { config.tag = tag; });
                    await componentInteraction.editReply(
                        noticePayload('Durum tagı güncellendi', `${emojiler.tik} Durum tagı ${safeCode(tag)} olarak **güncellendi**.`, false, false)
                    );
                    return refreshPanel();
                }
            } catch (error) {
                console.error('🔴 [DURUM ROL PANEL HATASI]', error);
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