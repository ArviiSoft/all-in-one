const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, TextDisplayBuilder, ThumbnailBuilder } = require("discord.js");
const ayarlar = require('../../Utils/Core/generalSettings').settings;
const { version: discordjsVersion } = require("discord.js");
const { version: botVersion } = require("../../package.json");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const ACCENT_COLOR = 0x6d5dfc;
const ERROR_COLOR = 0xed4245;
const COLLECTOR_TIME = 3 * 60_000;
const V2_FLAGS = MessageFlags.IsComponentsV2;
const PRIVATE_V2_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

const { collectMetrics } = require("../../Utils/Core/botMetrics");

function inlineCode(value) {
  return `\`${String(value).replace(/`/g, "'")}\``;
}

function timestamp(value, style = "D") {
  const milliseconds = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return inlineCode("Bilinmiyor");
  return `<t:${Math.floor(milliseconds / 1000)}:${style}>`;
}

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function buildDashboard(client, metrics, sessionId, disabled = false) {
  const apiPing = metrics.apiPing === null ? "Bekleniyor" : `${metrics.apiPing} ms`;
  const responseLatency = Number.isFinite(metrics.responseLatency)
    ? `${metrics.responseLatency} ms`
    : "Bilinmiyor";
  const cpuUsage = metrics.cpuUsage === null ? "Ölçülemedi" : `%${metrics.cpuUsage.toFixed(1)}`;
  const connectionStatus = metrics.apiPing === null ? "🟠 Bağlantı bekleniyor" : "🟢 Bağlantı aktif";

  const header = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## ${client.user.username}`,
        `${connectionStatus}  •  **Sürüm** ${inlineCode(`v${botVersion}`)}`,
      ].join("\n"))
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(client.user.displayAvatarURL({ size: 256 }))
    );

  const overview = new TextDisplayBuilder().setContent([
    "### Genel Bakış",
    `🏠 **Sunucular** ${inlineCode(metrics.guildCount)}  •  👥 **Kullanıcılar** ${inlineCode(metrics.userCount)}  •  🧭 **Komutlar** ${inlineCode(metrics.commandCount)}`,
    `🎂 ${timestamp(client.user.createdTimestamp)}  •  📥 **Katıldı:** ${timestamp(metrics.joinedAt, "R")}`,
  ].join("\n"));

  const telemetry = new TextDisplayBuilder().setContent([
    "### Canlı Telemetri",
    `🧠 **Bellek** ${inlineCode(metrics.memoryUsage)}  •  ⚙️ **CPU** ${inlineCode(cpuUsage)}`,
    `📡 **WebSocket** ${inlineCode(apiPing)}  •  ⚡ **Yanıt** ${inlineCode(responseLatency)}`,
    `⏱️ **Bot çalışma süresi** ${inlineCode(metrics.botUptime)}`,
  ].join("\n"));

  const footer = new TextDisplayBuilder().setContent(
    `-# Node.js ${process.version}  •  discord.js v${discordjsVersion}  •  Son ölçüm <t:${metrics.collectedAt}:T>  •  ID ${client.user.id}`
  );

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`botinfo:${sessionId}:commands`)
      .setLabel("Komutlar")
      .setEmoji("🧭")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`botinfo:${sessionId}:system`)
      .setLabel("Sistem")
      .setEmoji(`${emojiler.system}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`botinfo:${sessionId}:developer`)
      .setLabel("Geliştirici")
      .setEmoji(`${emojiler.crown}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`botinfo:${sessionId}:refresh`)
      .setLabel("Yenile")
      .setEmoji(`${emojiler.yukleniyor}`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled)
  );

  return new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addSectionComponents(header)
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(overview)
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(telemetry)
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(footer)
    .addActionRowComponents(actions);
}

function buildCommandsPayload(client) {
  const commandNames = Array.from(client.commands?.keys?.() || [])
    .filter(Boolean)
    .slice(0, 10)
    .map((name) => inlineCode(`/${name}`));
  const commands = commandNames.length ? commandNames.join("  ") : inlineCode("Komut bulunamadı");

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "## 🧭 Komut Merkezi",
        `Toplam **${client.commands?.size || 0} komut** kullanıma hazır.`,
        "### Kısa Liste",
        commands,
        "-# Discord'un / menüsünü açarak tüm komutları ve açıklamalarını görebilirsin.",
      ].join("\n"))
    );

  return { components: [container], flags: PRIVATE_V2_FLAGS };
}

