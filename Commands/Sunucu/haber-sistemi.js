"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, LabelBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, RoleSelectMenuBuilder, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, ThumbnailBuilder } = require("discord.js");
const path = require("path");
const { readJson, writeJson } = require("../../Utils/Core/fileDB");

const DB_PATH = path.join(
  __dirname,
  "../../Database/Bildirimler ve Sosyal Medya/haberSistemi.json"
);
const SESSION_TTL = 10 * 60_000;
const PANEL_FLAGS = MessageFlags.IsComponentsV2;
const PRIVATE_PANEL_FLAGS = PANEL_FLAGS | MessageFlags.Ephemeral;
const ACTIVE_COLOR = 0x57f287;
const PENDING_COLOR = 0xfee75c;
const EDITING_COLOR = 0x5865f2;
const ERROR_COLOR = 0xed4245;
const emojiler = require("../../Utils/Emojis/emojiler.js");

function loadData() {
  const data = readJson(DB_PATH, {});
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

function normalizeConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { kanal: null, rol: null, url: null, sonHaberler: [] };
  }

  return {
    kanal: typeof config.kanal === "string" ? config.kanal : null,
    rol: typeof config.rol === "string" ? config.rol : null,
    url: typeof config.url === "string" ? config.url : null,
    sonHaberler: Array.isArray(config.sonHaberler)
      ? config.sonHaberler.filter(item => typeof item === "string")
      : [],
  };
}

function getGuildConfig(guildId) {
  return normalizeConfig(loadData()[guildId]);
}

function saveGuildConfig(guildId, config) {
  const data = loadData();
  data[guildId] = normalizeConfig(config);
  writeJson(DB_PATH, data);
  return normalizeConfig(data[guildId]);
}

function resetGuildConfig(guildId) {
  const data = loadData();
  const existed = Object.prototype.hasOwnProperty.call(data, guildId);
  if (existed) {
    delete data[guildId];
    writeJson(DB_PATH, data);
  }
  return existed;
}

function draftFromConfig(config) {
  return {
    kanal: config.kanal,
    rol: config.rol,
    url: config.url,
  };
}

function isConfigured(config) {
  return Boolean(config.kanal && config.url);
}

function hasChanges(config, draft) {
  return config.kanal !== draft.kanal
    || config.rol !== draft.rol
    || config.url !== draft.url;
}

function makeId(sessionId, action) {
  return `haber:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `haber:${sessionId}:`;
  return customId?.startsWith(prefix) ? customId.slice(prefix.length) : null;
}

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function channelLabel(channelId, guild) {
  if (!channelId) return "`Seçilmedi`";
  return guild.channels.cache.has(channelId)
    ? `<#${channelId}>`
    : `Silinmiş kanal (\`${channelId}\`)`;
}

function roleLabel(roleId, guild) {
  if (!roleId) return "`Etiket kapalı`";
  return guild.roles.cache.has(roleId)
    ? `<@&${roleId}>`
    : `Silinmiş rol (\`${roleId}\`)`;
}

function codeValue(value, maxLength = 160) {
  if (!value) return "`Ayarlanmadı`";
  const clean = String(value)
    .replace(/`/g, "'")
    .replace(/\r?\n/g, " ")
    .trim();
  const shortened = clean.length > maxLength
    ? `${clean.slice(0, maxLength - 1)}…`
    : clean;
  return `\`${shortened}\``;
}

function createChannelSelect(sessionId, draft, guild, disabled) {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "channel"))
    .setPlaceholder("Haberlerin gönderileceği kanalı seç")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);

  if (draft.kanal && guild.channels.cache.has(draft.kanal)) {
    select.setDefaultChannels(draft.kanal);
  }
  return select;
}

function createRoleSelect(sessionId, draft, guild, disabled) {
  const select = new RoleSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "role"))
    .setPlaceholder("İsteğe bağlı bildirim rolünü seç")
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);

  if (draft.rol && guild.roles.cache.has(draft.rol)) {
    select.setDefaultRoles(draft.rol);
  }
  return select;
}

