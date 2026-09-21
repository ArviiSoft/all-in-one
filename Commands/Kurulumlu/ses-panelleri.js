const { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, StringSelectMenuBuilder, ChannelSelectMenuBuilder, LabelBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder } = require("discord.js");
const fs = require("../../Utils/Core/databaseFs");
const path = require("path");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { updateClockChannel } = require("../../Utils/Voice/sesPanelClock");

const dataPath = path.join(__dirname, "../../Database/Ses Sistemleri/sesPanelleri.json");
const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const controlIds = {
  panelSelect: "ses_panelleri:panel_sec",
  calendarSelect: "ses_panelleri:takvim_sec",
  clockSelect: "ses_panelleri:saat_sec",
  update: "ses_panelleri:verileri_guncelle",
  reset: "ses_panelleri:sifirla"
};

const panelDefinitions = [
  {
    value: "uye",
    dataKey: "uyeKanalId",
    label: "Üye Sayacı",
    emoji: "👤",
    channelName: guild => `👤・Üyeler · ${guild.memberCount}`
  },
  {
    value: "aktif",
    dataKey: "aktifUyeKanalId",
    label: "Çevrimiçi",
    emoji: "🟩",
    channelName: guild => {
      const count = guild.members.cache.filter(member => member.presence && member.presence.status !== "offline").size;
      return `🟩・Çevrimiçi · ${count}`;
    }
  },
  {
    value: "sesteki",
    dataKey: "sestekiUyeKanalId",
    label: "Sesteki Üyeler Sayacı",
    emoji: "🔊",
    channelName: guild => {
      const count = guild.members.cache.filter(member => member.voice.channel).size;
      return `🔊・Sesteki Üyeler · ${count}`;
    }
  },
  {
    value: "rekor",
    dataKey: "rekorKanalId",
    label: "Rekor Çevrimiçi Sayacı",
    emoji: "🏆",
    channelName: (guild, guildData) => {
      const online = guild.members.cache.filter(member => member.presence && member.presence.status !== "offline").size;
      if (!Number.isFinite(guildData.rekorSayi) || online > guildData.rekorSayi) guildData.rekorSayi = online;
      return `🏆・Rekor Çevrimiçi · ${online} / ${guildData.rekorSayi}`;
    }
  },
  {
    value: "durum",
    dataKey: "durumKanalId",
    label: "Durum Sayacı",
    emoji: "🟢",
    channelName: guild => {
      const online = guild.members.cache.filter(member => member.presence?.status === "online").size;
      const dnd = guild.members.cache.filter(member => member.presence?.status === "dnd").size;
      const idle = guild.members.cache.filter(member => member.presence?.status === "idle").size;
      return `🟢・${online} | 🔴・${dnd} | 🟡・${idle}`;
    }
  }
];

function readData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

function writeData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

function getDateChannelName() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `🗓️・Tarih · ${values.day} ${aylar[Number(values.month) - 1]} ${values.year}`;
}

function hasPanelConfiguration(guildData) {
  return Boolean(guildData?.takvimKanalId || guildData?.saatKanalId || panelDefinitions.some(panel => guildData?.[panel.dataKey]));
}

function saveGuildData(data, guildId, guildData) {
  if (hasPanelConfiguration(guildData)) data[guildId] = guildData;
  else delete data[guildId];
  writeData(data);
}

