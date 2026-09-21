const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder, escapeMarkdown } = require("discord.js");
const emojiler = require("../Emojis/emojiler.js");

const AKTIF_RENK = 0x5865f2;
const SONUC_RENK = 0xed4245;

function ayirici() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function guvenliMetin(value) {
  return escapeMarkdown(String(value ?? "").trim(), {
    heading: true,
    bulletedList: true,
    numberedList: true,
    maskedLink: true,
  });
}

function baslikEkle(container, content, thumbnailURL) {
  if (!thumbnailURL) {
    return container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content)
    );
  }

  return container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailURL))
  );
}

function yuzdeMetni(oy, toplamOy) {
  if (!toplamOy) return "%0";
  const deger = ((oy / toplamOy) * 100).toFixed(1).replace(".", ",");
  return `%${deger.endsWith(",0") ? deger.slice(0, -2) : deger}`;
}

function ilerlemeCubugu(oy, toplamOy, uzunluk = 10) {
  const oran = toplamOy > 0 ? oy / toplamOy : 0;
  const dolu = Math.round(Math.max(0, Math.min(1, oran)) * uzunluk);
  return `${"▰".repeat(dolu)}${"▱".repeat(uzunluk - dolu)}`;
}

function buildAktifOylama({ alfabe, baslatanId, bitisZamani, soru, secenekler, thumbnailURL }) {
  const container = new ContainerBuilder().setAccentColor(AKTIF_RENK);

  baslikEkle(container, [
    "## 🗳️ Yeni Oylama",
    `### ${guvenliMetin(soru)}`,
  ].join("\n"), thumbnailURL);

  const secenekMetni = secenekler
    .map((secenek, index) => `${alfabe[index]}  **${guvenliMetin(secenek)}**`)
    .join("\n");

  return container
    .addSeparatorComponents(ayirici())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### Seçenekler\n${secenekMetni}`)
    )
    .addSeparatorComponents(ayirici())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### Oylama Bilgileri",
        `${emojiler.tasi} **Başlatan:** <@${baslatanId}>`,
        `${emojiler.donensaat} **Bitiş:** <t:${bitisZamani}:F>`,
        "-# Oylama sona erdiğinde sonuçlar bu panelde otomatik olarak yayınlanır.",
      ].join("\n"))
    );
}

function buildOylamaSonucu({ bitisZamani, pollId, sonuclar, soru, toplamOy, voterCount, thumbnailURL }) {
  const container = new ContainerBuilder().setAccentColor(SONUC_RENK);

  baslikEkle(container, [
    "## Oylama Sona Erdi",
    `### ${guvenliMetin(soru)}`,
  ].join("\n"), thumbnailURL);

  const sonucMetni = sonuclar.map(({ emoji, oy, secenek }) => [
    `${emoji}  **${guvenliMetin(secenek)}**`,
    `> ${ilerlemeCubugu(oy, toplamOy)}  **${yuzdeMetni(oy, toplamOy)}**  •  \`${oy} oy\``,
  ].join("\n")).join("\n\n");

  const enYuksekOy = Math.max(0, ...sonuclar.map(({ oy }) => oy));
  const kazananlar = enYuksekOy > 0
    ? sonuclar
      .filter(({ oy }) => oy === enYuksekOy)
      .map(({ emoji, secenek }) => `${emoji} ${guvenliMetin(secenek)}`)
      .join("  •  ")
    : "Oy kullanılmadı";

  const butonlar = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`oyverenler_${pollId}`)
      .setLabel(`Oy Verenler (${voterCount})`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(emojiler.uye || '👥')
  );

  return container
    .addSeparatorComponents(ayirici())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### Sonuçlar\n${sonucMetni}`)
    )
    .addSeparatorComponents(ayirici())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### Özet",
        `🏆 **En çok oy alan:** ${kazananlar} \n`,
        `🗳️ **Toplam oy:** \`${toplamOy}\`  •  ${emojiler.uye} **Oy veren:** \`${voterCount}\``,
        `-# <t:${bitisZamani}:F>`,
      ].join("\n"))
    )
    .addActionRowComponents(butonlar);
}

function buildOyVerenlerPanel({ ownerId, page = 0, pollId, soru, voters }) {
  const sayfaBoyutu = 5;
  const toplamSayfa = Math.max(1, Math.ceil(voters.length / sayfaBoyutu));
  const gecerliSayfa = Math.max(0, Math.min(Number(page) || 0, toplamSayfa - 1));
  const baslangic = gecerliSayfa * sayfaBoyutu;
  const sayfadakiUyeler = voters.slice(baslangic, baslangic + sayfaBoyutu);
  const katilimciMetni = sayfadakiUyeler.length
    ? sayfadakiUyeler
      .map((userId, index) => `**${baslangic + index + 1}.** <@${userId}>`)
      .join("\n")
    : "-# Bu oylamada oy kullanan kimse bulunmuyor.";

  const oncekiButonu = new ButtonBuilder()
    .setCustomId(`oyverenler_${pollId}_${ownerId}_${Math.max(0, gecerliSayfa - 1)}_onceki`)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("⬅️")
    .setDisabled(gecerliSayfa === 0);

  const sayfaButonu = new ButtonBuilder()
    .setCustomId(`oyverenler-sayfa_${pollId}_${ownerId}_${gecerliSayfa}`)
    .setLabel(`${gecerliSayfa + 1}/${toplamSayfa}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const sonrakiButonu = new ButtonBuilder()
    .setCustomId(`oyverenler_${pollId}_${ownerId}_${Math.min(toplamSayfa - 1, gecerliSayfa + 1)}_sonraki`)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("➡️")
    .setDisabled(gecerliSayfa === toplamSayfa - 1);

  return new ContainerBuilder()
    .setAccentColor(0xfee75c)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## 👥 Oy Verenler (${voters.length})`,
        `-# ${guvenliMetin(soru)}`,
      ].join("\n"))
    )
    .addSeparatorComponents(ayirici())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### Katılımcılar\n${katilimciMetni}`)
    )
    .addSeparatorComponents(ayirici())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Sayfa ${gecerliSayfa + 1}/${toplamSayfa}  •  Toplam ${voters.length} katılımcı`
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(oncekiButonu, sayfaButonu, sonrakiButonu)
    );
}

function buildUyari({ aciklama, baslik, renk = SONUC_RENK }) {
  return new ContainerBuilder()
    .setAccentColor(renk)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${baslik}\n${aciklama}`)
    );
}

module.exports = {
  buildAktifOylama,
  buildOylamaSonucu,
  buildOyVerenlerPanel,
  buildUyari,
};
