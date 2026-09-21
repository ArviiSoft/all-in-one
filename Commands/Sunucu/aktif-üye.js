const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, LabelBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, RoleSelectMenuBuilder, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, ThumbnailBuilder, escapeMarkdown } = require("discord.js");
const aktifDB = require("../../Utils/Engagement/aktifDB");
const { AKTIF_UYE_RENGI, buildActiveMemberPayload } = require("../../Utils/Engagement/embedGenerator");
const { GUNLER, ayarlaZamanlama, normalizeZamanlama, parseGun, parseSaat, saatMetni, zamanlamaMetni } = require("../../Utils/Engagement/aktifUyeZamanlama");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const PANEL_TTL = 10 * 60_000;
const PANEL_FLAGS = MessageFlags.IsComponentsV2;
const EPHEMERAL_PANEL_FLAGS = PANEL_FLAGS | MessageFlags.Ephemeral;
const UYARI_RENGI = 0xfee75c;
const HATA_RENGI = 0xed4245;

function makeId(sessionId, action) {
  return `aktif-uye:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `aktif-uye:${sessionId}:`;
  return customId?.startsWith(prefix) ? customId.slice(prefix.length) : null;
}

function ayirici() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function buildNoticePayload(title, description, options = {}) {
  const { error = false, ephemeral = true, thumbnailURL = null } = options;
  const container = new ContainerBuilder()
    .setAccentColor(error ? HATA_RENGI : AKTIF_UYE_RENGI);
  const content = `## ${title}\n${description}`;

  if (thumbnailURL) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailURL))
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  }

  return {
    components: [container],
    flags: ephemeral ? EPHEMERAL_PANEL_FLAGS : PANEL_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildScheduleModal(sessionId, zamanlama) {
  const normalized = normalizeZamanlama(zamanlama);

  return new ModalBuilder()
    .setCustomId(makeId(sessionId, "schedule-modal"))
    .setTitle("Haftalık Seçim Zamanı")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Gün gir")
        .setDescription("Pazartesi–Pazar veya 1–7 biçiminde gir.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("gun")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Örnek: Pazar")
            .setValue(GUNLER[normalized.gun])
            .setMinLength(1)
            .setMaxLength(10)
            .setRequired(true)
        ),
      new LabelBuilder()
        .setLabel("Saat gir")
        .setDescription("24 saat düzeninde SS:DD biçimini kullan.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("saat")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Örnek: 20:30")
            .setValue(saatMetni(normalized))
            .setMinLength(4)
            .setMaxLength(5)
            .setRequired(true)
        )
    );
}

function kurulumVar(data, guildId) {
  return data.guild === guildId
    && Boolean(data.kanal && data.mesaj && data.thread && data.rol);
}

function secimMetni(id, type) {
  if (!id) return "`Seçilmedi`";
  return type === "channel" ? `<#${id}>` : `<@&${id}>`;
}

