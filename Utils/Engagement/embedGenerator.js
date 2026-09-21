const { ContainerBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder } = require("discord.js");
const emojiler = require("../Emojis/emojiler.js");

const yasakliSunucuID = ["990362728197681162"];
const yasakliKisiID = ["216222397349625857"];
const AKTIF_UYE_RENGI = 0x57f287;
const SIRALAMA_LIMITI = 10;

function ayirici() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function sayiYaz(value) {
  return Math.max(0, Number(value) || 0).toLocaleString("tr-TR");
}

function sunucuGorseli(guild) {
  return guild?.iconURL?.({ extension: "png", size: 256 }) || null;
}

function uyeGorseli(guild, userId) {
  return guild?.members?.cache
    ?.get(userId)
    ?.displayAvatarURL?.({ extension: "png", size: 256 }) || sunucuGorseli(guild);
}

function baslikEkle(container, content, thumbnailURL) {
  if (!thumbnailURL) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    return;
  }

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailURL))
  );
}

function getSiralamalar(data, limit = SIRALAMA_LIMITI) {
  const guildId = data.guild || data.guildId;
  if (yasakliSunucuID.includes(guildId)) return [];

  return Object.entries(data)
    .filter(([key, value]) => key.startsWith("puan_") && typeof value === "number")
    .map(([key, value]) => ({
      id: key.slice("puan_".length),
      puan: value,
    }))
    .filter(entry => entry.puan > 0)
    .sort((first, second) => second.puan - first.puan)
    .slice(0, limit);
}

function siralamaSatiri(entry, index) {
  const dereceler = ["🥇", "🥈", "🥉"];
  const derece = dereceler[index] || `**${index + 1}.**`;
  const kapsamDisi = yasakliKisiID.includes(entry.id) ? " · *değerlendirme dışı*" : "";
  return `${derece} <@${entry.id}>  •  **${sayiYaz(entry.puan)}** mesaj${kapsamDisi}`;
}

function buildActiveMemberPayload(data, guild) {
  const siralama = getSiralamalar(data);
  const aktifUye = data.aktifUye ? `<@${data.aktifUye}>` : "- *Henüz seçilmedi.*";
  const aktifUyePuani = data.aktifUye
    ? data.birinci?.id === data.aktifUye
      ? data.birinci.puan
      : data[`puan_${data.aktifUye}`] ?? 0
    : 0;
  const siralamaMetni = siralama.length
    ? siralama.map(siralamaSatiri).join("\n")
    : [
      "- *Henüz mesaj yazan kimse yok.*",
      "-# Üyeler mesaj gönderdikçe haftalık tablo otomatik oluşur.",
    ].join("\n");
  const timestamp = Math.floor(Date.now() / 1000);
  const container = new ContainerBuilder().setAccentColor(AKTIF_UYE_RENGI);

  baslikEkle(
    container,
    [
      `# ${emojiler.cuteactive} Aktiflik Sıralaması`,
    ].join("\n"),
  );

  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${siralamaMetni}`)
    )
    .addSeparatorComponents(ayirici());

  const aktifUyeMetni = [
    `## ${emojiler.new_member_arviis} Önceki Haftanın Aktif Üyesi`,
    data.aktifUye
      ? `${aktifUye}  •  **${sayiYaz(aktifUyePuani)}** mesaj`
      : "- *Henüz seçilmedi.*",
  ].join("\n\n");

  const avatarURL = data.aktifUye ? uyeGorseli(guild, data.aktifUye) : null;
  if (avatarURL) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(aktifUyeMetni))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarURL))
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(aktifUyeMetni));
  }

  container
    .addSeparatorComponents(ayirici())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Sunucudaki tüm yazı kanalları sayılır · Son güncelleme <t:${timestamp}:R>`
      )
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function rekorSatirlari(rekorlar) {
  if (!rekorlar?.length) return "- *Henüz 1.000 mesaj barajını aşıp rekor listesine giren yok.*";

  return rekorlar
    .slice(0, 3)
    .map((rekor, index) => `${["🥇", "🥈", "🥉"][index]} <@${rekor.id}>  •  **${sayiYaz(rekor.puan)}** mesaj`)
    .join("\n");
}

function streakSatirlari(streakler) {
  if (!streakler?.length) return "- *Henüz üst üste birinci olan kimse yok.*";

  return streakler
    .slice(0, 3)
    .map((rekor, index) => `**${index + 1}.** <@${rekor.id}>  •  🔥 **${sayiYaz(rekor.streak)} hafta**`)
    .join("\n");
}

function buildWeeklyAnnouncementPayload({ data, guild, winner, previousWinner }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const oncekiUye = previousWinner?.id
    ? `<@${previousWinner.id}>  •  **${sayiYaz(previousWinner.puan)}** mesaj`
    : "- *İlk haftalık sonuç*";
  const container = new ContainerBuilder().setAccentColor(AKTIF_UYE_RENGI);

  baslikEkle(
    container,
    [
      `## ${emojiler.GreenHeart_arviis} Aktif Üye Seçildi! ${emojiler.GreenHeart_arviis} \n- ${emojiler.cuteactive} Bu haftanın aktif üyesi ***${sayiYaz(winner.puan)} mesajla*** **(**<@${winner.id}>**)** oldu.`,
    ].join("\n"),
    uyeGorseli(guild, winner.id)
  );

  container
    .addSeparatorComponents(ayirici())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          ` - ${emojiler.Takvim} **Önceki haftanın aktif üyesi:** ${oncekiUye}`,
        ].join("\n")
      )
    )
    .addSeparatorComponents(ayirici())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `## ${emojiler.elmas} REKOR LİSTESİ`,
          rekorSatirlari(data.rekorlar),
          `-# Bu listeye girmek için bir haftada en az 1.000 mesaj gerekir.`,
        ].join("\n")
      )
    )
    .addSeparatorComponents(ayirici())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## 🔥 STREAK LİSTESİ",
          streakSatirlari(data.streakRekorlar),
          "-# En az iki hafta üst üste birinci olan üyeler listelenir.",
        ].join("\n")
      )
    )
    .addSeparatorComponents(ayirici())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# <t:${timestamp}:F>`)
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  AKTIF_UYE_RENGI,
  buildActiveMemberPayload,
  buildWeeklyAnnouncementPayload,
  getSiralamalar,
  yasakliKisiID,
};
