const { ComponentType, SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, MediaGalleryBuilder, MediaGalleryItemBuilder } = require("discord.js");
const fs = require("../../Utils/Core/databaseFs");
const path = require("path");
const ayarlar = require('../../Utils/Core/generalSettings').settings;
const emojiler = require("../../Utils/Emojis/emojiler.js");
const veriYolu = path.join(__dirname, "../../Database/Sistem/yardımEmbed.json");

const V2_FLAGS = MessageFlags.IsComponentsV2;
const PRIVATE_V2_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const ACCENT_COLOR = 0x00ff3c;

function veriOku(key) {
  if (!fs.existsSync(veriYolu)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(veriYolu, "utf8"));
    const [anahtar, altAnahtar] = key.split(".");
    return data[anahtar]?.[altAnahtar] || null;
  } catch {
    return null;
  }
}

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function truncate(text, limit) {
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

const normalizeKey = (str) => str.toLocaleLowerCase("tr-TR");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("yardım")
    .setDescription("Botta bulunan komutları gösterir.")
    .addStringOption((opt) =>
      opt
        .setName("kategori")
        .setDescription(
          "Kategori ismi girersen sadece o kategoriyi gösterir."
        )
        .setAutocomplete(false)
    ),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const categories = [
      ...new Set(interaction.client.commands.map((cmd) => cmd.folder)),
    ];
    const filtered = categories.filter((cat) =>
      cat.toLowerCase().includes(focusedValue.toLowerCase())
    );
    await interaction.respond(
      filtered.map((cat) => ({ name: cat, value: cat }))
    );
  },

  async execute(interaction) {
    const { guild } = interaction;
    const kategoriGirisi = interaction.options.getString("kategori");
    const botAvatar = interaction.client.user.displayAvatarURL({ size: 128 });
    const guildIcon = guild.iconURL({ size: 256 }) || botAvatar;
    const ownerProfileURL = `https://discord.com/users/${ayarlar.sahipID}`;

    const categoryEmojis = {
      Bildirim: emojiler.bildirim,
      Bilgi: emojiler.buyutec,
      Bot: emojiler.bot,
      Eğlence: emojiler.laugh,
      Kullanıcı: emojiler.uye,
      Kurulumlu: emojiler.ayar,
      Moderasyon: emojiler.ban,
      Sunucu: emojiler.fourdkalp,
      Yedek: emojiler.bulut,
    };

    const categoryOrder = [
      "Bilgi",
      "Kullanıcı",
      "Eğlence",
      "Moderasyon",
      "Sunucu",
      "Kurulumlu",
      "Bildirim",
      "Bot",
      "Yedek",
    ];

    const formatString = (str) =>
      str
        .toLocaleLowerCase("tr-TR")
        .split(" ")
        .map(
          (word) =>
            word.charAt(0).toLocaleUpperCase("tr-TR") + word.slice(1)
        )
        .join(" ");

    const allCommands = interaction.client.commands
      .map((cmd) => ({
        folder: cmd.folder || "Diğer",
        name: cmd.data?.name,
        description:
          cmd.data?.description ||
          `${emojiler.uyari} Komut açıklaması girilmemiş.`,
      }))
      .filter((cmd) => cmd.name);

    const commandMap = new Map(allCommands.map((cmd) => [cmd.name, cmd]));
    const getCommandsByNames = (names) =>
      names.map((name) => commandMap.get(name)).filter(Boolean);

    const directories = [...new Set(allCommands.map((cmd) => cmd.folder))];
    const categories = directories
      .map((dir) => ({
        directory: dir,
        commands: allCommands
          .filter((cmd) => cmd.folder === dir)
          .sort((a, b) => a.name.localeCompare(b.name, "tr")),
      }))
      .sort((a, b) => {
        const aIndex = categoryOrder.indexOf(formatString(a.directory));
        const bIndex = categoryOrder.indexOf(formatString(b.directory));
        const safeAIndex = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
        const safeBIndex = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
        return (
          safeAIndex - safeBIndex ||
          a.directory.localeCompare(b.directory, "tr")
        );
      });

    const systemBlueprints = [
      {
        id: "destek-basvuru",
        label: "Destek & Başvuru",
        emoji: emojiler.fourdkalp,
        commands: ["destek-sistemi", "yetkili-başvuru", "itiraf-sistemi"],
      },
      {
        id: "kayit-uye",
        label: "Kayıt & Üye",
        emoji: emojiler.girisok,
        commands: ["giriş-çıkış", "eski-yeni-üye", "aktif-üye", "abone-sistemi-ayarla", "abone-sıralama", "seviye-sistemi", "seviye"],
      },
      {
        id: "rol-sistemleri",
        label: "Rol Sistemleri",
        emoji: emojiler.uye,
        commands: [
          "alıntı-rol",
          "clan-tag-rol",
          "durum-rol",
          "emoji-rol",
          "toplu-rol",
          "rol",
        ],
      },
      {
        id: "koruma-moderasyon",
        label: "Koruma & Moderasyon",
        emoji: emojiler.kalkan,
        commands: [
          "automod",
          "honeypot",
          "ghost-ping",
          "kanal-kilit",
          "uyarı",
        ],
      },
      {
        id: "log-sistemleri",
        label: "Log Sistemleri",
        emoji: emojiler.log,
        commands: ["audit-log", "bot-log", "snipe"],
      },
      {
        id: "bildirim-sistemleri",
        label: "Bildirim Sistemleri",
        emoji: emojiler.bildirim,
        commands: ["youtube-alert", "haber-sistemi", "oto-publish"],
      },
      {
        id: "ses-sistemleri",
        label: "Ses Sistemleri",
        emoji: emojiler.colorized_voice_locked,
        commands: ["temp-voice", "ses-panelleri", "ses-kanalı"],
      },
      {
        id: "etkinlik-sistemleri",
        label: "Etkinlik Sistemleri",
        emoji: emojiler.giveaway,
        commands: ["çekiliş", "oylama-başlat", "oy-yarışması", "oyunları-kur"],
      },
      {
        id: "icerik-sistemleri",
        label: "İçerik Sistemleri",
        emoji: emojiler.speechbubble,
        commands: [
          "anı-defteri",
          "itiraf-sistemi",
          "medyalara-emoji",
          "mesaja-emoji",
          "rastgele-iltifat",
          "sticky-message",
        ],
      },
      {
        id: "kullanici-sistemleri",
        label: "Kullanıcı Sistemleri",
        emoji: emojiler.kullanici,
        commands: ["afk", "hatırlatıcı", "doğum-günü", "davet-bilgi", "stat"],
      },
      {
        id: "yedek-sistemleri",
        label: "Yedek Sistemleri",
        emoji: emojiler.bulut,
        commands: ["yedek-sistemi", "yedekten-kur"],
      },
    ];

    const systemGroups = systemBlueprints
      .map((group) => ({
        ...group,
        commands: getCommandsByNames(group.commands),
      }))
      .filter((group) => group.commands.length > 0);

    const buildSystemPreview = (items) =>
      items
        .map((item) => {
          const command = commandMap.get(item.command);
          return command ? { ...command, ...item } : null;
        })
        .filter(Boolean);

    const mainSystemPreview = buildSystemPreview([
      { command: "çekiliş", label: "çekiliş", emoji: emojiler.giveaway },
      { command: "automod", label: "koruma", emoji: emojiler.kalkan, columnTweak: 2 },
      { command: "giriş-çıkış", label: "kayıt", emoji: emojiler.girisok, columnTweak: 2 },
      { command: "destek-sistemi", label: "destek", emoji: emojiler.fourdkalp, columnTweak: 2 },
      { command: "audit-log", label: "log", emoji: emojiler.log, columnTweak: 2 },
      { command: "bot-log", label: "bot log", emoji: emojiler.bot, columnTweak: 2 },
      { command: "temp-voice", label: "geçici ses", emoji: emojiler.colorized_voice_locked },
    ]);

    const userSystemPreview = buildSystemPreview([
      { command: "afk", label: "afk", emoji: "💤", leftShift: 1 },
      { command: "hatırlatıcı", label: "hatırlatıcı", emoji: "⏰", leftShift: 1 },
      { command: "doğum-günü", label: "doğum günü", emoji: "🎂" },
      { command: "davet-bilgi", label: "davet bilgisi", emoji: "🔗", leftShift: 1 },
      { command: "stat", label: "istatistik", emoji: emojiler.istatistik, leftShift: 1 },
      { command: "snipe", label: "snipe", emoji: emojiler.speechbubble },
      { command: "profil-kart", label: "profil kartı", emoji: emojiler.kullanici, leftShift: 2 },
      { command: "sunucu-avatarları", label: "sunucu avatarları", emoji: "🖼️", leftShift: 1 },
    ]);

    const commandDetailLines = (commands) =>
      commands.length
        ? commands
            .slice(0, 25)
            .map(
              (cmd) =>
                `> \`/${cmd.name}\` - ${truncate(
                  cmd.description,
                  84
                )}`
            )
            .join("\n")
        : `${emojiler.uyari} Bu bölümde gösterilecek aktif komut yok.`;

    const categoryMenu = (disabled = false) =>
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("yardım:kategoriler")
          .setPlaceholder("📚 Kategoriler")
          .setDisabled(disabled)
          .addOptions(
            [
              {
                label: `Tüm Komutlar (${allCommands.length})`,
                value: "__all__",
                description: "Ana yardım ekranını görüntüle.",
                emoji: emojiler.kategori,
              },
              ...categories.map((category) => ({
                label: `${formatString(category.directory)} (${category.commands.length})`,
                value: normalizeKey(category.directory),
                description: truncate(
                  `${formatString(category.directory)} kategorisindeki komutları görüntüle.`,
                  100
                ),
                emoji:
                  categoryEmojis[formatString(category.directory)] || undefined,
              })),
            ].slice(0, 25)
          )
      );

    const systemMenu = (disabled = false) =>
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("yardım:sistemler")
          .setPlaceholder("⚙️ Sistemler")
          .setDisabled(disabled || systemGroups.length === 0)
          .addOptions(
            systemGroups.length > 0
              ? systemGroups.map((group) => ({
                  label: group.label,
                  value: group.id,
                  description: truncate(
                    `${group.commands.length} komuttan oluşan sistemi görüntüle.`,
                    100
                  ),
                  emoji: group.emoji,
                }))
              : [
                  {
                    label: "Sistem bulunamadı",
                    value: "__none__",
                    description: "Aktif sistem komutu bulunamadı.",
                    emoji: emojiler.uyari,
                  },
                ]
          )
      );

    const searchRow = (disabled = false) =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("komutara")
          .setStyle(ButtonStyle.Success)
          .setEmoji("🔎")
          .setDisabled(disabled)
      );

    const headerText = () =>
      new TextDisplayBuilder().setContent(
        `## ${interaction.client.user.username} Komutlar`
      );

    const categoryOverview = () =>
      new TextDisplayBuilder().setContent(
        [
          `${emojiler.kategori} **__Kategoriler__**`,
          `> ${emojiler.tasi} [**Tüm Komutlar**](${ownerProfileURL}) (**${allCommands.length}**)`,
          ...categories.map(
            (category) =>
              `> ${categoryEmojis[formatString(category.directory)] || "📁"} [**${formatString(
                category.directory
              )}**](${ownerProfileURL}) (**${category.commands.length}**)`
          ),
        ].join("\n")
      );

    const previewLine = (cmd) =>
      cmd ? `${cmd.emoji || emojiler.parlayanyildiz} ${cmd.label}` : "";

    const columnGap = (visibleLength, minWidth = 27) =>
      "\u2002".repeat(Math.max(5, minWidth - visibleLength));

    const systemOverview = () =>
      new TextDisplayBuilder().setContent(
        (() => {
          const rows = [];
          const maxRows = Math.max(
            mainSystemPreview.slice(0, 8).length,
            userSystemPreview.slice(0, 8).length
          );
          const leftHeader = `${emojiler.system || "⚙️"} **__Sistemler__**`;

          rows.push(
            `${leftHeader}${columnGap("Sistemler".length)}${emojiler.kullanici || "👤"} **__Kullanıcı Sistemleri__**`
          );

          for (let index = 0; index < maxRows; index++) {
            const left = mainSystemPreview[index];
            const right = userSystemPreview[index];
            const leftText = previewLine(left);
            const rightText = previewLine(right);

            rows.push(
              `> ${leftText}${columnGap(
                left
                  ? left.label.length +
                      (left.columnTweak || 0) +
                      (right?.leftShift || 0)
                  : 0
              )}${rightText}`.trimEnd()
            );
          }

          return rows.join("\n");
        })()
      );

    const selectedCommandsView = (title, commands, emoji) =>
      new TextDisplayBuilder().setContent(
        [
          `### ${emoji || emojiler.parlayanyildiz} ${title} (${commands.length})`,
          commandDetailLines(commands),
        ].join("\n")
      );

    const contentSection = (view = { type: "home" }) => {
      let textDisplay;

      if (view.type === "category" || view.type === "system") {
        textDisplay = selectedCommandsView(view.title, view.commands, view.emoji);
      } else {
        textDisplay = categoryOverview();
      }

      return new SectionBuilder()
        .addTextDisplayComponents(textDisplay)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
    };

    const buildHelpContainer = (view = { type: "home" }, disabled = false) => {
      const commandView = view.type === "category" || view.type === "system";
      const color = veriOku(commandView ? "yardım.komutrenk" : "yardım.renk");
      const image = veriOku(commandView ? "yardım.komutresim" : "yardım.resim");
      const container = new ContainerBuilder()
        .setAccentColor(/^#[\da-f]{6}$/i.test(color || "") ? parseInt(color.slice(1), 16) : ACCENT_COLOR)
        .addTextDisplayComponents(headerText())
        .addSeparatorComponents(separator())
        .addSectionComponents(contentSection(view))
        .addSeparatorComponents(separator())
        .addActionRowComponents(categoryMenu(disabled))
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(systemOverview())
        .addSeparatorComponents(separator())
        .addActionRowComponents(systemMenu(disabled))
        .addSeparatorComponents(separator())
        .addActionRowComponents(searchRow(disabled));

      if (image && /^https:\/\//i.test(image)) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image)));
      return container;
    };

    const buildPayload = (view, disabled = false) => ({
      components: [buildHelpContainer(view, disabled)],
      flags: V2_FLAGS,
    });

    const buildNoticePayload = (title, description, isError = false) => ({
      components: [
        new ContainerBuilder()
          .setAccentColor(isError ? 0xed4245 : 0x2fba72)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
          ),
      ],
      flags: PRIVATE_V2_FLAGS,
    });

    let currentView = { type: "home" };

    if (kategoriGirisi) {
      const secilen = categories.find(
        (category) =>
          normalizeKey(category.directory) === normalizeKey(kategoriGirisi)
      );
      if (!secilen) {
        return interaction.reply(
          buildNoticePayload(
            `${emojiler.uyari} Geçersiz kategori`,
            `**${kategoriGirisi}** adında bir kategori bulunamadı.`,
            true
          )
        );
      }

      currentView = {
        type: "category",
        title: `${formatString(secilen.directory)} Komutları`,
        commands: secilen.commands,
        emoji: categoryEmojis[formatString(secilen.directory)],
      };
    }

    const response = await interaction.reply({
      ...buildPayload(currentView),
      withResponse: true,
    });
    const initialMessage = response.resource.message;

    const collector = initialMessage.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 120_000,
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply(
          buildNoticePayload(
            `${emojiler.uyari} Yetkisiz işlem`,
            "Bunu sadece komutu kullanan kişi kullanabilir.",
            true
          )
        );
      }

      try {
        const [selectedValue] = i.values;

        if (i.customId === "yardım:kategoriler") {
          if (selectedValue === "__all__") {
            currentView = { type: "home" };
            return i.update(buildPayload(currentView));
          }

          const category = categories.find(
            (x) => normalizeKey(x.directory) === selectedValue
          );

          if (!category) {
            return i.reply(
              buildNoticePayload(
                `${emojiler.uyari} Kategori bulunamadı`,
                "Seçilen kategori artık mevcut değil.",
                true
              )
            );
          }

          currentView = {
            type: "category",
            title: `${formatString(category.directory)} Komutları`,
            commands: category.commands,
            emoji: categoryEmojis[formatString(category.directory)],
          };

          return i.update(buildPayload(currentView));
        }

        if (i.customId === "yardım:sistemler") {
          const systemGroup = systemGroups.find(
            (group) => group.id === selectedValue
          );

          if (!systemGroup) {
            return i.reply(
              buildNoticePayload(
                `${emojiler.uyari} Sistem bulunamadı`,
                "Seçilen sistem artık mevcut değil.",
                true
              )
            );
          }

          currentView = {
            type: "system",
            title: systemGroup.label,
            commands: systemGroup.commands,
            emoji: systemGroup.emoji,
          };

          return i.update(buildPayload(currentView));
        }
      } catch (err) {
        console.error("[Yardım] Select menu hatası:", err);
      }
    });

    collector.on("end", () => {
      initialMessage
        .edit(buildPayload(currentView, true))
        .catch(() => {});
    });

    const buttonCollector = initialMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    buttonCollector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        return btn.reply(
          buildNoticePayload(
            `${emojiler.uyari} Yetkisiz işlem`,
            "Bunu sadece komutu kullanan kişi kullanabilir.",
            true
          )
        );
      }

      try {
        if (btn.customId === "komutara") {
          const modal = new ModalBuilder()
            .setCustomId("komutara-modal")
            .setTitle("Komut Ara");

          const input = new TextInputBuilder()
            .setCustomId("komutadi")
            .setLabel("Komut Adını Gir")
            .setPlaceholder("alıntı-rol - itiraf-sistemi vb.")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const row = new ActionRowBuilder().addComponents(input);
          modal.addComponents(row);

          await btn.showModal(modal);

          try {
            const submitted = await btn.awaitModalSubmit({
              time: 120_000,
              filter: (i) =>
                i.customId === "komutara-modal" &&
                i.user.id === interaction.user.id,
            });

            const komutAdi = submitted.fields
              .getTextInputValue("komutadi")
              .toLowerCase()
              .replace(/^\//, "")
              .trim();

            const komut = interaction.client.commands.find(
              (c) => c.data.name.toLowerCase() === komutAdi
            );

            if (!komut) {
              return submitted.reply(
                buildNoticePayload(
                  `${emojiler.uyari} Komut bulunamadı`,
                  `\`/${komutAdi}\` adında bir komut bulunamadı.`,
                  true
                )
              );
            }

            const container = new ContainerBuilder()
              .setAccentColor(0x2b2d31)
              .addSectionComponents(
                new SectionBuilder()
                  .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                      [
                        `## ${emojiler.parlayanyildiz} Komut Bilgisi`,
                        `**İsim:** \`/${komut.data.name}\``,
                        `**Açıklama:** ${komut.data.description || "Açıklama girilmemiş."}`,
                        `**Kategori:** ${komut.folder || "Bilinmiyor"}`,
                      ].join("\n")
                    )
                  )
                  .setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon))
              );

            await submitted.reply({
              components: [container],
              flags: PRIVATE_V2_FLAGS,
            });
          } catch (modalErr) {
            return;
          }
        }
      } catch (err) {
        console.error("[Yardım] Button hatası:", err);
      }
    });

    buttonCollector.on("end", () => {
      initialMessage
        .edit(buildPayload(currentView, true))
        .catch(() => {});
    });
  },
};
