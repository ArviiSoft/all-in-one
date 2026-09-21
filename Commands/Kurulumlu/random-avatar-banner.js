const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { setRandomMediaChannel, clearRandomMediaChannel } = require("../../Utils/Media/randomMediaScheduler");
const { MIN_INTERVAL_MS, MAX_TIMESTAMP_MS, parseRandomMediaDuration, formatRandomMediaDuration } = require("../../Utils/Media/randomMediaDuration");

function addDurationOption(option) {
  return option
    .setName("süre")
    .setDescription("Gönderim aralığı (Varsayılan 10 dakika). Örnek: 1 gün, 2 hafta, 3 ay, 1 yıl. ")
    .setMaxLength(100)
    .setRequired(false);
}

function hasChannelPermissions(channel, botMember) {
  const permissions = channel.permissionsFor(botMember);
  return permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.AttachFiles,
  ]);
}

async function setupRandomMedia(interaction, type) {
  const channel = interaction.options.getChannel("kanal");
  const botMember = interaction.guild.members.me;
  const durationInput = interaction.options.getString("süre");
  const intervalMs = durationInput === null
    ? MIN_INTERVAL_MS
    : parseRandomMediaDuration(durationInput);

  if (intervalMs === null) {
    return interaction.reply({
      content: `${emojiler.uyari} **Geçerli bir süre gir.** En az **10 dakika**, en fazla **${formatRandomMediaDuration(MAX_TIMESTAMP_MS - Date.now())}** olabilir.\nÖrnek: \`10 dakika\`, \`1 gün\`, \`2 hafta\`, \`3 ay\`, \`1 yıl\`, \`1 gün 2 saat\`.`,
      flags: 64,
    });
  }

  if (!hasChannelPermissions(channel, botMember)) {
    return interaction.reply({
      content: `${emojiler.uyari} **Seçilen kanalda botun Görüntüle, Mesaj Gönder ve Dosya Ekle izinleri olmalı.**`,
      flags: 64,
    });
  }

  setRandomMediaChannel(interaction.guild.id, type, channel.id, intervalMs);

  return interaction.reply({
    content: `${emojiler.tik} Random **${type === "banner" ? "banner" : "avatar"}** gönderimi **( ${channel} )** kanalına ayarlandı.\n${emojiler.donensaat} **Gönderim aralığı:** ${formatRandomMediaDuration(intervalMs)}\nİlk gönderim bu süre dolduğunda yapılır.`,
    flags: 64,
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("random")
    .setDescription("Random avatar/banner sistemini ayarlar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("icon")
        .setDescription("Random avatarların gönderileceği kanalı ayarlar.")
        .addChannelOption((option) =>
          option
            .setName("kanal")
            .setDescription("Kanal seç.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addStringOption(addDurationOption)
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("banner")
        .setDescription("Random bannerların gönderileceği kanalı ayarlar.")
        .addChannelOption((option) =>
          option
            .setName("kanal")
            .setDescription("Kanal seç.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addStringOption(addDurationOption)
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("kapat")
        .setDescription("Random avatar/banner gönderimini kapatır.")
        .addStringOption((option) =>
          option
            .setName("tur")
            .setDescription("Tür seç.")
            .setRequired(true)
            .addChoices(
              { name: "Icon", value: "icon" },
              { name: "Banner", value: "banner" }
            )
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "icon" || subcommand === "banner") {
      return setupRandomMedia(interaction, subcommand);
    }

    if (subcommand === "kapat") {
      const type = interaction.options.getString("tur");
      clearRandomMediaChannel(interaction.guild.id, type);

      return interaction.reply({
        content: `${emojiler.tik} Random **${type === "banner" ? "banner" : "avatar"}** gönderimi kapatıldı.`,
        flags: 64,
      });
    }
  },
};
