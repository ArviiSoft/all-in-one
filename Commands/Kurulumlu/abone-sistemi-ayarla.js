const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, LabelBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, RoleSelectMenuBuilder, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, StringSelectMenuBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, ThumbnailBuilder, WebhookClient, escapeMarkdown } = require("discord.js");
const store = require("../../Utils/Membership/aboneStore");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { flushDatabase } = require('../../Utils/Database/runtime');

const PANEL_TTL = 10 * 60_000;
const PANEL_FLAGS = MessageFlags.IsComponentsV2;
const PANEL_REPLY_FLAGS = PANEL_FLAGS | MessageFlags.Ephemeral;
const PANEL_COLOR = 0xff0000;
const WARNING_COLOR = 0xfee75c;
const ERROR_COLOR = 0xed4245;

function makeId(sessionId, action) {
  return `abone-panel:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `abone-panel:${sessionId}:`;
  return customId?.startsWith(prefix) ? customId.slice(prefix.length) : null;
}

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function selectedChannel(id) {
  return id ? `<#${id}>` : "`Seçilmedi`";
}

function selectedRole(id) {
  return id ? `<@&${id}>` : "`Seçilmedi`";
}

function shortText(value, max = 90) {
  const clean = String(value || "Ayarlanmadı").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function buildNoticePayload(title, description, error = false) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(error ? ERROR_COLOR : PANEL_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
        ),
    ],
    flags: PANEL_REPLY_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function createChannelSelect(sessionId, action, placeholder, currentId, disabled) {
  const menu = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(sessionId, action))
    .setPlaceholder(placeholder)
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);
  if (currentId) menu.setDefaultChannels(currentId);
  return menu;
}

function createRoleSelect(sessionId, action, placeholder, currentId, disabled) {
  const menu = new RoleSelectMenuBuilder()
    .setCustomId(makeId(sessionId, action))
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);
  if (currentId) menu.setDefaultRoles(currentId);
  return menu;
}