function buildPanelPayload({
  guild,
  data,
  sessionId,
  selection,
  disabled = false,
  notice = null,
  ephemeral = false,
}) {
  const installed = kurulumVar(data, guild.id);
  const sameGuild = data.guild === guild.id;
  const savedChannelId = sameGuild ? data.kanal : null;
  const savedRoleId = sameGuild ? data.rol : null;
  const channelChanged = Boolean(selection.channelId && selection.channelId !== savedChannelId);
  const roleChanged = Boolean(selection.roleId && selection.roleId !== savedRoleId);
  const hasPendingChanges = channelChanged || roleChanged;
  const status = installed
    ? "🟢 **Kurulu ve çalışıyor**"
    : "🟠 **Kurulum bekliyor**";
  const messageLink = installed
    ? `https://discord.com/channels/${guild.id}/${data.kanal}/${data.mesaj}`
    : null;
  const guildName = escapeMarkdown(guild.name, {
    heading: true,
    bulletedList: true,
    numberedList: true,
    maskedLink: true,
  });
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "channel"))
    .setPlaceholder("Sıralamanın yayınlanacağı kanalı seç")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "role"))
    .setPlaceholder("Haftanın aktif üyesine verilecek rolü seç")
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);

  if (selection.channelId && guild.channels.cache.has(selection.channelId)) {
    channelSelect.setDefaultChannels(selection.channelId);
  }
  if (selection.roleId && guild.roles.cache.has(selection.roleId)) {
    roleSelect.setDefaultRoles(selection.roleId);
  }

  const container = new ContainerBuilder()
    .setAccentColor(installed ? AKTIF_UYE_RENGI : UYARI_RENGI)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              "## 💚 Aktif Üye Yönetim Merkezi",
              `**${guildName}** sunucusunun haftalık aktivite sistemini yönetir.`,
            ].join("\n")
          )
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            guild.iconURL({ extension: "png", size: 256 })
            || guild.client.user.displayAvatarURL({ extension: "png", size: 256 })
          )
        )
    )
    .addSeparatorComponents(ayirici())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "### Sistem Durumu",
          status,
          `**Yayın kanalı:** ${secimMetni(savedChannelId, "channel")}`,
          `**Ödül rolü:** ${secimMetni(savedRoleId, "role")}`,
          `**Seçim zamanı:** \`${zamanlamaMetni(data.zamanlama)}\``,
          `**Aktif üye:** ${sameGuild && data.aktifUye ? `<@${data.aktifUye}>` : "`Henüz seçilmedi`"}`,
          `**Arşiv:** ${sameGuild && data.thread ? `<#${data.thread}>` : "`Henüz oluşturulmadı`"}`,
        ].join("\n")
      )
    );

  if (notice) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`> ${notice}`)
    );
  }

  container
    .addSeparatorComponents(ayirici())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "### 1 · Yayın Kanalı",
          `Seçili kanal: ${secimMetni(selection.channelId, "channel")}${channelChanged ? "  **(kaydedilmedi)**" : ""}`,
          "-# Canlı sıralama ve haftalık aktif üye bu kanalda gösterilir.",
        ].join("\n")
      )
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(channelSelect))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "### 2 · Ödül Rolü",
          `Seçili rol: ${secimMetni(selection.roleId, "role")}${roleChanged ? "  **(kaydedilmedi)**" : ""}`,
          "-# Rol, yeni kazanan seçildiğinde önceki üyeden alınarak otomatik devredilir.",
        ].join("\n")
      )
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(roleSelect))
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              "### 3 · Zaman Ayarlama",
              `Haftalık seçim: **${zamanlamaMetni(data.zamanlama)}**`,
              "-# Gün ve saati değiştirmek için formu aç. Saat dilimi: Europe/Istanbul",
            ].join("\n")
          )
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(makeId(sessionId, "schedule"))
            .setLabel("Zamanı Ayarla")
            .setEmoji(emojiler.donensaat || "⏰")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)
        )
    )
    .addSeparatorComponents(ayirici());

  const primaryControls = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "apply"))
      .setLabel(installed ? "Değişiklikleri Uygula" : "Sistemi Kur")
      .setEmoji(installed ? "💾" : emojiler.system2 || "⚙️")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled || !selection.channelId || !selection.roleId),
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "recreate"))
      .setLabel("Mesajı Yeniden Oluştur")
      .setEmoji("✍️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || !installed || !selection.channelId || !selection.roleId),
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "refresh"))
      .setLabel("Yenile")
      .setEmoji(emojiler.yukleniyor || "🔄")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled)
  );

  const systemControls = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "reset"))
      .setLabel("Verileri Sıfırla")
      .setEmoji(emojiler.cop || "🗑️")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled || !sameGuild),
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "shutdown"))
      .setLabel("Sistemi Kapat")
      .setEmoji(`${emojiler.kapat_arviis}`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled || !installed)
  );

  if (messageLink) {
    systemControls.addComponents(
      new ButtonBuilder()
        .setLabel("Sıralamaya Git")
        .setStyle(ButtonStyle.Link)
        .setURL(messageLink)
        .setDisabled(disabled)
    );
  }

  container
    .addActionRowComponents(primaryControls)
    .addActionRowComponents(systemControls)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        disabled
          ? "-# 🔒 Yönetim oturumunun süresi doldu. Yeni panel için /aktif-üye ayarla komutunu kullan."
          : hasPendingChanges
            ? "-# Seçimlerin hazır, kaydetmek için 'Sistemi Kur' butonuna bas."
            : `-# Panel 10 dakika kullanılabilir · Haftalık seçim ${zamanlamaMetni(data.zamanlama)}'da yapılır.`
      )
    );

  return {
    components: [container],
    flags: ephemeral ? EPHEMERAL_PANEL_FLAGS : PANEL_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildResetConfirmationPayload(sessionId) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(HATA_RENGI)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              "## ⚠️ Aktif Üye Verilerini Sıfırla",
              "- Tüm mesaj puanları, haftalık kazanan, rekorlar ve liderlik serileri temizlenecek.",
              "",
              "- Kanal ve rol kurulumu korunur. Bu işlem geri alınamaz.",
            ].join("\n")
          )
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, "confirm-reset"))
              .setLabel("Evet, verileri sıfırla")
              .setEmoji(emojiler.cop || "🗑️")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, "cancel-reset"))
              .setLabel("Vazgeç")
              .setStyle(ButtonStyle.Secondary)
          )
        ),
    ],
    flags: PANEL_FLAGS,
  };
}