function buildPanelPayload({
  guild,
  savedConfig,
  draft,
  sessionId,
  disabled = false,
  ephemeral = false,
  notice = null,
}) {
  const configured = isConfigured(savedConfig);
  const draftComplete = isConfigured(draft);
  const changed = hasChanges(savedConfig, draft);
  const historyCount = savedConfig.sonHaberler.length;

  let status;
  if (changed) {
    status = "🟡 **Kaydedilmemiş değişiklikler var.**";
  } else if (configured) {
    status = "🟢 **Aktif** — RSS akışı 10 dakikada bir kontrol ediliyor.";
  } else {
    status = "🟠 **Kurulum bekliyor** - kanal ve RSS kaynağını ayarla.";
  }

  const accentColor = notice?.error
    ? ERROR_COLOR
    : changed
      ? EDITING_COLOR
      : configured
        ? ACTIVE_COLOR
        : PENDING_COLOR;

  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            "## 📰 Haber Sistemi",
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
        status,
        `**Takip geçmişi:** ${historyCount ? `\`${historyCount} haber\`` : "`Henüz haber yok`"}`,
      ].join("\n"))
    );

  if (notice) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> ${notice.error ? (emojiler.carpi || "❌") : (emojiler.tik || "✅")} ${notice.text}`
      )
    );
  }

  container
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### 1 · Yayın Hedefi",
        `**Haber kanalı:** ${channelLabel(draft.kanal, guild)}`,
        `**Bildirim rolü:** ${roleLabel(draft.rol, guild)}`,
        "-# Rol seçimi isteğe bağlıdır. Seçilen rol her yeni haberde etiketlenir.",
      ].join("\n"))
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        createChannelSelect(sessionId, draft, guild, disabled)
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        createRoleSelect(sessionId, draft, guild, disabled)
      )
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**Rol etiketi kullanma** \n-# Haberler rol pingi olmadan gönderilir.`
          )
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(makeId(sessionId, "clear-role"))
            .setLabel("Rolü Kaldır")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || !draft.rol)
        )
    )
    .addSeparatorComponents(separator())
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            "### 2 · RSS Haber Kaynağı",
            `**Akış URL'si:** ${codeValue(draft.url)}`,
            "-# RSS veya Atom akışının doğrudan bağlantısını gir.",
          ].join("\n"))
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(makeId(sessionId, "edit-url"))
            .setLabel(draft.url ? "URL'yi Düzenle" : "URL Ekle")
            .setEmoji("🔗")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled)
        )
    )
    .addSeparatorComponents(separator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "save"))
          .setLabel(configured ? "Değişiklikleri Kaydet" : "Sistemi Etkinleştir")
          .setEmoji("💾")
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled || !changed || !draftComplete),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "refresh"))
          .setLabel("Yenile")
          .setEmoji(emojiler.yukleniyor || "🔄")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "reset"))
          .setLabel("Sıfırla")
          .setEmoji(emojiler.cop || "🗑️")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled || !configured)
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        disabled
          ? "-# 🔒 Yönetim oturumunun süresi doldu. Yeni panel için /haber-sistemi komutunu kullan."
          : changed && !draftComplete
            ? "-# Kanal ve RSS URL'si tamamlandığında değişiklikleri kaydedebilirsin."
            : changed
              ? "-# Seçimlerin taslakta. Uygulamak için 'Değişiklikleri Kaydet' butonuna bas."
              : "-# Panel 10 dakika kullanılabilir · Yenile, kaydedilmemiş seçimleri geri alır."
      )
    );

  return {
    components: [container],
    flags: ephemeral ? PRIVATE_PANEL_FLAGS : PANEL_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildUrlModal(sessionId, currentUrl) {
  const input = new TextInputBuilder()
    .setCustomId("url")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://orneksite.com/rss.xml")
    .setRequired(true)
    .setMinLength(8)
    .setMaxLength(1000);

  if (currentUrl) input.setValue(currentUrl.slice(0, 1000));

  return new ModalBuilder()
    .setCustomId(makeId(sessionId, "url-modal"))
    .setTitle("RSS Haber Kaynağı")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("RSS veya Atom akış URL'si")
        .setDescription("Haberlerin okunacağı doğrudan HTTP(S) bağlantısı.")
        .setTextInputComponent(input)
    );
}

function buildResetConfirmationPayload(sessionId) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(ERROR_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            "## ⚠️ Haber Sistemini Sıfırla",
            "- Kanal, bildirim rolü, RSS URL'si ve gönderilmiş haber geçmişi silinecek.",
            "",
            "**Bu işlem geri alınamaz. Devam edilsin mi?**",
          ].join("\n"))
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, "reset-confirm"))
              .setLabel("Evet, sistemi sıfırla")
              .setEmoji(emojiler.cop || "🗑️")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, "reset-cancel"))
              .setLabel("Vazgeç")
              .setStyle(ButtonStyle.Secondary)
          )
        ),
    ],
    flags: PANEL_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildNoticePayload(title, description, error = false) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(error ? ERROR_COLOR : ACTIVE_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
        ),
    ],
    flags: PRIVATE_PANEL_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function validateUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    throw new Error("RSS URL'si geçerli bir HTTP veya HTTPS bağlantısı olmalı.");
  }
}