function buildPanelPayload({ guild, setting, selection, sessionId, disabled = false, notice = null, initial = false }) {
  const configured = Boolean(setting.kanal && setting.yetkili && setting.rol);
  const youtubeReady = Boolean(
    setting.youtube.aktif
    && setting.youtube.webhookUrl
    && setting.youtube.kaynakKanallar.length
  );
  const guildName = escapeMarkdown(guild.name, {
    heading: true,
    bulletedList: true,
    numberedList: true,
    maskedLink: true,
  });
  const sourceSummary = setting.youtube.kaynakKanallar.length
    ? setting.youtube.kaynakKanallar.map(id => `\`${id}\``).join(", ")
    : "`Ayarlanmadı`";

  const container = new ContainerBuilder()
    .setAccentColor(configured ? PANEL_COLOR : WARNING_COLOR)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            "## ▶️ Abone Sistemi Yönetim Merkezi",
            `**${guildName}** sunucusunun başvuru, video bildirimi ve yorum takip ayarlarını yönetir.`,
          ].join("\n"))
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            guild.iconURL({ extension: "png", size: 256 })
            || guild.client.user.displayAvatarURL({ extension: "png", size: 256 })
          )
        )
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### Sistem Durumu",
        `**Abone doğrulama:** ${configured ? "🟢 Hazır" : "🟠 Kurulum bekliyor"}`,
        `**Video bildirimleri:** ${youtubeReady ? "🟢 Aktif" : setting.youtube.aktif ? "🟠 Eksik ayar" : "⚫ Kapalı"}`,
        `**Son takip edilen video:** ${setting.youtube.sonVideoUrl ? `[${shortText(setting.youtube.sonVideoBaslik, 45)}](${setting.youtube.sonVideoUrl})` : "`Henüz yok`"}`,
      ].join("\n"))
    );

  if (notice) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`> ${notice}`)
    );
  }

  container
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### 1 · Başvuru ve Log Kanalları",
        `**Başvuru:** ${selectedChannel(selection.kanal)}`,
        `**Yorum takip logu:** ${selectedChannel(selection.logKanal)}`,
        "-# Ekran görüntüleri başvuru kanalında alınır, silinen yorumlar log kanalına gönderilir ve rol otomatik alınır.",
      ].join("\n"))
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        createChannelSelect(sessionId, "submission-channel", "Abone başvuru kanalını seç", selection.kanal, disabled)
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        createChannelSelect(sessionId, "log-channel", "Yorum takip log kanalını seç", selection.logKanal, disabled)
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### 2 · Abone ve Yetkili Rolleri",
        `**Abone rolü:** ${selectedRole(selection.rol)}`,
        `**Onay yetkilisi:** ${selectedRole(selection.yetkili)}`,
        "-# Abone rolü doğrulanan kullanıcıya verilir, onay tepkilerini yalnızca yetkili rolü kullanabilir.",
      ].join("\n"))
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        createRoleSelect(sessionId, "subscriber-role", "Verilecek abone rolünü seç", selection.rol, disabled)
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        createRoleSelect(sessionId, "staff-role", "Onay verebilecek yetkili rolünü seç", selection.yetkili, disabled)
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### 3 · Video Webhook'u",
        `**Bildirim kanalı:** ${selectedChannel(selection.bildirimKanal)}`,
        `**Etiket rolü:** ${selectedRole(selection.bildirimRol)}`,
        `**Webhook:** ${setting.youtube.webhookUrl ? `\`${shortText(setting.youtube.webhookName, 45)}\` · hazır` : "`Ayarlanmadı`"}`,
        `**YouTube kaynakları:** ${sourceSummary}`,
        "-# Kanalı seçip kaydettiğinde webhook otomatik oluşturulur. Harici webhook URL'si de kullanılabilir.",
      ].join("\n"))
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        createChannelSelect(sessionId, "notification-channel", "Video bildirim kanalını seç", selection.bildirimKanal, disabled)
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        createRoleSelect(sessionId, "notification-role", "Video bildiriminde etiketlenecek rolü seç", selection.bildirimRol, disabled)
      )
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            "### 4 · Webhook Kimliği ve Kaynaklar",
            `**İsim:** \`${shortText(setting.youtube.webhookName, 60)}\``,
            `**Avatar:** ${setting.youtube.webhookAvatar ? "[Görüntüle](" + setting.youtube.webhookAvatar + ")" : "`Varsayılan`"}`,
          ].join("\n"))
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(makeId(sessionId, "webhook-settings"))
            .setLabel("Webhook'u Ayarla")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)
        )
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            "### 5 · Özel Metinler",
            `**Video metni:** ${shortText(setting.youtube.videoMetni, 110)}`,
            `**Başvuru bilgisi:** ${shortText(setting.kontrolMesaj, 110)}`,
            "-# Video metninde {kanal}, {video_baslik}, {video_link} ve {rol} değişkenleri kullanılabilir.",
          ].join("\n"))
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(makeId(sessionId, "text-settings"))
            .setLabel("Metinleri Düzenle")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)
        )
    )
    .addSeparatorComponents(separator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "save"))
          .setLabel("Ayarları Kaydet")
          .setEmoji("💾")
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "toggle-youtube"))
          .setLabel(setting.youtube.aktif ? "Bildirimleri Kapat" : "Bildirimleri Aç")
          .setEmoji(setting.youtube.aktif ? "⏸️" : `${emojiler.bildirim_arviis}`)
          .setStyle(setting.youtube.aktif ? ButtonStyle.Danger : ButtonStyle.Primary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "refresh"))
          .setLabel("Yenile")
          .setEmoji(`${emojiler.yukleniyor}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled)
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(makeId(sessionId, "reset"))
          .setPlaceholder("Bir ayarı sıfırla")
          .setDisabled(disabled)
          .addOptions(
            { label: "Başvuru Kanalı", value: "kanal", emoji: "📨" },
            { label: "Abone Rolü", value: "rol", emoji: "🎖️" },
            { label: "Yetkili Rolü", value: "yetkili", emoji: "🛡️" },
            { label: "Log Kanalı", value: "log", emoji: "📋" },
            { label: "Webhook ve Bildirim Kanalı", value: "webhook", emoji: "🪝" },
            { label: "YouTube Kaynakları", value: "sources", emoji: "▶️" },
            { label: "Özel Metinler", value: "texts", emoji: "✏️" },
            { label: "Tüm Sistemi", value: "all", emoji: "🗑️" }
          )
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        disabled
          ? "-# 🔒 Yönetim oturumunun süresi doldu. Yeni panel için /abone-sistemi-ayarla komutunu kullan."
          : "-# Panel 10 dakika kullanılabilir · Kanal ve rol seçimleri 'Ayarları Kaydet' ile uygulanır."
      )
    );

  return {
    components: [container],
    flags: initial ? PANEL_REPLY_FLAGS : PANEL_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function textInput({ id, style, placeholder, value, minLength, maxLength, required = true }) {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setStyle(style)
    .setPlaceholder(placeholder)
    .setMinLength(minLength)
    .setMaxLength(maxLength)
    .setRequired(required);
  if (value) input.setValue(String(value).slice(0, maxLength));
  return input;
}

function buildWebhookModal(sessionId, setting) {
  return new ModalBuilder()
    .setCustomId(makeId(sessionId, "webhook-modal"))
    .setTitle("Webhook ve YouTube Ayarları")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Webhook adı")
        .setDescription("Video bildirimlerinde görünecek isim.")
        .setTextInputComponent(textInput({
          id: "webhook-name",
          style: TextInputStyle.Short,
          placeholder: "Örnek: Twilight Türkiye - YouTube",
          value: setting.youtube.webhookName,
          minLength: 1,
          maxLength: 80,
        })),
      new LabelBuilder()
        .setLabel("Webhook avatar bağlantısı")
        .setDescription("Doğrudan HTTPS görsel bağlantısı, boş bırakılabilir.")
        .setTextInputComponent(textInput({
          id: "webhook-avatar",
          style: TextInputStyle.Short,
          placeholder: "https://site.com/avatar.png",
          value: setting.youtube.webhookAvatar,
          minLength: 0,
          maxLength: 500,
          required: false,
        })),
      new LabelBuilder()
        .setLabel("YouTube kanal ID'leri")
        .setDescription("Birden fazlaysa virgül veya yeni satırla ayır. ID, UC ile başlar.")
        .setTextInputComponent(textInput({
          id: "youtube-channels",
          style: TextInputStyle.Paragraph,
          placeholder: "UCxxxxxxxxxxxxxxxxxxxxxx",
          value: setting.youtube.kaynakKanallar.join("\n"),
          minLength: 0,
          maxLength: 1000,
          required: false,
        })),
      new LabelBuilder()
        .setLabel("Harici webhook URL'si")
        .setDescription("İstersen otomatik oluşturma yerine mevcut Discord webhook'unu kullan.")
        .setTextInputComponent(textInput({
          id: "webhook-url",
          style: TextInputStyle.Short,
          placeholder: "https://discord.com/api/webhooks/...",
          value: setting.youtube.webhookUrl,
          minLength: 0,
          maxLength: 500,
          required: false,
        }))
    );
}

function buildTextModal(sessionId, setting) {
  return new ModalBuilder()
    .setCustomId(makeId(sessionId, "text-modal"))
    .setTitle("Abone Sistemi Metinleri")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Video bilgilendirme metni")
        .setDescription("Kullanılabilir: {kanal}, {video_baslik}, {video_link}, {rol}")
        .setTextInputComponent(textInput({
          id: "video-text",
          style: TextInputStyle.Paragraph,
          placeholder: store.DEFAULT_VIDEO_TEXT,
          value: setting.youtube.videoMetni,
          minLength: 1,
          maxLength: 2000,
        })),
      new LabelBuilder()
        .setLabel("Başvuru bilgilendirme metni")
        .setDescription("Kanal linki ve yorumun nasıl gönderileceğini tamamen özelleştir.")
        .setTextInputComponent(textInput({
          id: "submission-text",
          style: TextInputStyle.Paragraph,
          placeholder: "Kanal bağlantını ve videoya yazdığın yorumu ekran görüntüsüyle birlikte gönder.",
          value: setting.kontrolMesaj,
          minLength: 0,
          maxLength: 1500,
          required: false,
        }))
    );
}

function buildResetConfirmationPayload(sessionId) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(ERROR_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            "## ⚠️ Abone Sistemini Tamamen Sıfırla",
            "Kanal, rol, log, webhook, video metni ve aktif yorum takip kayıtları silinecek.",
            "",
            "**Bu işlem geri alınamaz.**",
          ].join("\n"))
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, "confirm-reset-all"))
              .setLabel("Evet, tümünü sıfırla")
              .setEmoji(`${emojiler.cop}`)
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, "cancel-reset"))
              .setLabel("Vazgeç")
              .setStyle(ButtonStyle.Secondary)
          )
        ),
    ],
    flags: PANEL_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function parseYoutubeChannelIds(value) {
  const parts = String(value || "").split(/[\s,;]+/).map(item => item.trim()).filter(Boolean);
  const ids = [];
  const invalid = [];
  for (const part of parts) {
    const match = part.match(/(?:channel\/)?(UC[\w-]{20,})/i);
    if (!match) invalid.push(part);
    else ids.push(match[1]);
  }
  if (invalid.length) {
    throw new Error(`Geçersiz YouTube kanal ID'si: ${invalid.slice(0, 3).join(", ")}`);
  }
  return [...new Set(ids)];
}