function buildShutdownConfirmationPayload(sessionId) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(HATA_RENGI)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              `## ${emojiler.kapat_arviis} Aktif Üye Sistemini Kapat`,
              "Bu işlem sistemi tamamen devre dışı bırakacak:",
              "",
              "- Kanal, mesaj, thread, rol ve zaman ayarları temizlenecek.",
              "- Tüm puanlar, kazananlar, rekorlar ve liderlik serileri silinecek.",
              "- Ödül rolü üyelerden geri alınacak.",
              "- Sıralama mesajı kapalı durumuna geçirilecek.",
              "- Geçmiş thread'i silinmeden arşivlenecek.",
              "",
              "**Veritabanı `{}` haline getirilecek. Bu işlem geri alınamaz.**",
            ].join("\n")
          )
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, "confirm-shutdown"))
              .setLabel("Evet, sistemi kapat")
              .setEmoji(`${emojiler.kapat_arviis}`)
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, "cancel-shutdown"))
              .setLabel("Vazgeç")
              .setStyle(ButtonStyle.Secondary)
          )
        ),
    ],
    flags: PANEL_FLAGS,
  };
}

function buildSystemClosedPayload(closedById) {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(0x747f8d)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              "## ⛔ Aktif Üye Sistemi Kapatıldı",
              "Haftalık mesaj takibi ve otomatik aktif üye seçimi durduruldu.",
              closedById ? `**Kapatan yönetici:** <@${closedById}>` : null,
              `-# Sistem verileri temizlendi · <t:${timestamp}:F>`,
            ].filter(Boolean).join("\n")
          )
        ),
    ],
    flags: PANEL_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildRelocatedPayload(channelId) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(0x747f8d)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              "## 📦 Aktif Üye Paneli Taşındı",
              `Güncel sıralama artık <#${channelId}> kanalında yayınlanıyor.`,
              "-# Bu mesaj arşiv amacıyla korunmuştur ve artık güncellenmez.",
            ].join("\n")
          )
        ),
    ],
    flags: PANEL_FLAGS,
    allowedMentions: { parse: [] },
  };
}

async function fetchConfiguredMessage(guild, data) {
  if (!data.kanal || !data.mesaj) return null;
  const channel = await guild.channels.fetch(data.kanal).catch(() => null);
  if (!channel?.isTextBased?.()) return null;
  return channel.messages.fetch(data.mesaj).catch(() => null);
}

async function editActiveMessage(message, data, guild) {
  const payload = buildActiveMemberPayload(data, guild);
  if (!message.flags?.has(MessageFlags.IsComponentsV2)) {
    payload.content = null;
    payload.embeds = [];
  }
  return message.edit(payload);
}

function validateChannel(channel, guild) {
  if (!channel || channel.guildId !== guild.id || !channel.isTextBased?.() || channel.isThread?.()) {
    return "Yalnızca bu sunucudaki bir yazı veya duyuru kanalını seçebilirsin.";
  }

  const permissions = channel.permissionsFor(guild.members.me);
  const required = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.CreatePublicThreads,
    PermissionFlagsBits.SendMessagesInThreads,
  ];

  if (!permissions?.has(required)) {
    return "Botun kanalı görme, mesaj gönderme/okuma ve herkese açık thread oluşturup yazma izinleri olmalı.";
  }

  return null;
}