function buildControlRows(guild, guildData = {}, disabled = false) {
  const panelSelect = new StringSelectMenuBuilder()
    .setCustomId(controlIds.panelSelect)
    .setPlaceholder("Oluşturulacak sayaçları seçin...")
    .setMinValues(1)
    .setMaxValues(panelDefinitions.length)
    .setDisabled(disabled)
    .addOptions(panelDefinitions.map(panel => ({
      label: panel.label,
      value: panel.value,
      emoji: panel.emoji,
      description: guildData[panel.dataKey] ? "Ayarlı" : "Oluşturmak için seçin",
      default: Boolean(guildData[panel.dataKey])
    })));

  const calendarSelect = new ChannelSelectMenuBuilder()
    .setCustomId(controlIds.calendarSelect)
    .setPlaceholder("Takvim olarak kullanılacak ses kanalını seçin...")
    .setChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);

  const currentCalendar = guild.channels.cache.get(guildData.takvimKanalId);
  if (currentCalendar?.isVoiceBased()) calendarSelect.setDefaultChannels(currentCalendar.id);

  const clockSelect = new ChannelSelectMenuBuilder()
    .setCustomId(controlIds.clockSelect)
    .setPlaceholder("Saat olarak kullanılacak ses kanalını seçin...")
    .setChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);

  const currentClock = guild.channels.cache.get(guildData.saatKanalId);
  if (currentClock?.isVoiceBased()) clockSelect.setDefaultChannels(currentClock.id);

  const hasConfiguration = hasPanelConfiguration(guildData);
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(controlIds.update)
      .setLabel("Verileri Güncelle")
      .setEmoji(`${emojiler.yukleniyor}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || !hasConfiguration),
    new ButtonBuilder()
      .setCustomId(controlIds.reset)
      .setLabel("Sıfırla")
      .setEmoji(`${emojiler.cop}`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled || !hasConfiguration)
  );

  return [
    new ActionRowBuilder().addComponents(panelSelect),
    new ActionRowBuilder().addComponents(calendarSelect),
    new ActionRowBuilder().addComponents(clockSelect),
    buttonRow
  ];
}

function buildControlPayload(guild, guildData = {}, disabled = false) {
  const configuredPanels = panelDefinitions
    .filter(panel => guildData[panel.dataKey])
    .map(panel => `${panel.emoji} ${panel.label}`);
  const calendarChannel = guild.channels.cache.get(guildData.takvimKanalId);
  const clockChannel = guild.channels.cache.get(guildData.saatKanalId);
  const status = [
    configuredPanels.length
      ? `**${emojiler.donensaat} Ayarlı sayaçlar:** ${configuredPanels.join(", ")}`
      : `${emojiler.donensaat} **Ayarlı sayaçlar:** Yok`,
    `**${emojiler.Takvim}  Takvim kanalı:** ${calendarChannel || "Ayarlı değil"}`,
    `**🕒 Saat kanalı:** ${clockChannel || "Ayarlı değil"}`
  ].join("\n");

  return {
    embeds: [
      new EmbedBuilder()
        .setColor("Blurple")
        .setTitle("Ses Panelleri")
        .setDescription([
          "- Sadece oluşturmak istediğiniz sayaçları seçin, seçim doğrudan uygulanır.",
          `-# ${emojiler.info} **__Takvim ve saat için ayrı ses kanalları seçmek isteğe bağlıdır.__**`,
          "-# 🕒 Saat kanalı Türkiye saatine göre her dakika güncellenir.",
          "",
          status
        ].join("\n"))
    ],
    components: buildControlRows(guild, guildData, disabled)
  };
}

function buildResetModal(interaction, guildData) {
  const options = panelDefinitions
    .filter(panel => guildData[panel.dataKey])
    .map(panel => {
      const channel = interaction.guild.channels.cache.get(guildData[panel.dataKey]);
      return {
        label: (channel?.name || panel.label).slice(0, 100),
        value: panel.value,
        emoji: panel.emoji,
        description: `${panel.label} kanalını siler ve ayarını temizler.`.slice(0, 100)
      };
    });

  if (guildData.takvimKanalId) {
    const calendarChannel = interaction.guild.channels.cache.get(guildData.takvimKanalId);
    options.push({
      label: (calendarChannel?.name || "Takvim Kanalı").slice(0, 100),
      value: "takvim",
      emoji: "🗓️",
      description: "Takvim ayarını temizler, seçili ses kanalını silmez."
    });
  }

  if (guildData.saatKanalId) {
    const clockChannel = interaction.guild.channels.cache.get(guildData.saatKanalId);
    options.push({
      label: (clockChannel?.name || "Saat Kanalı").slice(0, 100),
      value: "saat",
      emoji: "🕒",
      description: "Saat ayarını temizler, seçili ses kanalını silmez."
    });
  }

  return new ModalBuilder()
    .setCustomId(`ses_panelleri_sifirla:${interaction.id}`)
    .setTitle("Ses Panellerini Sıfırla")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Sıfırlanacak kanallar")
        .setDescription("Bir veya birden fazla kayıtlı kanal seçebilirsiniz.")
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId("sifirlanacak_paneller")
            .setPlaceholder("Sıfırlanacak kanalları seçin...")
            .setRequired(true)
            .setMinValues(1)
            .setMaxValues(options.length)
            .addOptions(options)
        )
    );
}