async function validateDraft(guild, draft) {
  if (!draft.kanal || !draft.url) {
    throw new Error("Haber kanalı ve RSS URL'si ayarlanmadan sistem etkinleştirilemez.");
  }

  const channel = await guild.channels.fetch(draft.kanal).catch(() => null);
  if (
    !channel
    || (channel.type !== ChannelType.GuildText
      && channel.type !== ChannelType.GuildAnnouncement)
  ) {
    throw new Error("Seçilen haber kanalı artık kullanılamıyor.");
  }

  const botMember = guild.members.me;
  const requiredPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ];
  if (!botMember || !channel.permissionsFor(botMember)?.has(requiredPermissions)) {
    throw new Error(
      "Botun haber kanalında Kanalı Görüntüle, Mesaj Gönder ve Bağlantı Yerleştir izinleri olmalı."
    );
  }

  if (draft.rol) {
    const role = await guild.roles.fetch(draft.rol).catch(() => null);
    if (!role) throw new Error("Seçilen bildirim rolü artık kullanılamıyor.");
  }

  return {
    kanal: channel.id,
    rol: draft.rol,
    url: validateUrl(draft.url),
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("haber-sistemi")
    .setDescription("Haber sistemini ayarlar.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    const botClient = client || interaction.client;
    const { guild, user } = interaction;
    const sessionId = interaction.id;

    let savedConfig = getGuildConfig(guild.id);
    let draft = draftFromConfig(savedConfig);
    let closed = false;
    let closeTimer;

    const panelPayload = (options = {}) => buildPanelPayload({
      guild,
      savedConfig,
      draft,
      sessionId,
      ...options,
    });

    await interaction.reply(panelPayload({ ephemeral: true }));

    const closeSession = async () => {
      if (closed) return;
      closed = true;
      clearTimeout(closeTimer);
      botClient.off("interactionCreate", listener);
      await interaction.editReply(panelPayload({ disabled: true })).catch(() => null);
    };

    const listener = async componentInteraction => {
      const action = parseAction(componentInteraction.customId, sessionId);
      if (!action || closed) return;

      if (componentInteraction.user.id !== user.id) {
        return componentInteraction.reply(
          buildNoticePayload(
            "Bu panel sana ait değil",
            "Bu paneli yalnızca komutu kullanan yönetici düzenleyebilir.",
            true
          )
        ).catch(() => null);
      }

      try {
        if (componentInteraction.isChannelSelectMenu() && action === "channel") {
          draft.kanal = componentInteraction.values[0];
          return componentInteraction.update(panelPayload());
        }

        if (componentInteraction.isRoleSelectMenu() && action === "role") {
          draft.rol = componentInteraction.values[0];
          return componentInteraction.update(panelPayload());
        }

        if (componentInteraction.isModalSubmit() && action === "url-modal") {
          const value = componentInteraction.fields.getTextInputValue("url").trim();
          try {
            draft.url = validateUrl(value);
          } catch (error) {
            return componentInteraction.update(panelPayload({
              notice: { text: error.message, error: true },
            }));
          }
          return componentInteraction.update(panelPayload({
            notice: { text: "RSS URL'si taslağa eklendi. Kaydettiğinde etkinleşecek." },
          }));
        }

        if (!componentInteraction.isButton()) return;

        if (action === "edit-url") {
          return componentInteraction.showModal(buildUrlModal(sessionId, draft.url));
        }

        if (action === "clear-role") {
          draft.rol = null;
          return componentInteraction.update(panelPayload({
            notice: { text: "Bildirim rolü taslaktan kaldırıldı." },
          }));
        }

        if (action === "refresh") {
          savedConfig = getGuildConfig(guild.id);
          draft = draftFromConfig(savedConfig);
          return componentInteraction.update(panelPayload({
            notice: { text: "Kayıtlı ayarlar yeniden yüklendi." },
          }));
        }

        if (action === "reset") {
          return componentInteraction.update(buildResetConfirmationPayload(sessionId));
        }

        if (action === "reset-cancel") {
          return componentInteraction.update(panelPayload());
        }

        if (action === "reset-confirm") {
          resetGuildConfig(guild.id);
          savedConfig = getGuildConfig(guild.id);
          draft = draftFromConfig(savedConfig);
          return componentInteraction.update(panelPayload({
            notice: { text: "Haber sistemi ve takip geçmişi sıfırlandı." },
          }));
        }

        if (action === "save") {
          await componentInteraction.deferUpdate();

          try {
            const validated = await validateDraft(guild, draft);
            const latestConfig = getGuildConfig(guild.id);
            const urlChanged = latestConfig.url !== validated.url;

            savedConfig = saveGuildConfig(guild.id, {
              ...validated,
              sonHaberler: urlChanged ? [] : latestConfig.sonHaberler,
            });
            draft = draftFromConfig(savedConfig);

            return interaction.editReply(panelPayload({
              notice: {
                text: urlChanged
                  ? "Ayarlar kaydedildi. Yeni RSS kaynağı için takip geçmişi temizlendi."
                  : "Haber sistemi ayarları kaydedildi.",
              },
            }));
          } catch (error) {
            return interaction.editReply(panelPayload({
              notice: { text: error.message, error: true },
            }));
          }
        }
      } catch (error) {
        console.error("🔴 [HABER SİSTEMİ PANEL HATASI]", error);

        if (componentInteraction.deferred) {
          return interaction.editReply(panelPayload({
            notice: { text: "Ayar güncellenirken bir hata oluştu.", error: true },
          })).catch(() => null);
        }

        if (componentInteraction.replied) {
          return componentInteraction.followUp(
            buildNoticePayload(
              "İşlem başarısız",
              "Ayar güncellenirken bir hata oluştu.",
              true
            )
          ).catch(() => null);
        }

        return componentInteraction.reply(
          buildNoticePayload(
            "İşlem başarısız",
            "Ayar güncellenirken bir hata oluştu.",
            true
          )
        ).catch(() => null);
      }
    };

    botClient.on("interactionCreate", listener);
    closeTimer = setTimeout(closeSession, SESSION_TTL);
  },
};