function validateHttpUrl(value, label) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${label} geçerli bir HTTPS bağlantısı olmalı.`);
  }
}

function validateDiscordWebhookUrl(value) {
  if (!value) return null;
  const url = validateHttpUrl(value, "Webhook URL'si");
  if (!/^https:\/\/(?:canary\.|ptb\.)?(?:discord(?:app)?\.com)\/api\/webhooks\/\d+\/[\w.-]+/i.test(url)) {
    throw new Error("Geçerli bir Discord webhook URL'si gir.");
  }
  return url;
}

function validateRole(guild, roleId, label, checkHierarchy = false) {
  const role = guild.roles.cache.get(roleId);
  if (!role || role.id === guild.id) throw new Error(`${label} olarak geçerli bir rol seç.`);
  if (role.managed) throw new Error(`${label} entegrasyon tarafından yönetilen bir rol olamaz.`);
  if (checkHierarchy && guild.members.me.roles.highest.comparePositionTo(role) <= 0) {
    throw new Error("Abone rolü botun en yüksek rolünün altında olmalı.");
  }
  return role;
}

async function validateTextChannel(guild, channelId, label, permissions) {
  if (!channelId) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.() || channel.isThread?.()) {
    throw new Error(`${label} için bu sunucudan bir yazı veya duyuru kanalı seç.`);
  }
  if (!channel.permissionsFor(guild.members.me)?.has(permissions)) {
    throw new Error(`Botun ${label.toLocaleLowerCase("tr-TR")} üzerinde gerekli izinleri yok.`);
  }
  return channel;
}

async function ensureWebhook(guild, channel, youtube) {
  if (!channel) return youtube.webhookUrl;
  const permissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ManageWebhooks,
  ];
  if (!channel.permissionsFor(guild.members.me)?.has(permissions)) {
    throw new Error("Botun video bildirim kanalında Webhook'ları Yönet izni olmalı.");
  }

  const webhookId = String(youtube.webhookUrl || "").match(/\/webhooks\/(\d+)/)?.[1];
  const webhooks = await channel.fetchWebhooks();
  let webhook = webhookId ? webhooks.get(webhookId) : null;
  if (!webhook) {
    webhook = webhooks.find(item => item.owner?.id === guild.client.user.id && item.name === youtube.webhookName);
  }

  const avatar = validateHttpUrl(youtube.webhookAvatar, "Webhook avatarı");
  if (!webhook) {
    webhook = await channel.createWebhook({
      name: youtube.webhookName,
      avatar: avatar || undefined,
      reason: "Abone sistemi video bildirimleri",
    });
  } else {
    webhook = await webhook.edit({
      name: youtube.webhookName,
      avatar: avatar || null,
      reason: "Abone sistemi yönetim paneli güncellemesi",
    });
  }
  return webhook.url;
}

async function saveSelections(guild, setting, selection) {
  if (!selection.kanal || !selection.rol || !selection.yetkili) {
    throw new Error("Başvuru kanalı, abone rolü ve yetkili rolü seçilmeden sistem kurulamaz.");
  }

  await validateTextChannel(guild, selection.kanal, "Başvuru kanalı", [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AddReactions,
  ]);
  if (selection.logKanal) {
    await validateTextChannel(guild, selection.logKanal, "Log kanalı", [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ]);
  }
  const notificationChannel = selection.bildirimKanal
    ? await validateTextChannel(guild, selection.bildirimKanal, "Video bildirim kanalı", [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ManageWebhooks,
    ])
    : null;

  if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error("Botta Rolleri Yönet yetkisi bulunmuyor.");
  }
  validateRole(guild, selection.rol, "Abone rolü", true);
  validateRole(guild, selection.yetkili, "Yetkili rolü");
  if (selection.bildirimRol) validateRole(guild, selection.bildirimRol, "Video bildirim rolü");

  let webhookUrl = setting.youtube.webhookUrl;
  if (notificationChannel) {
    webhookUrl = await ensureWebhook(guild, notificationChannel, setting.youtube);
  } else if (webhookUrl) {
    webhookUrl = validateDiscordWebhookUrl(webhookUrl);
    const webhook = new WebhookClient({ url: webhookUrl });
    try {
      await webhook.rest.get(`/webhooks/${webhook.id}/${webhook.token}`, { auth: false });
    } catch {
      throw new Error("Kaydedilen harici webhook'a ulaşılamadı.");
    } finally {
      webhook.destroy();
    }
  }

  return store.updateGuildSetting(guild.id, draft => {
    draft.kanal = selection.kanal;
    draft.rol = selection.rol;
    draft.yetkili = selection.yetkili;
    draft.logKanal = selection.logKanal;
    draft.youtube.bildirimKanal = selection.bildirimKanal;
    draft.youtube.bildirimRol = selection.bildirimRol || selection.rol;
    draft.youtube.webhookUrl = webhookUrl;
  });
}

async function executePanel(interaction, client) {
  const botClient = client || interaction.client;
  const sessionId = interaction.id;
  const guildId = interaction.guild.id;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let setting;
  try {
    await flushDatabase();
    setting = store.getGuildSetting(guildId);
  } catch (error) {
    console.error("🔴 [ABONE YÖNETİM PANELİ]", error.message);
    return await interaction.editReply({
      ...buildNoticePayload("Panel Açılamadı", error.message || "Veritabanına ulaşılamadı. Lütfen daha sonra tekrar dene.", true),
      flags: PANEL_FLAGS,
    }).catch(() => null);
  }
  const selection = {
    kanal: setting.kanal,
    logKanal: setting.logKanal,
    rol: setting.rol,
    yetkili: setting.yetkili,
    bildirimKanal: setting.youtube.bildirimKanal,
    bildirimRol: setting.youtube.bildirimRol || setting.rol,
  };
  let closed = false;
  let busy = false;
  let closeTimer;
  let listener;

  const render = options => buildPanelPayload({
    guild: interaction.guild,
    setting,
    selection,
    sessionId,
    ...options,
  });

  await interaction.editReply(render());

  const editPanel = async options => {
    await flushDatabase();
    return interaction.editReply(render(options));
  };

  const refreshSelection = () => {
    selection.kanal = setting.kanal;
    selection.logKanal = setting.logKanal;
    selection.rol = setting.rol;
    selection.yetkili = setting.yetkili;
    selection.bildirimKanal = setting.youtube.bildirimKanal;
    selection.bildirimRol = setting.youtube.bildirimRol || setting.rol;
  };

  const expire = async () => {
    if (closed) return;
    closed = true;
    clearTimeout(closeTimer);
    botClient.off("interactionCreate", listener);
    await interaction.editReply(render({ disabled: true })).catch(() => null);
  };

  listener = async componentInteraction => {
    const action = parseAction(componentInteraction.customId, sessionId);
    if (!action || closed) return;

    if (componentInteraction.user.id !== interaction.user.id) {
      return componentInteraction.reply(
        buildNoticePayload("Bu panel sana ait değil", "Paneli yalnızca komutu kullanan yönetici kontrol edebilir.", true)
      ).catch(() => null);
    }

    let ownsBusy = false;
    try {
      const recognized = componentInteraction.isChannelSelectMenu() ? ['submission-channel', 'log-channel', 'notification-channel']
        : componentInteraction.isRoleSelectMenu() ? ['subscriber-role', 'staff-role', 'notification-role']
        : componentInteraction.isModalSubmit() ? ['webhook-modal', 'text-modal']
        : componentInteraction.isStringSelectMenu() ? ['reset']
        : componentInteraction.isButton() ? ['refresh', 'save', 'toggle-youtube', 'cancel-reset', 'confirm-reset-all', 'webhook-settings', 'text-settings'] : [];
      if (!recognized.includes(action)) return;
      const opensModal = componentInteraction.isButton() && ['webhook-settings', 'text-settings'].includes(action);
      if (busy) {
        const payload = buildNoticePayload("İşlem Devam Ediyor", "Önceki işlem tamamlandıktan sonra seçimini tekrar yap.");
        if (opensModal) return await componentInteraction.reply(payload);
        if (componentInteraction.isModalSubmit()) {
          await componentInteraction.deferReply({ flags: MessageFlags.Ephemeral });
          return await componentInteraction.editReply({ ...payload, flags: PANEL_FLAGS });
        }
        await componentInteraction.deferUpdate();
        return await componentInteraction.followUp(payload);
      }
      busy = true;
      ownsBusy = true;
      if (opensModal) {
        return await componentInteraction.showModal(action === 'webhook-settings'
          ? buildWebhookModal(sessionId, setting) : buildTextModal(sessionId, setting));
      }
      if (componentInteraction.isModalSubmit()) await componentInteraction.deferReply({ flags: MessageFlags.Ephemeral });
      else await componentInteraction.deferUpdate();

      if (componentInteraction.isChannelSelectMenu()) {
        const channelId = componentInteraction.values[0];
        const map = {
          "submission-channel": "kanal",
          "log-channel": "logKanal",
          "notification-channel": "bildirimKanal",
        };
        const key = map[action];
        if (!key) return;
        selection[key] = channelId;
        return await editPanel({
          notice: "📍 Kanal seçildi. Değişikliği uygulamak için Ayarları Kaydet butonuna bas.",
        });
      }

      if (componentInteraction.isRoleSelectMenu()) {
        const roleId = componentInteraction.values[0];
        const key = action === "subscriber-role"
          ? "rol"
          : action === "staff-role"
            ? "yetkili"
            : action === "notification-role"
              ? "bildirimRol"
              : null;
        if (!key) return;
        selection[key] = roleId;
        return await editPanel({
          notice: "🎖️ Rol seçildi. Değişikliği uygulamak için Ayarları Kaydet butonuna bas.",
        });
      }

      if (componentInteraction.isModalSubmit() && action === "webhook-modal") {
        const webhookName = componentInteraction.fields.getTextInputValue("webhook-name").trim();
        const webhookAvatar = validateHttpUrl(
          componentInteraction.fields.getTextInputValue("webhook-avatar").trim(),
          "Webhook avatarı"
        );
        const kaynakKanallar = parseYoutubeChannelIds(
          componentInteraction.fields.getTextInputValue("youtube-channels")
        );
        const webhookUrl = validateDiscordWebhookUrl(
          componentInteraction.fields.getTextInputValue("webhook-url").trim()
        );

        setting = store.updateGuildSetting(guildId, draft => {
          draft.youtube.webhookName = webhookName;
          draft.youtube.webhookAvatar = webhookAvatar;
          draft.youtube.kaynakKanallar = kaynakKanallar;
          if (webhookUrl) draft.youtube.webhookUrl = webhookUrl;
        });
        await flushDatabase();
        await componentInteraction.editReply({
          ...buildNoticePayload("Webhook Ayarları Kaydedildi", `${kaynakKanallar.length} YouTube kanalı izleme listesine alındı.`), flags: PANEL_FLAGS,
        });
        return await editPanel({ notice: `${emojiler.tik} Webhook kimliği ve YouTube kaynakları güncellendi.` });
      }

      if (componentInteraction.isModalSubmit() && action === "text-modal") {
        const videoMetni = componentInteraction.fields.getTextInputValue("video-text").trim();
        const kontrolMesaj = componentInteraction.fields.getTextInputValue("submission-text").trim();
        setting = store.updateGuildSetting(guildId, draft => {
          draft.youtube.videoMetni = videoMetni;
          draft.kontrolMesaj = kontrolMesaj || null;
        });
        await flushDatabase();
        await componentInteraction.editReply({
          ...buildNoticePayload("Özel Metinler Kaydedildi", "Video bildirimi ve başvuru bilgilendirmesi güncellendi."), flags: PANEL_FLAGS,
        });
        return await editPanel({ notice: `${emojiler.tik} Özel metinler güncellendi.` });
      }

      if (componentInteraction.isStringSelectMenu() && action === "reset") {
        const target = componentInteraction.values[0];
        if (target === "all") return await interaction.editReply(buildResetConfirmationPayload(sessionId));

        setting = store.updateGuildSetting(guildId, draft => {
          if (target === "kanal") draft.kanal = null;
          if (target === "rol") draft.rol = null;
          if (target === "yetkili") draft.yetkili = null;
          if (target === "log") draft.logKanal = null;
          if (target === "webhook") {
            draft.youtube.bildirimKanal = null;
            draft.youtube.bildirimRol = null;
            draft.youtube.webhookUrl = null;
            draft.youtube.aktif = false;
          }
          if (target === "sources") {
            draft.youtube.kaynakKanallar = [];
            draft.youtube.aktif = false;
          }
          if (target === "texts") {
            draft.kontrolMesaj = null;
            draft.youtube.videoMetni = store.DEFAULT_VIDEO_TEXT;
          }
        });
        refreshSelection();
        return await editPanel({ notice: `${emojiler.tik} Seçilen ayar sıfırlandı.` });
      }

      if (!componentInteraction.isButton()) return;

      if (action === "refresh") {
        setting = store.getGuildSetting(guildId);
        refreshSelection();
        return await editPanel({ notice: "🔄 Sistem durumu yenilendi." });
      }
      if (action === "save") {
        setting = await saveSelections(interaction.guild, setting, { ...selection });
        refreshSelection();
        return await editPanel({ notice: `${emojiler.tik} Abone sistemi ayarları kaydedildi.` });
      }
      if (action === "toggle-youtube") {
        if (!setting.youtube.aktif && (!setting.youtube.webhookUrl || !setting.youtube.kaynakKanallar.length)) {
          return await componentInteraction.followUp(
            buildNoticePayload("Video Bildirimi Açılamadı", "Önce webhook'u ve en az bir YouTube kanal ID'sini ayarla.", true)
          );
        }
        setting = store.updateGuildSetting(guildId, draft => {
          draft.youtube.aktif = !draft.youtube.aktif;
        });
        return await editPanel({
          notice: `${emojiler.tik} Video bildirimleri ${setting.youtube.aktif ? "açıldı" : "kapatıldı"}.`,
        });
      }
      if (action === "cancel-reset") {
        return await editPanel({ notice: "Sıfırlama işleminden vazgeçildi." });
      }
      if (action === "confirm-reset-all") {
        store.deleteGuildSetting(guildId);
        store.resetTrackingGuild(guildId);
        setting = store.getGuildSetting(guildId);
        refreshSelection();
        return await editPanel({ notice: `${emojiler.tik} Abone sistemi ve takip kayıtları tamamen sıfırlandı.` });
      }
    } catch (error) {
      if ([10062, 40060, 10008, 10015].includes(Number(error.code))) {
        console.warn('[ABONE YÖNETİM PANELİ] Etkileşim artık yanıtlanamıyor; paneli yeniden açın. Kod:', error.code);
        return;
      }
      console.error("🔴 [ABONE YÖNETİM PANELİ]", error.message);
      const description = error.message || "İşlem sırasında beklenmeyen bir hata oluştu.";
      if (componentInteraction.deferred || componentInteraction.replied) {
        if (componentInteraction.isModalSubmit()) {
          return await componentInteraction.editReply({ ...buildNoticePayload('İşlem Tamamlanamadı', description, true), flags: PANEL_FLAGS }).catch(() => null);
        }
        if (!ownsBusy) return await componentInteraction.followUp(buildNoticePayload('İşlem Tamamlanamadı', description, true)).catch(() => null);
        return await interaction.editReply(render({ notice: `⚠️ ${description}` })).catch(() => null);
      }
      return await componentInteraction.reply(
        buildNoticePayload("İşlem Tamamlanamadı", description, true)
      ).catch(() => null);
    } finally {
      if (ownsBusy) busy = false;
    }
  };

  botClient.on("interactionCreate", listener);
  closeTimer = setTimeout(expire, PANEL_TTL);
  closeTimer.unref?.();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("abone-sistemi-ayarla")
    .setDescription("Abone sisteminin yönetim panelini açar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction, client) {
    return executePanel(interaction, client);
  },

  buildPanelPayload,
  buildTextModal,
  buildWebhookModal,
  parseYoutubeChannelIds,
};