function validateRole(role, guild) {
  if (!role || role.guild.id !== guild.id || role.id === guild.id) {
    return "@everyone rolü ödül rolü olarak kullanılamaz.";
  }
  if (role.managed) return "Entegrasyonlar tarafından yönetilen bir rol seçilemez.";

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return "Botta **Rolleri Yönet** yetkisi bulunmuyor.";
  }
  if (me.roles.highest.comparePositionTo(role) <= 0) {
    return "Seçilen rol botun en yüksek rolünün altında olmalı.";
  }

  return null;
}

async function ensureArchiveThread(guild, data, message) {
  let thread = data.thread
    ? await guild.channels.fetch(data.thread).catch(() => null)
    : null;

  if ((!thread?.isThread?.() || thread.parentId !== message.channelId) && message.thread?.isThread?.()) {
    thread = message.thread;
  }

  if (!thread?.isThread?.() || thread.parentId !== message.channelId) {
    thread = await message.startThread({
      name: "🟢 Geçmiş Aktif Üyeler",
      autoArchiveDuration: 10080,
      reason: "Haftalık aktif üye sonuçlarını arşivlemek için oluşturuldu.",
    });
  } else {
    if (thread.name !== "🟢 Geçmiş Aktif Üyeler") {
      await thread.setName("🟢 Geçmiş Aktif Üyeler").catch(() => null);
    }
    if (thread.archived) await thread.setArchived(false).catch(() => null);
  }

  return thread;
}

async function deactivateOldInstallation(guild, oldData, currentMessage, newChannelId) {
  if (!currentMessage || currentMessage.id === oldData.mesaj) return;

  const oldMessage = await fetchConfiguredMessage(guild, oldData);
  if (oldMessage) {
    const payload = buildRelocatedPayload(newChannelId);
    if (!oldMessage.flags?.has(MessageFlags.IsComponentsV2)) {
      payload.content = null;
      payload.embeds = [];
    }
    await oldMessage.edit(payload).catch(() => null);
  }

  if (oldData.thread) {
    const oldThread = await guild.channels.fetch(oldData.thread).catch(() => null);
    if (oldThread?.isThread?.() && !oldThread.archived) {
      await oldThread.setArchived(true, "Aktif üye paneli yeni bir mesaja taşındı.").catch(() => null);
    }
  }
}

async function installSystem({ guild, data, channelId, roleId, forceNew = false, preserveLatestData = false }) {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  const role = await guild.roles.fetch(roleId).catch(() => null);
  const channelError = validateChannel(channel, guild);
  const roleError = validateRole(role, guild);
  if (channelError) throw new Error(channelError);
  if (roleError) throw new Error(roleError);

  const oldData = { ...data };
  let message = !forceNew && data.kanal === channel.id
    ? await fetchConfiguredMessage(guild, data)
    : null;
  let createdMessage = false;

  let nextData = {
    ...data,
    guild: guild.id,
    kanal: channel.id,
    rol: role.id,
    zamanlama: ayarlaZamanlama(data.zamanlama),
  };

  if (message) {
    await editActiveMessage(message, nextData, guild);
  } else {
    message = await channel.send(buildActiveMemberPayload(nextData, guild));
    createdMessage = true;
  }

  let thread;
  try {
    thread = await ensureArchiveThread(guild, forceNew ? { ...nextData, thread: null } : nextData, message);
  } catch (error) {
    if (createdMessage) await message.delete().catch(() => null);
    throw error;
  }

  nextData.mesaj = message.id;
  nextData.thread = thread.id;
  if (preserveLatestData) {
    const latest = aktifDB.loadData();
    if (latest.guild && latest.guild !== guild.id) throw new Error("Aktif üye kurulumu başka bir sunucu tarafından değiştirildi.");
    const config = { guild: guild.id, kanal: nextData.kanal, rol: nextData.rol, mesaj: message.id, thread: thread.id,
      zamanlama: { ...nextData.zamanlama, sonCalisma: latest.zamanlama.sonCalisma } };
    nextData = { ...latest, ...config };
  }
  aktifDB.saveData(nextData);
  await deactivateOldInstallation(guild, oldData, message, channel.id);
  return nextData;
}