function buildSystemPayload(metrics) {
  const cpuUsage = metrics.cpuUsage === null ? "Ölçülemedi" : `%${metrics.cpuUsage.toFixed(1)}`;
  const apiPing = metrics.apiPing === null ? "Bekleniyor" : `${metrics.apiPing} ms`;

  const container = new ContainerBuilder()
    .setAccentColor(0x2fba72)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## ${emojiler.system} Sistem Ayrıntıları`,
        "### Host",
        `**Sistem** ${inlineCode(`${metrics.osType} • ${metrics.osPlatform}/${metrics.osArch}`)}`,
        `**İşlemci** ${inlineCode(metrics.cpuModel)}`,
        `**Çekirdek** ${inlineCode(metrics.cpuCores)}  •  **Host uptime** ${inlineCode(metrics.hostUptime)}`,
      ].join("\n"))
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### Runtime",
        `**Bellek** ${inlineCode(metrics.memoryUsage)}  •  **CPU** ${inlineCode(cpuUsage)}`,
        `**WebSocket** ${inlineCode(apiPing)}  •  **Bot uptime** ${inlineCode(metrics.botUptime)}`,
        `**Node.js** ${inlineCode(process.version)}  •  **discord.js** ${inlineCode(`v${discordjsVersion}`)}`,
        `-# Ölçüm zamanı: <t:${metrics.collectedAt}:F>`,
      ].join("\n"))
    );

  return { components: [container], flags: PRIVATE_V2_FLAGS };
}

function buildDeveloperComponents(developer, developerId) {
  const avatar = developer.displayAvatarURL({ size: 256 });
  const accentColor = developer.accentColor || ACCENT_COLOR;
  const displayName = developer.globalName || developer.username;

  const header = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## ${emojiler.crown} Geliştirici`,
        `**${displayName}**  •  ${inlineCode(developer.tag)}`,
      ].join("\n"))
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(avatar)
    );

  const profileButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Profili Aç")
      .setEmoji(`${emojiler.uye}`)
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/users/${developerId}`)
  );

  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addSectionComponents(header)
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `🎂 ${timestamp(developer.createdTimestamp)}  •  ${timestamp(developer.createdTimestamp, "R")}`,
        `🆔 ${inlineCode(developerId)}`,
      ].join("\n"))
    )
    .addActionRowComponents(profileButton);

  return [container];
}

function buildNoticePayload(title, description, isError = false) {
  const container = new ContainerBuilder()
    .setAccentColor(isError ? ERROR_COLOR : ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
    );

  return { components: [container], flags: PRIVATE_V2_FLAGS };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("bot-bilgi")
    .setDescription("Botun canlı durumunu ve sistem bilgilerini gösterir."),

  async execute(interaction, client) {
    const responseLatency = Math.max(0, Date.now() - interaction.createdTimestamp);
    const sessionId = interaction.id;
    const customIdPrefix = `botinfo:${sessionId}:`;

    await interaction.deferReply();

    let latestMetrics = await collectMetrics(interaction, client, responseLatency);
    const message = await interaction.editReply({
      components: [buildDashboard(client, latestMetrics, sessionId)],
      flags: V2_FLAGS,
    });

    const collector = message.createMessageComponentCollector({ time: COLLECTOR_TIME });

    collector.on("collect", async (componentInteraction) => {
      if (!componentInteraction.customId.startsWith(customIdPrefix)) return;

      if (componentInteraction.user.id !== interaction.user.id) {
        await componentInteraction.reply(
          buildNoticePayload("🔒 Bu panel sana ait değil", "Kendi panelini açmak için `/bot-bilgi` komutunu kullan.", true)
        ).catch(() => {});
        return;
      }

      const action = componentInteraction.customId.slice(customIdPrefix.length);

      try {
        if (action === "refresh") {
          await componentInteraction.deferUpdate();
          latestMetrics = await collectMetrics(interaction, client, responseLatency);
          await componentInteraction.editReply({
            components: [buildDashboard(client, latestMetrics, sessionId)],
            flags: V2_FLAGS,
          });
          return;
        }

        if (action === "commands") {
          await componentInteraction.reply(buildCommandsPayload(client));
          return;
        }

        if (action === "system") {
          await componentInteraction.reply(buildSystemPayload(latestMetrics));
          return;
        }

        if (action === "developer") {
          await componentInteraction.deferReply({ flags: MessageFlags.Ephemeral });

          try {
            const developerId = String(ayarlar.sahipID);
            const developer = await client.users.fetch(developerId, { force: true });
            await componentInteraction.editReply({
              components: buildDeveloperComponents(developer, developerId),
              flags: V2_FLAGS,
            });
          } catch (error) {
            console.error("🔴 [BOT BİLGİ] Geliştirici bilgisi alınamadı:", error);
            const payload = buildNoticePayload("⚠️ Bilgi alınamadı", "Geliştirici profili şu anda yüklenemiyor.", true);
            await componentInteraction.editReply({ components: payload.components, flags: V2_FLAGS });
          }
        }
      } catch (error) {
        console.error("🔴 [BOT BİLGİ] Etkileşim işlenemedi:", error);

        if (!componentInteraction.deferred && !componentInteraction.replied) {
          await componentInteraction.reply(
            buildNoticePayload("⚠️ Bir sorun oluştu", "Bu işlem şu anda tamamlanamadı. Biraz sonra tekrar dene.", true)
          ).catch(() => {});
        }
      }
    });

    collector.on("end", async () => {
      await message.edit({
        components: [buildDashboard(client, latestMetrics, sessionId, true)],
        flags: V2_FLAGS,
      }).catch(() => {});
    });
  },
};