async function createSelectedPanels(guild, selectedValues) {
  const selected = new Set(selectedValues);
  const data = readData();
  const guildData = data[guild.id] || {};
  const created = [];
  const alreadyConfigured = [];
  const failed = [];

  for (const panel of panelDefinitions.filter(item => selected.has(item.value))) {
    const currentChannel = guild.channels.cache.get(guildData[panel.dataKey]);
    if (currentChannel) {
      alreadyConfigured.push(panel.label);
      continue;
    }

    if (guildData[panel.dataKey]) delete guildData[panel.dataKey];
    if (panel.value === "rekor") delete guildData.rekorSayi;

    try {
      const channel = await guild.channels.create({
        name: panel.channelName(guild, guildData),
        type: ChannelType.GuildVoice,
        permissionOverwrites: [{ id: guild.roles.everyone, deny: ["Connect"] }]
      });
      guildData[panel.dataKey] = channel.id;
      created.push(`${panel.emoji} ${panel.label}`);
    } catch (error) {
      failed.push(panel.label);
      console.error(`🔴 [SES PANELLERİ] ${panel.label} oluşturulamadı:`, error);
    }
  }

  if (guildData.aktifUyeKanalId && guildData.sestekiUyeKanalId) {
    const activeChannel = guild.channels.cache.get(guildData.aktifUyeKanalId);
    const voiceChannel = guild.channels.cache.get(guildData.sestekiUyeKanalId);
    if (activeChannel && voiceChannel) await voiceChannel.setPosition(activeChannel.position + 1).catch(() => {});
  }

  saveGuildData(data, guild.id, guildData);
  return { guildData, created, alreadyConfigured, failed };
}

async function configureDisplayChannel(guild, channelId, isClock = false) {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  const data = readData();
  const guildData = data[guild.id] || {};
  const managedChannelIds = new Set(panelDefinitions.map(panel => guildData[panel.dataKey]).filter(Boolean));
  managedChannelIds.add(isClock ? guildData.takvimKanalId : guildData.saatKanalId);
  if (managedChannelIds.has(channelId)) return { guildData, conflict: true };

  if (!channel?.isVoiceBased()) return { guildData, missing: true };

  guildData[isClock ? "saatKanalId" : "takvimKanalId"] = channel.id;
  saveGuildData(data, guild.id, guildData);
  let renameFailed = false;
  await (isClock ? updateClockChannel(channel) : channel.setName(getDateChannelName())).catch(error => {
    renameFailed = true;
    console.error(`🔴 [SES PANELLERİ] ${isClock ? "Saat" : "Takvim"} kanalı güncellenemedi:`, error);
  });
  return { guildData: readData()[guild.id] || {}, channel, renameFailed };
}

async function updateConfiguredPanels(guild) {
  const data = readData();
  const guildData = data[guild.id];
  if (!hasPanelConfiguration(guildData)) return { guildData: {}, empty: true };

  const updated = [];
  const failed = [];
  for (const panel of panelDefinitions) {
    if (!guildData[panel.dataKey]) continue;
    const channel = await guild.channels.fetch(guildData[panel.dataKey]).catch(() => null);
    if (!channel) {
      failed.push(panel.label);
      continue;
    }
    try {
      await channel.setName(panel.channelName(guild, guildData));
      updated.push(panel.label);
    } catch (error) {
      failed.push(panel.label);
      console.error(`🔴 [SES PANELLERİ] ${panel.label} güncellenemedi:`, error);
    }
  }

  if (guildData.takvimKanalId) {
    const calendarChannel = await guild.channels.fetch(guildData.takvimKanalId).catch(() => null);
    if (calendarChannel) {
      try {
        await calendarChannel.setName(getDateChannelName());
        updated.push("Takvim Kanalı");
      } catch (error) {
        failed.push("Takvim Kanalı");
        console.error("🔴 [SES PANELLERİ] Takvim kanalı güncellenemedi:", error);
      }
    } else {
      failed.push("Takvim Kanalı");
    }
  }

  if (guildData.saatKanalId) {
    const clockChannel = await guild.channels.fetch(guildData.saatKanalId).catch(() => null);
    if (clockChannel?.isVoiceBased()) {
      try {
        await updateClockChannel(clockChannel);
        updated.push("Saat Kanalı");
      } catch (error) {
        failed.push("Saat Kanalı");
        console.error("🔴 [SES PANELLERİ] Saat kanalı güncellenemedi:", error);
      }
    } else {
      failed.push("Saat Kanalı");
    }
  }

  const latestData = readData();
  const latestGuildData = latestData[guild.id] || {};
  if (latestGuildData.rekorKanalId && latestGuildData.rekorKanalId === guildData.rekorKanalId
    && Number.isFinite(guildData.rekorSayi)
    && (!Number.isFinite(latestGuildData.rekorSayi) || guildData.rekorSayi > latestGuildData.rekorSayi)) {
    latestGuildData.rekorSayi = guildData.rekorSayi;
    writeData(latestData);
  }
  return { guildData: latestGuildData, updated, failed };
}