async function updatePublicMessage(guild, data) {
  const message = await fetchConfiguredMessage(guild, data);
  if (!message) throw new Error("Aktif üye sıralama mesajı bulunamadı.");
  await editActiveMessage(message, data, guild);
}

async function clearAwardRole(guild, roleId, exceptMemberId = null) {
  if (!roleId) return;
  const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
  if (!role) return;

  await Promise.allSettled(
    [...role.members.values()]
      .filter(member => member.id !== exceptMemberId)
      .map(member => member.roles.remove(role, "Aktif üye ödül rolü devredildi."))
  );
}

async function shutdownSystem(guild, data, closedById) {
  const warnings = [];
  await clearAwardRole(guild, data.rol);

  const message = await fetchConfiguredMessage(guild, data);
  if (message) {
    const payload = buildSystemClosedPayload(closedById);
    if (!message.flags?.has(MessageFlags.IsComponentsV2)) {
      payload.content = null;
      payload.embeds = [];
    }
    await message.edit(payload).catch(error => {
      console.error("🔴 [AKTİF ÜYE] Kapatılan sistem mesajı güncellenemedi:", error);
      warnings.push("sıralama mesajı güncellenemedi");
    });
  } else {
    warnings.push("sıralama mesajı bulunamadı");
  }

  if (data.thread) {
    const thread = await guild.channels.fetch(data.thread).catch(() => null);
    if (thread?.isThread?.() && !thread.archived) {
      await thread.setArchived(true, "Aktif üye sistemi yönetici tarafından kapatıldı.").catch(error => {
        console.error("🔴 [AKTİF ÜYE] Geçmiş thread'i arşivlenemedi:", error);
        warnings.push("geçmiş thread'i arşivlenemedi");
      });
    }
  }

  aktifDB.clearData();
  return warnings;
}

