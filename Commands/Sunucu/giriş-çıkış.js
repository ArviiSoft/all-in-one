const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ContainerBuilder, SectionBuilder, TextDisplayBuilder, MessageFlags } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const { readGuildConfig, updateGuildConfig } = require("../../Dashboard/stores/girisCikis");

const PANEL_REPLY_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PANEL_UPDATE_FLAGS = MessageFlags.IsComponentsV2;
const SESSION_TTL = 5 * 60_000;
const DEFAULT_WELCOME_MESSAGE = "Sunucuya **hoş geldin!**";
const PANEL_ACCENT_COLOR = 0xc9a76a;

function makeId(sessionId, action) {
  return `gc:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `gc:${sessionId}:`;
  if (!customId?.startsWith(prefix)) return null;
  return customId.slice(prefix.length);
}

function isSystemEnabled(config) {
  if (!config) return false;
  if (typeof config.aktif === "boolean") return config.aktif;
  return Boolean(config.giris?.kanal || config.cikis?.kanal);
}

function channelValue(guild, channelId) {
  if (!channelId) return "`Ayarlanmadı`";
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return `\`${channelId}\``;
  return `<#${channel.id}>`;
}

function roleValue(guild, roleId) {
  if (!roleId) return "`Ayarlanmadı`";
  const role = guild.roles.cache.get(roleId);
  if (!role) return `\`${roleId}\``;
  return `<@&${role.id}>`;
}

function boolValue(value) {
  return value === "evet" ? "Evet" : "Hayır";
}

function codeValue(value, fallback = "Ayarlanmadı", max = 70) {
  const text = String(value || fallback).replace(/`/g, "'");
  return `\`${text.length > max ? `${text.slice(0, max - 1)}…` : text}\``;
}

function buildSettingSection(sessionId, action, line, disabled = false) {
  return new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(line))
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(makeId(sessionId, action))
        .setLabel("Değiştir")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled)
    );
}

function buildPanelPayload(guild, guildId, sessionId, disabled = false, ephemeral = true) {
  const config = readGuildConfig(guildId);
  const giris = config.giris || {};
  const cikis = config.cikis || {};
  const enabled = isSystemEnabled(config);

  const header = new TextDisplayBuilder().setContent(
    [
      "## Giriş-Çıkış Ayarları",
      "Düzenlemek istediğiniz ayarın yanındaki **Değiştir** butonuna tıklayın.",
    ].join("\n")
  );

  const container = new ContainerBuilder()
    .setAccentColor(PANEL_ACCENT_COLOR)
    .addTextDisplayComponents(header);

  [
    buildSettingSection(sessionId, "status", `${enabled ? `${emojiler.active}` : `${emojiler.deactive}`} **Durum:** ${enabled ? "Açık" : "Kapalı"}`, disabled),
    buildSettingSection(sessionId, "otoRol", `${emojiler.ampul} **Otorol:** ${roleValue(guild, giris.otoRol)}`, disabled),
    buildSettingSection(sessionId, "girisKanal", `${emojiler.girisok} **Hoş Geldin Kanalı:** ${channelValue(guild, giris.kanal)}`, disabled),
    buildSettingSection(sessionId, "cikisKanal", `${emojiler.cikisOk} **Güle Güle Kanalı:** ${channelValue(guild, cikis.kanal)}`, disabled),
    buildSettingSection(sessionId, "resimli", `🖼️ **Resimli mi olsun?:** ${boolValue(giris.resimli)}`, disabled),
    buildSettingSection(sessionId, "mesaj", `${emojiler.speechbubble} **Giriş Mesajı:** ${codeValue(giris.mesaj, DEFAULT_WELCOME_MESSAGE, 90)}`, disabled),
    buildSettingSection(sessionId, "hedefUye", `${emojiler.uye} **Hedef Üye:** ${giris.hedefUye ? codeValue(giris.hedefUye) : "`Yok`"}`, disabled),
  ].forEach(section => container.addSectionComponents(section));

  return {
    components: [container],
    flags: ephemeral ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
  };
}

function buildNoticePayload(title, description, isError = false, ephemeral = true) {
  const container = new ContainerBuilder()
    .setAccentColor(isError ? 0xe5484d : PANEL_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
    );

  return {
    components: [container],
    flags: ephemeral ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
  };
}

function buildSelectPromptPayload(title, description, rows, ephemeral = true) {
  const container = new ContainerBuilder()
    .setAccentColor(PANEL_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
    );

  for (const row of rows) container.addActionRowComponents(row);

  return {
    components: [container],
    flags: ephemeral ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
  };
}

function channelPrompt(sessionId, field) {
  const label = field === "girisKanal" ? "Hoş Geldin Kanalı" : "Güle Güle Kanalı";
  const select = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(sessionId, `select:${field}`))
    .setPlaceholder(`${label} seç.`)
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);

  const selectRow = new ActionRowBuilder().addComponents(select);
  const resetRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, `clear:${field}`))
      .setLabel("Sıfırla")
      .setStyle(ButtonStyle.Secondary)
  );

  return buildSelectPromptPayload(label, "Aşağıdan yeni kanalı seçebilir ya da bu ayarı sıfırlayabilirsin.", [selectRow, resetRow]);
}