async function resetSelectedPanels(guild, selectedValues) {
  const selected = new Set(selectedValues);
  const data = readData();
  const guildData = data[guild.id] || {};
  const reset = [];
  const failed = [];

  for (const panel of panelDefinitions.filter(item => selected.has(item.value))) {
    const channelId = guildData[panel.dataKey];
    if (!channelId) continue;

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel) {
      try {
        await channel.delete();
      } catch (error) {
        failed.push(panel.label);
        console.error(`🔴 [SES PANELLERİ] ${panel.label} silinemedi:`, error);
        continue;
      }
    }

    delete guildData[panel.dataKey];
    if (panel.value === "rekor") delete guildData.rekorSayi;
    reset.push(`${panel.emoji} ${panel.label}`);
  }

  if (selected.has("takvim") && guildData.takvimKanalId) {
    delete guildData.takvimKanalId;
    reset.push("🗓️ Takvim Kanalı (kanal silinmedi)");
  }

  if (selected.has("saat") && guildData.saatKanalId) {
    delete guildData.saatKanalId;
    reset.push("🕒 Saat Kanalı (kanal silinmedi)");
  }

  saveGuildData(data, guild.id, guildData);
  return { guildData, reset, failed };
}

function resultEmbed(color, lines) {
  return new EmbedBuilder().setColor(color).setDescription(lines.join("\n\n"));
}

async function replyWithComponentError(component, error) {
  console.error("🔴 [SES PANELLERİ] Panel etkileşimi işlenemedi:", error);
  const payload = { content: `${emojiler.uyari} **İşlem sırasında hata oluştu.**` };
  if (component.deferred) return component.editReply(payload).catch(() => null);
  if (component.replied) return component.followUp({ ...payload, flags: 64 }).catch(() => null);
  return component.reply({ ...payload, flags: 64 }).catch(() => null);
}