async function executeSelection(interaction) {
  const member = interaction.options.getMember("kişi");
  const data = aktifDB.loadData();

  if (!member || member.user.bot) {
    return interaction.reply(
      buildNoticePayload("Üye seçilemedi", "Aktif üye olarak sunucudaki gerçek bir üyeyi seçmelisin.", { error: true })
    );
  }
  if (!kurulumVar(data, interaction.guild.id)) {
    return interaction.reply(
      buildNoticePayload(
        "Sistem henüz kurulmadı",
        "Önce `/aktif-üye ayarla` panelinden yayın kanalını ve ödül rolünü ayarla.",
        { error: true }
      )
    );
  }

  const role = interaction.guild.roles.cache.get(data.rol)
    || await interaction.guild.roles.fetch(data.rol).catch(() => null);
  const roleError = validateRole(role, interaction.guild);
  if (roleError) {
    return interaction.reply(buildNoticePayload("Ödül rolü kullanılamıyor", roleError, { error: true }));
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await clearAwardRole(interaction.guild, role.id, member.id);
  await member.roles.add(role, "Aktif üye yönetici tarafından seçildi.");

  data.aktifUye = member.id;
  aktifDB.saveData(data);

  let warning = "";
  try {
    await updatePublicMessage(interaction.guild, data);
  } catch (error) {
    console.error("🔴 [AKTİF ÜYE] Sıralama mesajı güncellenemedi:", error);
    warning = "\n\n⚠️ Rol verildi ancak sıralama mesajı güncellenemedi, yönetim panelinden mesajı yeniden oluştur.";
  }

  return interaction.editReply(
    buildNoticePayload(
      "Aktif Üye Güncellendi",
      `👑 ${member} artık haftanın aktif üyesi ve ${role} rolü kendisine verildi.${warning}`,
      {
        ephemeral: false,
        thumbnailURL: member.displayAvatarURL({ extension: "png", size: 256 }),
      }
    )
  );
}

async function executePanel(interaction, client) {
  const botClient = client || interaction.client;
  const sessionId = interaction.id;
  let data = aktifDB.loadData();
  const selection = {
    channelId: data.guild === interaction.guild.id ? data.kanal : null,
    roleId: data.guild === interaction.guild.id ? data.rol : null,
  };
  let closed = false;
  let closeTimer;

  const render = (options = {}) => buildPanelPayload({
    guild: interaction.guild,
    data,
    sessionId,
    selection,
    ...options,
  });

  await interaction.reply(render({ ephemeral: true }));

  const closeSession = async () => {
    if (closed) return;
    closed = true;
    clearTimeout(closeTimer);
    botClient.off("interactionCreate", listener);
    await interaction.editReply(render({ disabled: true })).catch(() => null);
  };

  const listener = async componentInteraction => {
    const action = parseAction(componentInteraction.customId, sessionId);
    if (!action || closed) return;

    if (componentInteraction.user.id !== interaction.user.id) {
      return componentInteraction.reply(
        buildNoticePayload(
          "Bu panel sana ait değil",
          "Aktif üye yönetim panelini yalnızca komutu kullanan yönetici kontrol edebilir.",
          { error: true }
        )
      ).catch(() => null);
    }

    try {
      if (componentInteraction.isChannelSelectMenu() && action === "channel") {
        selection.channelId = componentInteraction.values[0];
        return componentInteraction.update(
          render({ notice: "📍 Yayın kanalı seçildi. Değişikliği uyguladığında kaydedilecek." })
        );
      }

      if (componentInteraction.isRoleSelectMenu() && action === "role") {
        selection.roleId = componentInteraction.values[0];
        return componentInteraction.update(
          render({ notice: "🎖️ Ödül rolü seçildi. Değişikliği uyguladığında kaydedilecek." })
        );
      }

      if (componentInteraction.isModalSubmit() && action === "schedule-modal") {
        const gun = parseGun(componentInteraction.fields.getTextInputValue("gun"));
        const saat = parseSaat(componentInteraction.fields.getTextInputValue("saat"));

        if (gun === null || !saat) {
          const sorun = gun === null
            ? "Gün alanına `Pazartesi`–`Pazar` arasında bir gün veya `1`–`7` arasında bir sayı gir."
            : "Saat alanını 24 saat düzeninde `SS:DD` olarak gir. Örnek: `20:30`.";
          return componentInteraction.reply(
            buildNoticePayload("Geçersiz Zaman", sorun, { error: true })
          );
        }

        data = aktifDB.loadData();
        data.zamanlama = ayarlaZamanlama(data.zamanlama, {
          gun,
          saat: saat.saat,
          dakika: saat.dakika,
        });
        aktifDB.saveData(data);

        let scheduleWarning = "";
        if (kurulumVar(data, interaction.guild.id)) {
          await updatePublicMessage(interaction.guild, data).catch(error => {
            console.error("🔴 [AKTİF ÜYE] Zaman değişikliği sonrası mesaj güncellenemedi:", error);
            scheduleWarning = "\n\n⚠️ Zaman kaydedildi ancak sıralama mesajı güncellenemedi.";
          });
        }

        await componentInteraction.reply(
          buildNoticePayload(
            "Seçim Zamanı Güncellendi",
            `${emojiler.tik} Haftalık aktif üye seçimi **${zamanlamaMetni(data.zamanlama)}** olarak ayarlandı.${scheduleWarning}`
          )
        );
        return interaction.editReply(
          render({ notice: `⏰ Haftalık seçim zamanı ${zamanlamaMetni(data.zamanlama)} olarak kaydedildi.` })
        );
      }

      if (!componentInteraction.isButton()) return;

      if (action === "schedule") {
        return componentInteraction.showModal(buildScheduleModal(sessionId, data.zamanlama));
      }

      if (action === "refresh") {
        data = aktifDB.loadData();
        selection.channelId = data.guild === interaction.guild.id ? data.kanal : null;
        selection.roleId = data.guild === interaction.guild.id ? data.rol : null;
        return componentInteraction.update(render({ notice: "🔄 Sistem durumu yenilendi." }));
      }

      if (action === "reset") {
        return componentInteraction.update(buildResetConfirmationPayload(sessionId));
      }

      if (action === "shutdown") {
        return componentInteraction.update(buildShutdownConfirmationPayload(sessionId));
      }

      if (action === "cancel-reset") {
        return componentInteraction.update(render({ notice: "Sıfırlama işleminden vazgeçildi." }));
      }

      if (action === "cancel-shutdown") {
        return componentInteraction.update(render({ notice: "Sistemi kapatma işleminden vazgeçildi." }));
      }

      if (action === "confirm-shutdown") {
        await componentInteraction.deferUpdate();
        data = aktifDB.loadData();
        if (data.guild !== interaction.guild.id) {
          return interaction.editReply(
            render({ notice: "⚠️ Bu sunucuya ait kapatılabilecek bir aktif üye kurulumu bulunmuyor." })
          );
        }

        const warnings = await shutdownSystem(interaction.guild, data, interaction.user.id);
        data = aktifDB.loadData();
        selection.channelId = null;
        selection.roleId = null;
        const warningText = warnings.length
          ? ` Bazı Discord öğeleri güncellenemedi: ${warnings.join(", ")}.`
          : "";

        return interaction.editReply(
          render({ notice: `${emojiler.tik || "✅"} Sistem kapatıldı ve aktifUye.json temizlendi.${warningText}` })
        );
      }

      if (action === "confirm-reset") {
        await componentInteraction.deferUpdate();
        data = aktifDB.loadData();
        if (data.guild !== interaction.guild.id) {
          return interaction.editReply(
            render({ notice: "⚠️ Bu sunucuya ait sıfırlanabilecek bir aktif üye kurulumu bulunmuyor." })
          );
        }
        await clearAwardRole(interaction.guild, data.rol);
        aktifDB.resetStatistics(data);
        aktifDB.saveData(data);

        let notice = `${emojiler.tik} Mesaj puanları, kazananlar, rekorlar ve liderlik serileri sıfırlandı.`;
        if (kurulumVar(data, interaction.guild.id)) {
          await updatePublicMessage(interaction.guild, data).catch(error => {
            console.error("🔴 [AKTİF ÜYE] Sıfırlama sonrası mesaj güncellenemedi:", error);
            notice += " Sıralama mesajı güncellenemedi; yeniden oluşturmayı deneyebilirsin.";
          });
        }

        return interaction.editReply(render({ notice }));
      }

      if (action === "apply" || action === "recreate") {
        await componentInteraction.deferUpdate();
        data = aktifDB.loadData();
        data = await installSystem({
          guild: interaction.guild,
          data,
          channelId: selection.channelId,
          roleId: selection.roleId,
          forceNew: action === "recreate",
        });
        selection.channelId = data.kanal;
        selection.roleId = data.rol;

        return interaction.editReply(
          render({
            notice: action === "recreate"
              ? `${emojiler.tik} Sıralama mesajı ve haftalık arşiv yeniden oluşturuldu.`
              : `${emojiler.tik} Aktif üye sistemi başarıyla kuruldu ve ayarlar kaydedildi.`,
          })
        );
      }
    } catch (error) {
      console.error("🔴 [AKTİF ÜYE YÖNETİM PANELİ]", error);
      const description = error.message || "İşlem sırasında beklenmeyen bir hata oluştu.";
      if (componentInteraction.deferred || componentInteraction.replied) {
        return interaction.editReply(render({ notice: `⚠️ ${description}` })).catch(() => null);
      }
      return componentInteraction.reply(
        buildNoticePayload("İşlem Tamamlanamadı", description, { error: true })
      ).catch(() => null);
    }
  };

  botClient.on("interactionCreate", listener);
  closeTimer = setTimeout(closeSession, PANEL_TTL);
  closeTimer.unref?.();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("aktif-üye")
    .setDescription("Aktif üye sistemini yönetir.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand => subcommand
      .setName("ayarla")
      .setDescription("Aktif üye sisteminin yönetim panelini açar."))
    .addSubcommand(subcommand => subcommand
      .setName("seç")
      .setDescription("Haftanın aktif üyesini elle seçer.")
      .addUserOption(option => option
        .setName("kişi")
        .setDescription("Aktif üye olarak seçilecek kişi.")
        .setRequired(true))),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "seç") return executeSelection(interaction);
    return executePanel(interaction, client);
  },

  buildPanelPayload,
  buildResetConfirmationPayload,
  buildScheduleModal,
  buildShutdownConfirmationPayload,
  buildSystemClosedPayload,
  editActiveMessage,
  installSystem,
  shutdownSystem,
};
