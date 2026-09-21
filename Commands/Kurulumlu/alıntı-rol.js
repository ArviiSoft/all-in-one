const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { getChannelSetting, getGuildSettings, removeChannelSetting, saveChannelSetting } = require("../../Utils/Moderation/alintiRolStore");

const controlIds = {
  channel: "alinti_rol:kanal",
  accountType: "alinti_rol:hesap_turu",
  roles: "alinti_rol:roller",
  reset: "alinti_rol:sifirla"
};

const accountTypeOptions = [
  {
    label: "Kullanıcı Hesapları",
    value: "users",
    emoji: "👤",
    description: "Yalnızca kullanıcıların mesajlarına rol etiketiyle cevap verir."
  },
  {
    label: "Bot ve Webhook Mesajları",
    value: "bots",
    emoji: "🤖",
    description: "Yalnızca bot ve webhook mesajlarına rol etiketiyle cevap verir."
  },
  {
    label: "Tüm Mesajlar",
    value: "both",
    emoji: "👥",
    description: "Kullanıcı, bot ve webhook mesajlarına cevap verir."
  }
];

function getAccountTypeLabel(accountType) {
  return accountTypeOptions.find(option => option.value === accountType)?.label || "Kullanıcı Hesapları";
}

function buildRows({ selectedChannelId, draft, hasSavedSetting, disabled = false }) {
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(controlIds.channel)
    .setPlaceholder("Rol etiketlenecek metin kanalını seçin...")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);

  if (selectedChannelId) channelSelect.setDefaultChannels(selectedChannelId);

  const accountTypeSelect = new StringSelectMenuBuilder()
    .setCustomId(controlIds.accountType)
    .setPlaceholder("Mesajları izlenecek hesap türünü seçin...")
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled || !selectedChannelId)
    .addOptions(accountTypeOptions.map(option => ({
      ...option,
      default: Boolean(selectedChannelId && option.value === draft.accountType)
    })));

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(controlIds.roles)
    .setPlaceholder("Etiketlenecek rolleri seçin (en fazla 10)...")
    .setMinValues(1)
    .setMaxValues(10)
    .setDisabled(disabled || !selectedChannelId);

  if (draft.roleIds.length > 0) roleSelect.setDefaultRoles(...draft.roleIds);

  const resetButton = new ButtonBuilder()
    .setCustomId(controlIds.reset)
    .setLabel("Sıfırla")
    .setEmoji(`${emojiler.cop}`)
    .setStyle(ButtonStyle.Danger)
    .setDisabled(disabled || !selectedChannelId || !hasSavedSetting);

  return [
    new ActionRowBuilder().addComponents(channelSelect),
    new ActionRowBuilder().addComponents(accountTypeSelect),
    new ActionRowBuilder().addComponents(roleSelect),
    new ActionRowBuilder().addComponents(resetButton)
  ];
}

function formatConfiguredChannels(guild, guildSettings) {
  const configured = Object.keys(guildSettings)
    .map(channelId => guild.channels.cache.get(channelId))
    .filter(Boolean);

  if (configured.length === 0) return "Yok";
  const visible = configured.slice(0, 15).map(channel => `${channel}`);
  if (configured.length > visible.length) visible.push(`ve ${configured.length - visible.length} kanal daha`);
  return visible.join(", ");
}

function buildPanelPayload(guild, selectedChannelId, draft, notice = null, disabled = false) {
  const guildSettings = getGuildSettings(guild.id);
  const selectedChannel = selectedChannelId ? guild.channels.cache.get(selectedChannelId) : null;
  const hasSavedSetting = Boolean(selectedChannelId && guildSettings[selectedChannelId]);
  const roles = draft.roleIds
    .map(roleId => guild.roles.cache.get(roleId))
    .filter(Boolean);

  const status = [
    `**${emojiler.hashtag} Ayarlı kanallar:** ${formatConfiguredChannels(guild, guildSettings)}`,
    `**${emojiler.hashtag} Seçili kanal:** ${selectedChannel || "Seçilmedi"}`,
    `**👥 Hesap türü:** ${selectedChannelId ? getAccountTypeLabel(draft.accountType) : "Seçilmedi"}`,
    `**${emojiler.ampul} Roller (${roles.length}/10):** ${roles.length ? roles.join(", ") : "Seçilmedi"}`
  ];

  if (notice) status.push("", notice);

  return {
    embeds: [
      new EmbedBuilder()
        .setColor("Blurple")
        .setTitle("Alıntı Rol")
        .setDescription([
          "- Kanalı, hesap türünü ve rolleri aşağıdan seçin, tamamlanan seçimler doğrudan uygulanır.",
          "- Seçilen hesap türü kanala mesaj yazdığında bot, mesaja yanıt vererek ayarlı rolleri etiketler.",
          "- Bir kanala en fazla **10 rol** ayarlanabilir. Ayarı kaldırmak için **Sıfırla** butonunu kullanın.",
          "",
          ...status
        ].join("\n"))
    ],
    components: buildRows({ selectedChannelId, draft, hasSavedSetting, disabled })
  };
}

