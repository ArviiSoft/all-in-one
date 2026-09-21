const { ContainerBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } = require("discord.js");

const GAME_PANELS = Object.freeze({
  sayi: {
    title: "🔢 Sayı Saymaca",
    accentColor: 0x5865f2,
    description: "Üyeler sayıları birer artırarak doğru sırayla devam ettirir.",
  },
  bom: {
    title: "💣 Bom Oyunu",
    accentColor: 0xed4245,
    description: "Sayılar sırayla yazılır, beşin katlarında sayı yerine `bom` denir.",
  },
  kelime: {
    title: "🔤 Kelime Türetme",
    accentColor: 0x57f287,
    description: "Her kelime, önceki kelimenin son harfiyle başlamalıdır.",
  },
  tuttu: {
    title: "🎯 Tuttu / Tutmadı",
    accentColor: 0xeb459e,
    description: "Üyeler sırayla önceki cümleye `Tuttu` veya `Tutmadı` diyerek devam eder.",
  },
  sayiTahmini: {
    title: "🎲 Sayı Tahmini",
    accentColor: 0xf0b232,
    description: "Botun 1 ile 100 arasında tuttuğu gizli sayıyı ilk bulan turu kazanır.",
  },
  hizliYaz: {
    title: "⚡ Hızlı Yaz",
    accentColor: 0x26d9ff,
    description: "Görseldeki kelimeyi 10 saniye içinde ilk doğru yazan oyuncu kazanır.",
  },
  adamAsmaca: {
    title: "🪢 Adam Asmaca",
    accentColor: 0x9b7bff,
    description: "Gizli kelimeyi, altı yanlış hak dolmadan harf harf ortaya çıkarın.",
  },
});

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function gameInstructions(gameKey, options) {
  if (gameKey === "sayi") {
    const nextNumber = Math.max(1, Number(options.nextNumber) || 1);
    return [
      "### Sıradaki Sayı",
      `## \`${nextNumber}\``,
      "- Yalnızca sıradaki tam sayıyı gönder.",
      "- Yanlış sayı sırayı ilerletmez.",
    ];
  }

  if (gameKey === "bom") {
    const nextNumber = Math.max(1, Number(options.nextNumber) || 1);
    const nextMove = nextNumber % 5 === 0 ? "bom" : String(nextNumber);
    return [
      "### Sıradaki Sayı",
      `## \`${nextMove}\``,
      "- Beşin katlarında sayı yerine `bom` yaz.",
      "- Diğer turlarda sıradaki sayıyla devam et.",
    ];
  }

  if (gameKey === "kelime") {
    const initialWord = String(options.initialWord || "").trim().toLocaleLowerCase("tr-TR");
    const lastLetter = [...initialWord].at(-1) || "?";
    return [
      "### İlk Kelime",
      `## \`${initialWord || "hazırlanıyor"}\``,
      `**Devam harfi:** \`${lastLetter}\``,
      "- Kullanılan bir kelime yeniden yazılamaz.",
      "- Kelimeler canlı TDK Güncel Türkçe Sözlük verisiyle doğrulanır.",
    ];
  }

  if (gameKey === "sayiTahmini") {
    return [
      "### Bir Sayı Tuttum",
      "## `1 - 100`",
      "- Tahminini bu kanala yalnızca sayı olarak gönder.",
      "- Yanlış tahminlere çarpı emojisi eklenir.",
      "- Doğru sayı bulunduğunda yeni tur otomatik başlar.",
    ];
  }

  if (gameKey === "hizliYaz") {
    return [
      "### 10 Saniyen Var",
      "- Görseldeki kelimeyi olduğu gibi yaz.",
      "- İlk doğru cevap turu kazanır.",
      "- Tur bittikten sonra sonuç panelindeki **Yeni Kelime Ver** butonunu kullan.",
    ];
  }

  if (gameKey === "adamAsmaca") {
    return [
      "### Altı Yanlış Hakkınız Var",
      "- Mesajın ilk harfi tahmin olarak değerlendirilir.",
      "- Bir kelime veya cümle yazsan bile yalnızca ilk harf alınır.",
      "- Her yanlış tahminde çizim otomatik güncellenir.",
    ];
  }

  if (gameKey === "tuttu") return [
    "### Oyun Başladı",
    "- Mesajın `Tuttu` veya `Tutmadı` ile başlamalı.",
    "- Tek başına yazılamaz; ardından en az iki kelimelik bir açıklama eklemelisin.",
    "- Aynı oyuncu art arda iki cümle yazamaz.",
    "- İlk tahmini herhangi bir üye paylaşabilir.",
  ];

  return [];
}

function buildGameSetupPayload(gameKey, options = {}) {
  const presentation = GAME_PANELS[gameKey];
  if (!presentation) throw new Error(`Bilinmeyen oyun paneli: ${gameKey}`);

  const container = new ContainerBuilder()
    .setAccentColor(presentation.accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## ${presentation.title}`,
        "**Oyun bu kanalda başlatıldı.**",
        presentation.description,
      ].join("\n"))
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(gameInstructions(gameKey, options).join("\n"))
    )


  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

module.exports = { buildGameSetupPayload };