module.exports = {
  panelDefinitions,
  getDateChannelName,
  data: new SlashCommandBuilder()
    .setName("ses-panelleri")
    .setDescription("Sunucu sayaç panellerini yönetir.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guild = interaction.guild;
    const initialData = readData();
    const response = await interaction.reply({
      ...buildControlPayload(guild, initialData[guild.id] || {}),
      flags: 64,
      withResponse: true
    });
    const message = response.resource?.message;
    if (!message) return;

    const collector = message.createMessageComponentCollector({ time: 10 * 60 * 1000 });

    collector.on("collect", async component => {
      if (component.user.id !== interaction.user.id) {
        return component.reply({ content: `${emojiler.uyari} **Bu paneli yalnızca komutu kullanan kişi yönetebilir.**`, flags: 64 });
      }

      try {
        if (component.customId === controlIds.panelSelect && component.isStringSelectMenu()) {
          await component.deferReply({ flags: 64 });
          const result = await createSelectedPanels(guild, component.values);
          await message.edit(buildControlPayload(guild, result.guildData)).catch(() => {});

          const lines = [];
          if (result.created.length) lines.push(`${emojiler.hashtag} **Oluşturulan kanallar:**\n${result.created.map(item => `- ${item}`).join("\n")}`);
          if (result.alreadyConfigured.length) lines.push(`${emojiler.uyari} **Zaten ayarlı:** ${result.alreadyConfigured.join(", ")}`);
          if (result.failed.length) lines.push(`${emojiler.uyari} **Oluşturulamayanlar:** ${result.failed.join(", ")}`);
          if (!lines.length) lines.push(`${emojiler.uyari} **Oluşturulacak yeni bir sayaç bulunamadı.**`);

          return component.editReply({
            embeds: [resultEmbed(result.failed.length ? "Orange" : "Green", lines)]
          });
        }

        if ([controlIds.calendarSelect, controlIds.clockSelect].includes(component.customId) && component.isChannelSelectMenu()) {
          await component.deferReply({ flags: 64 });
          const isClock = component.customId === controlIds.clockSelect;
          const result = await configureDisplayChannel(guild, component.values[0], isClock);

          if (result.conflict) {
            return component.editReply({ content: `${emojiler.uyari} **Sayaç, takvim ve saat için ayrı ses kanalları seçmelisiniz.**` });
          }
          if (result.missing) {
            return component.editReply({ content: `${emojiler.uyari} **Seçilen ses kanalı bulunamadı.**` });
          }

          await message.edit(buildControlPayload(guild, result.guildData)).catch(() => {});
          return component.editReply({
            content: result.renameFailed
              ? `${emojiler.uyari} ${result.channel} kaydedildi ancak kanal adı güncellenemedi.`
              : `${emojiler.tik} ${isClock ? "Saat" : "Takvim"} kanalı ${result.channel} olarak **ayarlandı.**`
          });
        }

        if (component.customId === controlIds.update && component.isButton()) {
          await component.deferReply({ flags: 64 });
          const result = await updateConfiguredPanels(guild);
          if (result.empty) {
            return component.editReply({ content: `${emojiler.uyari} **Sunucuda kayıtlı panel bulunamadı.**` });
          }

          await message.edit(buildControlPayload(guild, result.guildData)).catch(() => {});
          const lines = [];
          if (result.updated.length) lines.push(`${emojiler.tik} **Güncellenenler:** ${result.updated.join(", ")}`);
          if (result.failed.length) lines.push(`${emojiler.uyari} **Güncellenemeyenler:** ${result.failed.join(", ")}`);
          return component.editReply({
            embeds: [resultEmbed(result.failed.length ? "Orange" : "Green", lines)]
          });
        }

        if (component.customId === controlIds.reset && component.isButton()) {
          const currentData = readData();
          const guildData = currentData[guild.id];
          if (!hasPanelConfiguration(guildData)) {
            return component.reply({ content: `${emojiler.uyari} **Sunucuda kayıtlı panel bulunamadı.**`, flags: 64 });
          }

          const modal = buildResetModal(component, guildData);
          await component.showModal(modal);
          const submitted = await component.awaitModalSubmit({
            filter: modalInteraction => modalInteraction.customId === modal.data.custom_id && modalInteraction.user.id === interaction.user.id,
            time: 60000
          }).catch(() => null);

          if (!submitted) {
            return component.followUp({ content: `${emojiler.saat} **Menünün süresi doldu.**`, flags: 64 });
          }

          await submitted.deferReply({ flags: 64 });
          try {
            const result = await resetSelectedPanels(guild, submitted.fields.getStringSelectValues("sifirlanacak_paneller"));
            await message.edit(buildControlPayload(guild, result.guildData)).catch(() => {});

            const lines = [];
            if (result.reset.length) lines.push(`${emojiler.tik} **Sıfırlananlar:**\n${result.reset.map(item => `- ${item}`).join("\n")}`);
            if (result.failed.length) lines.push(`${emojiler.uyari} **Silinemeyenler:** ${result.failed.join(", ")}`);
            if (!lines.length) lines.push(`${emojiler.uyari} **Sıfırlanabilecek kayıt bulunamadı.**`);

            return submitted.editReply({
              embeds: [resultEmbed(result.failed.length ? "Orange" : "Red", lines)]
            });
          } catch (error) {
            console.error("🔴 [SES PANELLERİ] Sıfırlama işlemi tamamlanamadı:", error);
            return submitted.editReply({ content: `${emojiler.uyari} **Sıfırlama sırasında bir hata oluştu.**` }).catch(() => null);
          }
        }
      } catch (error) {
        return replyWithComponentError(component, error);
      }
    });

    collector.on("end", () => {
      try {
        const latestData = readData();
        message.edit(buildControlPayload(guild, latestData[guild.id] || {}, true)).catch(() => {});
      } catch (error) {
        console.error("🔴 [SES PANELLERİ] Süresi dolan panel kapatılamadı:", error);
      }
    });
  }
};
