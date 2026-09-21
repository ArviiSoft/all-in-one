const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ContainerBuilder, MessageFlags, PermissionFlagsBits, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, TextDisplayBuilder, ThumbnailBuilder, escapeMarkdown } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const ACCENT_COLOR = 0xffc403;
const PAGE_SIZE = 10;
const COLLECTOR_TIME = 120_000;

function makeButtonId(sessionId, action) {
  return `ban-list:${sessionId}:${action}`;
}

function safeCode(value) {
  return `\`${String(value).replace(/[`\r\n]/g, "'")}\``;
}

function buildPaginationRow(sessionId, page, pageCount, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(makeButtonId(sessionId, "previous"))
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page === 0),
    new ButtonBuilder()
      .setCustomId(makeButtonId(sessionId, "page"))
      .setLabel(`${page + 1}/${pageCount}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(makeButtonId(sessionId, "next"))
      .setEmoji("➡️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page === pageCount - 1)
  );
}

function buildBanListContainer(guild, bannedUsers, requestedPage, sessionId, disabled = false) {
  const pageCount = Math.max(1, Math.ceil(bannedUsers.length / PAGE_SIZE));
  const page = Math.min(Math.max(Number(requestedPage) || 0, 0), pageCount - 1);
  const pageUsers = bannedUsers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const headerContent = [
    `## ${escapeMarkdown(guild.name)} ban listesi`,
    bannedUsers.length > 0
      ? `Sunucuda toplam **${bannedUsers.length}** yasaklı kullanıcı var.`
      : "Sunucuda yasaklı kimse bulunmuyor.",
  ].join("\n");
  const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR);
  const guildIcon = guild.iconURL({ extension: "png", size: 256 });

  if (guildIcon) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerContent))
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(guildIcon)
        )
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerContent));
  }

  if (pageUsers.length > 0) {
    const start = page * PAGE_SIZE;
    const userRows = pageUsers
      .map((username, index) => `\`${start + index + 1}.\` ${safeCode(username)}`)
      .join("\n");

    container
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(SeparatorSpacingSize.Small)
          .setDivider(true)
      )
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(userRows));
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true)
    )
    .addActionRowComponents(buildPaginationRow(sessionId, page, pageCount, disabled));

  return container;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ban-liste")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDescription("Yasaklanan kişileri listeler."),

  async execute(interaction) {
    const { guild } = interaction;
    const sessionId = interaction.id;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let bans;
    try {
      bans = await guild.bans.fetch();
    } catch (err) {
      console.error("🔴 [BAN LİSTESİ] Ban listesi alınamadı:", err);
      return interaction.editReply({ content: `${emojiler.uyari} **Ban listesi alınamadı.**` });
    }

    const bannedUsers = bans.map(ban => ban.user.username);
    let currentPage = 0;

    const message = await interaction.editReply({
      components: [buildBanListContainer(guild, bannedUsers, currentPage, sessionId)],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: COLLECTOR_TIME,
    });

    collector.on("collect", async buttonInteraction => {
      if (buttonInteraction.user.id !== interaction.user.id) {
        return buttonInteraction.reply({
          content: `${emojiler.uyari} **Bu butonları sadece komutu kullanan kişi kullanabilir.**`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const pageCount = Math.max(1, Math.ceil(bannedUsers.length / PAGE_SIZE));

      if (buttonInteraction.customId === makeButtonId(sessionId, "previous") && currentPage > 0) {
        currentPage -= 1;
      } else if (buttonInteraction.customId === makeButtonId(sessionId, "next") && currentPage < pageCount - 1) {
        currentPage += 1;
      } else {
        return buttonInteraction.deferUpdate();
      }

      await buttonInteraction.update({
        components: [buildBanListContainer(guild, bannedUsers, currentPage, sessionId)],
        allowedMentions: { parse: [] },
      });
    });

    collector.on("end", async () => {
      await interaction.editReply({
        components: [buildBanListContainer(guild, bannedUsers, currentPage, sessionId, true)],
        allowedMentions: { parse: [] },
      }).catch(() => null);
    });
  },
};