async function replyWithError(component, error) {
  console.error("🔴 [ALINTI ROL] Panel etkileşimi işlenemedi:", error);
  const payload = { content: `${emojiler.uyari} **İşlem sırasında hata oluştu.**`, flags: MessageFlags.Ephemeral };
  if (component.replied || component.deferred) return component.followUp(payload).catch(() => null);
  return component.reply(payload).catch(() => null);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("alıntı-rol")
    .setDescription("Mesajlara yanıt vererek rol etiketleme sistemini yönetir.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guild = interaction.guild;
    let selectedChannelId = null;
    let draft = { accountType: "users", roleIds: [] };

    const response = await interaction.reply({
      ...buildPanelPayload(guild, selectedChannelId, draft),
      flags: MessageFlags.Ephemeral,
      withResponse: true
    });
    const message = response.resource?.message || await interaction.fetchReply().catch(() => null);
    if (!message) return;

    const collector = message.createMessageComponentCollector({ time: 10 * 60 * 1000 });

    collector.on("collect", async component => {
      try {
        if (component.user.id !== interaction.user.id) {
          return await component.reply({
            content: `${emojiler.uyari} **Bu paneli yalnızca komutu kullanan kişi yönetebilir.**`,
            flags: MessageFlags.Ephemeral
          });
        }

        if (component.customId === controlIds.channel && component.isChannelSelectMenu()) {
          await component.deferUpdate();
          selectedChannelId = component.values[0];
          const savedSetting = getChannelSetting(guild.id, selectedChannelId);
          draft = savedSetting
            ? { accountType: savedSetting.accountType, roleIds: [...savedSetting.roleIds] }
            : { accountType: "users", roleIds: [] };

          const notice = savedSetting
            ? `${emojiler.tik} Kayıtlı kanal ayarı yüklendi.`
            : `${emojiler.sadesagok} Hesap türünü ve etiketlenecek rolleri seçin.`;
          return await interaction.editReply(buildPanelPayload(guild, selectedChannelId, draft, notice));
        }

        if (component.customId === controlIds.accountType && component.isStringSelectMenu()) {
          if (!selectedChannelId) {
            return await component.reply({ content: `${emojiler.uyari} **Önce bir kanal seçin.**`, flags: MessageFlags.Ephemeral });
          }

          await component.deferUpdate();
          draft.accountType = component.values[0];
          let notice = `${emojiler.sadesagok} Hesap türü seçildi; ayarın tamamlanması için rol seçin.`;
          if (draft.roleIds.length > 0) {
            saveChannelSetting(guild.id, selectedChannelId, draft);
            notice = `${emojiler.tik} Hesap türü **${getAccountTypeLabel(draft.accountType)}** olarak güncellendi.`;
          }
          return await interaction.editReply(buildPanelPayload(guild, selectedChannelId, draft, notice));
        }

        if (component.customId === controlIds.roles && component.isRoleSelectMenu()) {
          if (!selectedChannelId) {
            return await component.reply({ content: `${emojiler.uyari} **Önce bir kanal seçin.**`, flags: MessageFlags.Ephemeral });
          }

          await component.deferUpdate();
          draft.roleIds = component.values.slice(0, 10);
          saveChannelSetting(guild.id, selectedChannelId, draft);
          return await interaction.editReply(buildPanelPayload(
            guild,
            selectedChannelId,
            draft,
            `${emojiler.tik} **${draft.roleIds.length} rol** için alıntı rol ayarı uygulandı.`
          ));
        }

        if (component.customId === controlIds.reset && component.isButton()) {
          if (!selectedChannelId) {
            return await component.reply({ content: `${emojiler.uyari} **Önce bir kanal seçin.**`, flags: MessageFlags.Ephemeral });
          }

          await component.deferUpdate();
          removeChannelSetting(guild.id, selectedChannelId);
          draft = { accountType: "users", roleIds: [] };
          return await interaction.editReply(buildPanelPayload(
            guild,
            selectedChannelId,
            draft,
            `${emojiler.tik} Bu kanaldaki alıntı rol ayarı **sıfırlandı.**`
          ));
        }
      } catch (error) {
        return await replyWithError(component, error);
      }
    });

    collector.on("end", () => {
      interaction.editReply(
        buildPanelPayload(guild, selectedChannelId, draft, `${emojiler.saat} Panelin süresi doldu.`, true)
      ).catch(() => null);
    });
  }
};