function rolePrompt(sessionId) {
  const select = new RoleSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "select:otoRol"))
    .setPlaceholder("Oto-rol seç.")
    .setMinValues(1)
    .setMaxValues(1);

  const selectRow = new ActionRowBuilder().addComponents(select);
  const resetRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "clear:otoRol"))
      .setLabel("Sıfırla")
      .setStyle(ButtonStyle.Secondary)
  );

  return buildSelectPromptPayload("Otorol", "Sunucuya giren üyelere verilecek rolü seçebilir ya da bu ayarı sıfırlayabilirsin.", [selectRow, resetRow]);
}

function resimliPrompt(sessionId) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "select:resimli"))
    .setPlaceholder("Resimli giriş mesajı kullanılsın mı?")
    .addOptions(
      { label: "Evet", value: "evet" },
      { label: "Hayır", value: "hayir" }
    );

  return buildSelectPromptPayload(
    "Resimli mi olsun",
    "Giriş mesajının görselli gönderilip gönderilmeyeceğini seç.",
    [new ActionRowBuilder().addComponents(select)]
  );
}

function textModal(sessionId, currentValue) {
  const modal = new ModalBuilder()
    .setCustomId(makeId(sessionId, "modal:mesaj"))
    .setTitle("Giriş Mesajı");

  const input = new TextInputBuilder()
    .setCustomId("value")
    .setLabel("Giriş mesajı")
    .setPlaceholder("Boş bırakırsan varsayılan mesaj kullanılır. {user} yazabilirsin.")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);

  if (currentValue) input.setValue(String(currentValue).slice(0, 1000));

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function targetModal(sessionId, currentValue) {
  const modal = new ModalBuilder()
    .setCustomId(makeId(sessionId, "modal:hedefUye"))
    .setTitle("Hedef Üye");

  const input = new TextInputBuilder()
    .setCustomId("value")
    .setLabel("Hedef üye sayısı")
    .setPlaceholder("Sayı gir. Boş bırakırsan hedef üye ayarı sıfırlanır.")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(9);

  if (currentValue) input.setValue(String(currentValue).slice(0, 9));

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

async function refreshPanel(rootInteraction, guild, guildId, sessionId) {
  await rootInteraction.editReply(buildPanelPayload(guild, guildId, sessionId, false, false)).catch(() => null);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("giriş-çıkış")
    .setDescription("Giriş-çıkış sistemini panelden ayarlar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    const botClient = client || interaction.client;
    const { guild, user } = interaction;
    const guildId = guild.id;
    const sessionId = interaction.id;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(buildPanelPayload(guild, guildId, sessionId, false, false));

    let closed = false;
    let closeTimer;

    const closeSession = async (editPanel = true) => {
      if (closed) return;
      closed = true;
      clearTimeout(closeTimer);
      botClient.off("interactionCreate", listener);

      if (editPanel) {
        await interaction.editReply(buildPanelPayload(guild, guildId, sessionId, true, false)).catch(() => null);
      }
    };

    const saveAndRefresh = async (componentInteraction, title, description) => {
      await componentInteraction.update(buildNoticePayload(title, description, false, false)).catch(async () => {
        await componentInteraction.reply(buildNoticePayload(title, description)).catch(() => null);
      });
      await refreshPanel(interaction, guild, guildId, sessionId);
    };

    const listener = async (componentInteraction) => {
      const action = parseAction(componentInteraction.customId, sessionId);
      if (!action || closed) return;

      if (componentInteraction.user.id !== user.id) {
        return componentInteraction.reply(
          buildNoticePayload("**Bu panel sana ait değil**", `${emojiler.uyari} **Bu paneli sadece komutu kullanan kişi düzenleyebilir.**`, true)
        ).catch(() => null);
      }

      try {
        if (componentInteraction.isButton()) {
          if (action === "status") {
            const config = updateGuildConfig(guildId, current => {
              current.aktif = !isSystemEnabled(current);
            });
            return componentInteraction.update(buildPanelPayload(guild, guildId, sessionId, false, false))
              .then(() => componentInteraction.followUp(
                buildNoticePayload(
                  "Durum güncellendi",
                  `${emojiler.tik} Giriş-çıkış sistemi **${isSystemEnabled(config) ? "açıldı" : "kapatıldı"}**.`
                )
              ));
          }

          if (action === "otoRol") return componentInteraction.reply(rolePrompt(sessionId));
          if (action === "girisKanal" || action === "cikisKanal") return componentInteraction.reply(channelPrompt(sessionId, action));
          if (action === "resimli") return componentInteraction.reply(resimliPrompt(sessionId));

          if (action === "mesaj") {
            const config = readGuildConfig(guildId);
            return componentInteraction.showModal(textModal(sessionId, config.giris?.mesaj));
          }

          if (action === "hedefUye") {
            const config = readGuildConfig(guildId);
            return componentInteraction.showModal(targetModal(sessionId, config.giris?.hedefUye));
          }

          if (action.startsWith("clear:")) {
            const field = action.slice("clear:".length);
            if (!["otoRol", "girisKanal", "cikisKanal"].includes(field)) return;
            updateGuildConfig(guildId, config => {
              if (field === "otoRol") delete config.giris.otoRol;
              if (field === "girisKanal") delete config.giris.kanal;
              if (field === "cikisKanal") delete config.cikis.kanal;
            });

            const labels = {
              otoRol: "Otorol",
              girisKanal: "Hoş geldin kanalı",
              cikisKanal: "Güle güle kanalı",
            };

            return saveAndRefresh(
              componentInteraction,
              "Ayar sıfırlandı",
              `${emojiler.tik} ${labels[field] || "Ayar"} **sıfırlandı**.`
            );
          }
        }

        if (componentInteraction.isChannelSelectMenu() && action.startsWith("select:")) {
          const field = action.slice("select:".length);
          const selectedId = componentInteraction.values[0];

          updateGuildConfig(guildId, config => {
            if (field === "girisKanal") config.giris.kanal = selectedId;
            if (field === "cikisKanal") config.cikis.kanal = selectedId;
          });

          return saveAndRefresh(
            componentInteraction,
            "Kanal güncellendi",
            `${emojiler.tik} ${field === "girisKanal" ? "Hoş geldin" : "Güle güle"} kanalı <#${selectedId}> olarak **güncellendi**.`
          );
        }

        if (componentInteraction.isRoleSelectMenu() && action === "select:otoRol") {
          const selectedId = componentInteraction.values[0];

          updateGuildConfig(guildId, config => {
            config.giris.otoRol = selectedId;
          });

          return saveAndRefresh(
            componentInteraction,
            "Otorol güncellendi",
            `${emojiler.tik} Otorol <@&${selectedId}> olarak **güncellendi**.`
          );
        }

        if (componentInteraction.isStringSelectMenu() && action === "select:resimli") {
          const value = componentInteraction.values[0];
          if (value !== "evet" && value !== "hayir") return;

          updateGuildConfig(guildId, config => {
            config.giris.resimli = value;
          });

          return saveAndRefresh(
            componentInteraction,
            "Resimli giriş güncellendi",
            `${emojiler.tik} Resimli giriş mesajı **${value === "evet" ? "açıldı" : "kapatıldı"}**.`
          );
        }

        if (componentInteraction.isModalSubmit() && action.startsWith("modal:")) {
          const field = action.slice("modal:".length);
          const value = componentInteraction.fields.getTextInputValue("value").trim();

          if (field === "mesaj") {
            updateGuildConfig(guildId, config => {
              if (!value) delete config.giris.mesaj;
              else config.giris.mesaj = value;
            });

            await componentInteraction.reply(
              buildNoticePayload(
                "Giriş mesajı güncellendi",
                value
                  ? `${emojiler.tik} Giriş mesajı **güncellendi**.`
                  : `${emojiler.tik} Giriş mesajı varsayılana **döndürüldü**.`
              )
            );
            return refreshPanel(interaction, guild, guildId, sessionId);
          }

          if (field === "hedefUye") {
            if (value && (!/^\d+$/.test(value) || Number(value) < 1)) {
              return componentInteraction.reply(
                buildNoticePayload("Geçersiz hedef üye", `${emojiler.uyari} Hedef üye sayısı pozitif bir sayı olmalı.`, true)
              );
            }

            updateGuildConfig(guildId, config => {
              if (!value) {
                delete config.giris.hedefUye;
                delete config.cikis.hedefUye;
              } else {
                const hedefUye = Number(value);
                config.giris.hedefUye = hedefUye;
                config.cikis.hedefUye = hedefUye;
              }
            });

            await componentInteraction.reply(
              buildNoticePayload(
                "Hedef üye güncellendi",
                value
                  ? `${emojiler.tik} Hedef üye \`${Number(value)}\` olarak **güncellendi**.`
                  : `${emojiler.tik} Hedef üye ayarı **sıfırlandı**.`
              )
            );
            return refreshPanel(interaction, guild, guildId, sessionId);
          }
        }
      } catch (err) {
        console.error("🔴 [GİRİŞ-ÇIKIŞ PANEL HATASI]", err);
        const payload = buildNoticePayload("İşlem başarısız", `${emojiler.uyari} Ayar güncellenirken hata oluştu. Konsolu kontrol et.`, true);
        if (componentInteraction.replied || componentInteraction.deferred) {
          await componentInteraction.followUp(payload).catch(() => null);
        } else {
          await componentInteraction.reply(payload).catch(() => null);
        }
      }
    };

    botClient.on("interactionCreate", listener);
    closeTimer = setTimeout(() => closeSession(true), SESSION_TTL);
  },
};
