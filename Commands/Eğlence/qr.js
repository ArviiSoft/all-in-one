const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, escapeCodeBlock } = require("discord.js");
const Jimp = require("jimp");
const QRCode = require("qrcode");
const QrCodeReader = require("qrcode-reader");
const emojiler = require("../../Utils/Emojis/emojiler.js");

function decodeQr(bitmap) {
  return new Promise((resolve, reject) => {
    const reader = new QrCodeReader();

    reader.callback = (error, result) => {
      if (error || !result?.result) return resolve(null);
      return resolve(result.result);
    };

    try {
      reader.decode(bitmap);
    } catch (error) {
      reject(error);
    }
  });
}

async function createQr(interaction) {
  const text = interaction.options.getString("metin", true);
  await interaction.deferReply({ flags: 64 });

  try {
    const qrBuffer = await QRCode.toBuffer(text, { type: "png" });
    const attachment = new AttachmentBuilder(qrBuffer, { name: "qr.png" });

    await interaction.editReply({ files: [attachment] });

    const reply = await interaction.fetchReply();
    const fileUrl = reply.attachments.first()?.url;

    if (fileUrl) {
      const downloadButton = new ButtonBuilder()
        .setLabel("QR'ı İndir")
        .setStyle(ButtonStyle.Link)
        .setURL(fileUrl);
      const row = new ActionRowBuilder().addComponents(downloadButton);

      await interaction.editReply({ components: [row] });
    }
  } catch (error) {
    console.error("🔴 [QR OLUŞTUR] QR kod oluşturulurken hata oluştu:", error);
    await interaction.editReply({
      content: `${emojiler.uyari} **QR kod oluşturulurken hata oluştu.**`,
      components: [],
      files: [],
    });
  }
}

async function readQr(interaction) {
  const attachment = interaction.options.getAttachment("resim", true);

  if (!attachment.contentType?.startsWith("image/")) {
    return interaction.reply({
      content: `${emojiler.uyari} **Geçerli bir görsel yükle.**`,
      flags: 64,
    });
  }

  await interaction.deferReply({ flags: 64 });

  try {
    const image = await Jimp.read(attachment.url);
    const result = await decodeQr(image.bitmap);

    if (!result) {
      return interaction.editReply({
        content: `${emojiler.uyari} **QR kod okunamadı. Daha net bir resim dener misin?**`,
      });
    }

    const escapedResult = escapeCodeBlock(result);
    const content = `\`\`\`\n${escapedResult}\n\`\`\``;

    if (content.length <= 2000) {
      return interaction.editReply({
        content,
        allowedMentions: { parse: [] },
      });
    }

    const resultFile = new AttachmentBuilder(Buffer.from(result, "utf8"), {
      name: "qr-icerigi.txt",
    });

    return interaction.editReply({
      content: "**QR kod içeriği:**",
      files: [resultFile],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error("🔴 [QR OKUT] QR kod okunurken hata oluştu:", error);
    return interaction.editReply({
      content: `${emojiler.uyari} **QR kod okunurken hata oluştu.**`,
    });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("qr")
    .setDescription("QR kod oluşturur veya görseldeki QR kodu okur.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("oluştur")
        .setDescription("Metinden QR kod oluşturur.")
        .addStringOption((option) =>
          option
            .setName("metin")
            .setDescription("QR koda dönüştürülecek metni gir.")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("okut")
        .setDescription("Görseldeki QR kodu okur.")
        .addAttachmentOption((option) =>
          option
            .setName("resim")
            .setDescription("QR kod içeren görseli yükle.")
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "oluştur") return createQr(interaction);
    if (subcommand === "okut") return readQr(interaction);
  },
};
