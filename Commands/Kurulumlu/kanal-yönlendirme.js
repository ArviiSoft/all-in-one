const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits, RoleSelectMenuBuilder, SlashCommandBuilder, StringSelectMenuBuilder } = require("discord.js");
const fs = require("../../Utils/Core/databaseFs");
const path = require("path");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const veriYolu = path.join(__dirname, "../../Database/Sunucu Yönetimi/kanalaYonlendirme.json");
const PANEL_SURESI = 10 * 60 * 1000;
const KANAL_TURLERI = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const EMBED_SECENEKLERI = [
  { key: "title", label: "Başlık" },
  { key: "description", label: "Açıklama" },
  { key: "footer", label: "Alt bilgi" },
  { key: "image", label: "Görsel" },
  { key: "thumbnail", label: "Küçük görsel" },
  { key: "fields", label: "Alanlar" },
  { key: "url", label: "URL" },
  { key: "color", label: "Renk" },
];
const VARSAYILAN_EMBED_AYARI = Object.freeze(
  Object.fromEntries(EMBED_SECENEKLERI.map(({ key }) => [key, true])),
);
const controlIds = {
  kaynak: "kanal_yonlendirme:kaynak",
  hedef: "kanal_yonlendirme:hedef",
  rol: "kanal_yonlendirme:rol",
  embed: "kanal_yonlendirme:embed",
  rolKaldir: "kanal_yonlendirme:rol_kaldir",
  tumunuAc: "kanal_yonlendirme:tumunu_ac",
  tumunuKapat: "kanal_yonlendirme:tumunu_kapat",
  yenile: "kanal_yonlendirme:yenile",
  sil: "kanal_yonlendirme:sil",
};

function veriOku() {
  if (!fs.existsSync(veriYolu)) return {};

  try {
    return JSON.parse(fs.readFileSync(veriYolu, "utf8"));
  } catch (error) {
    console.error("🔴 [KANAL YÖNLENDİRME] Veritabanı okunamadı:", error);
    throw error;
  }
}

function veriYaz(veri) {
  fs.mkdirSync(path.dirname(veriYolu), { recursive: true });
  fs.writeFileSync(veriYolu, JSON.stringify(veri, null, 2), "utf8");
}

function embedAyariniNormallestir(embedAyar, varsayilanAcik = false) {
  const kaynak = embedAyar && typeof embedAyar === "object" ? embedAyar : {};
  return Object.fromEntries(
    EMBED_SECENEKLERI.map(({ key }) => [
      key,
      typeof kaynak[key] === "boolean" ? kaynak[key] : varsayilanAcik,
    ]),
  );
}

function sunucuVerisiniHazirla(veri, guildId) {
  if (!veri[guildId] || typeof veri[guildId] !== "object" || Array.isArray(veri[guildId])) {
    veri[guildId] = { yönlendirmeler: [] };
  }

  const sunucuVerisi = veri[guildId];
  const eskiYonlendirmeler = Array.isArray(sunucuVerisi.yönlendirmeler)
    ? sunucuVerisi.yönlendirmeler
    : [];
  const kaynaklaraGore = new Map();

  for (const yonlendirme of eskiYonlendirmeler) {
    if (!yonlendirme || typeof yonlendirme !== "object") continue;
    if (typeof yonlendirme.kaynakId !== "string" || typeof yonlendirme.hedefId !== "string") continue;

    kaynaklaraGore.set(yonlendirme.kaynakId, {
      kaynakId: yonlendirme.kaynakId,
      hedefId: yonlendirme.hedefId,
      rolId: typeof yonlendirme.rolId === "string" ? yonlendirme.rolId : null,
      embedAyar: embedAyariniNormallestir(yonlendirme.embedAyar),
    });
  }

  sunucuVerisi.yönlendirmeler = [...kaynaklaraGore.values()];
  return sunucuVerisi;
}

function yonlendirmeBul(sunucuVerisi, kaynakId) {
  if (!kaynakId) return null;
  return sunucuVerisi.yönlendirmeler.find(yonlendirme => yonlendirme.kaynakId === kaynakId) || null;
}

function yonlendirmeKaydet(veri, guildId, kaynakId, degisiklikler) {
  const sunucuVerisi = sunucuVerisiniHazirla(veri, guildId);
  let yonlendirme = yonlendirmeBul(sunucuVerisi, kaynakId);

  if (!yonlendirme) {
    yonlendirme = {
      kaynakId,
      hedefId: degisiklikler.hedefId,
      rolId: null,
      embedAyar: { ...VARSAYILAN_EMBED_AYARI },
    };
    sunucuVerisi.yönlendirmeler.push(yonlendirme);
  }

  Object.assign(yonlendirme, degisiklikler);
  yonlendirme.embedAyar = embedAyariniNormallestir(yonlendirme.embedAyar, true);
  veriYaz(veri);
  return yonlendirme;
}

function yonlendirmeSil(veri, guildId, kaynakId) {
  const sunucuVerisi = sunucuVerisiniHazirla(veri, guildId);
  const oncekiUzunluk = sunucuVerisi.yönlendirmeler.length;
  sunucuVerisi.yönlendirmeler = sunucuVerisi.yönlendirmeler.filter(
    yonlendirme => yonlendirme.kaynakId !== kaynakId,
  );

  if (sunucuVerisi.yönlendirmeler.length === 0) delete veri[guildId];
  veriYaz(veri);
  return oncekiUzunluk !== (veri[guildId]?.yönlendirmeler.length || 0);
}

function kanalGecerli(guild, channelId) {
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  return channel && KANAL_TURLERI.includes(channel.type) ? channel : null;
}

function buildRows(guild, seciliKaynakId, yonlendirme, silmeOnayi = false, disabled = false) {
  const kaynakSelect = new ChannelSelectMenuBuilder()
    .setCustomId(controlIds.kaynak)
    .setPlaceholder("Yönetilecek kaynak kanalı seçin...")
    .setChannelTypes(...KANAL_TURLERI)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);
  if (kanalGecerli(guild, seciliKaynakId)) kaynakSelect.setDefaultChannels(seciliKaynakId);

  const hedefSelect = new ChannelSelectMenuBuilder()
    .setCustomId(controlIds.hedef)
    .setPlaceholder(seciliKaynakId ? "Mesajların gönderileceği hedef kanalı seçin..." : "Önce kaynak kanalı seçin...")
    .setChannelTypes(...KANAL_TURLERI)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled || !seciliKaynakId);
  if (kanalGecerli(guild, yonlendirme?.hedefId)) hedefSelect.setDefaultChannels(yonlendirme.hedefId);

  const rolSelect = new RoleSelectMenuBuilder()
    .setCustomId(controlIds.rol)
    .setPlaceholder(yonlendirme ? "Etiketlenecek rolü seçin (isteğe bağlı)..." : "Önce hedef kanalı seçin...")
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled || !yonlendirme);
  if (yonlendirme?.rolId && guild.roles.cache.has(yonlendirme.rolId)) {
    rolSelect.setDefaultRoles(yonlendirme.rolId);
  }

  const embedAyar = embedAyariniNormallestir(yonlendirme?.embedAyar);
  const embedSelect = new StringSelectMenuBuilder()
    .setCustomId(controlIds.embed)
    .setPlaceholder(yonlendirme ? "Açılıp kapatılacak embed parçasını seçin..." : "Önce hedef kanalı seçin...")
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled || !yonlendirme)
    .addOptions(EMBED_SECENEKLERI.map(({ key, label }) => ({
      label: `${label}: ${embedAyar[key] ? "Açık" : "Kapalı"}`,
      description: `${label} aktarımını ${embedAyar[key] ? "kapat" : "aç"}.`,
      emoji: embedAyar[key] ? emojiler.tik : emojiler.carpi,
      value: key,
    })));

  const butonlar = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(controlIds.rolKaldir)
      .setLabel("Rolü Kaldır")
      .setEmoji(`${emojiler.kapat}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || !yonlendirme?.rolId),
    new ButtonBuilder()
      .setCustomId(controlIds.tumunuAc)
      .setLabel("Tümünü Aç")
      .setEmoji(`${emojiler.tik}`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled || !yonlendirme),
    new ButtonBuilder()
      .setCustomId(controlIds.tumunuKapat)
      .setLabel("Tümünü Kapat")
      .setEmoji(`${emojiler.carpi}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || !yonlendirme),
    new ButtonBuilder()
      .setCustomId(controlIds.yenile)
      .setLabel("Yenile")
      .setEmoji(`${emojiler.yukleniyor}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(controlIds.sil)
      .setLabel(silmeOnayi ? "Silmeyi Onayla" : "Yönlendirmeyi Sil")
      .setEmoji(`${emojiler.cop}`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled || !yonlendirme),
  );

  return [
    new ActionRowBuilder().addComponents(kaynakSelect),
    new ActionRowBuilder().addComponents(hedefSelect),
    new ActionRowBuilder().addComponents(rolSelect),
    new ActionRowBuilder().addComponents(embedSelect),
    butonlar,
  ];
}

function yonlendirmeListesi(guild, sunucuVerisi) {
  const yonlendirmeler = sunucuVerisi.yönlendirmeler || [];
  if (yonlendirmeler.length === 0) return `Ayarlı yönlendirme yok.`;

  const gorunenler = yonlendirmeler.slice(0, 15).map((yonlendirme, index) => (
    `${emojiler.discord_channel_from_VEGA} **${index + 1}.** <#${yonlendirme.kaynakId}> ${emojiler.sadesagok} <#${yonlendirme.hedefId}>` +
    `${yonlendirme.rolId ? ` • <@&${yonlendirme.rolId}>` : ""}`
  ));
  if (yonlendirmeler.length > gorunenler.length) {
    gorunenler.push(`-# …ve ${yonlendirmeler.length - gorunenler.length} yönlendirme daha`);
  }
  return gorunenler.join("\n");
}

function buildPanelPayload(guild, seciliKaynakId, notice = null, silmeOnayi = false, disabled = false) {
  const veri = veriOku();
  const sunucuVerisi = sunucuVerisiniHazirla(veri, guild.id);
  const yonlendirme = yonlendirmeBul(sunucuVerisi, seciliKaynakId);
  const kaynak = kanalGecerli(guild, seciliKaynakId);
  const hedef = kanalGecerli(guild, yonlendirme?.hedefId);
  const rol = yonlendirme?.rolId ? guild.roles.cache.get(yonlendirme.rolId) : null;
  const embedDurumlari = EMBED_SECENEKLERI.map(({ key, label }) => (
    `${label}: ${yonlendirme?.embedAyar?.[key] ? emojiler.tik : emojiler.carpi}`
  )).join(" • ");

  const aciklama = [
    `- Kaynak ve hedef kanalı seçtiğinizde yönlendirme oluşturulur, sonraki seçimler doğrudan kaydedilir.`,
    `- Yeni yönlendirmelerde tüm embed parçaları açıktır. Menüden bir parçayı seçerek durumunu değiştirebilirsiniz.`,
    "",
    `${emojiler.discord_channel_from_VEGA} **Kaynak:** ${kaynak || (seciliKaynakId ? `<#${seciliKaynakId}>` : "Seçilmedi")}`,
    `${emojiler.sadesagok} **Hedef:** ${hedef || (yonlendirme ? `<#${yonlendirme.hedefId}>` : "Seçilmedi")}`,
    `${emojiler.ampul} **Etiket rolü:** ${rol || (yonlendirme?.rolId ? `<@&${yonlendirme.rolId}>` : "Yok")}`,
    `${emojiler.ayar} **Embed parçaları:** ${yonlendirme ? embedDurumlari : "Yönlendirme oluşturulmadı"}`,
  ];

  if (notice) aciklama.push("", notice);
  if (silmeOnayi) {
    aciklama.push("", `${emojiler.uyari} **Silme işlemini tamamlamak için “Silmeyi Onayla” butonuna tekrar basın.**`);
  }
  aciklama.push("", `${emojiler.hashtag} **Ayarlı yönlendirmeler**`, yonlendirmeListesi(guild, sunucuVerisi));

  return {
    embeds: [
      new EmbedBuilder()
        .setColor("Blurple")
        .setTitle(`${emojiler.ayar} Kanal Yönlendirme Paneli`)
        .setDescription(aciklama.join("\n")),
    ],
    components: buildRows(guild, seciliKaynakId, yonlendirme, silmeOnayi, disabled),
  };
}

async function componentHatasi(component, error) {
  console.error("🔴 [KANAL YÖNLENDİRME] Panel etkileşimi işlenemedi:", error);
  const payload = {
    content: `${emojiler.uyari} **İşlem sırasında hata oluştu.**`,
    flags: MessageFlags.Ephemeral,
  };
  if (component.replied || component.deferred) return component.followUp(payload).catch(() => null);
  return component.reply(payload).catch(() => null);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("kanal-yönlendirme")
    .setDescription("Kanal yönlendirmelerini tek panelden yönetir.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guild = interaction.guild;
    const ilkVeri = veriOku();
    const oncekiVeri = JSON.stringify(ilkVeri);
    if (ilkVeri[guild.id]) {
      sunucuVerisiniHazirla(ilkVeri, guild.id);
      if (JSON.stringify(ilkVeri) !== oncekiVeri) veriYaz(ilkVeri);
    }

    let seciliKaynakId = null;
    let silmeOnayi = false;
    const response = await interaction.reply({
      ...buildPanelPayload(guild, seciliKaynakId),
      flags: MessageFlags.Ephemeral,
      withResponse: true,
    });
    const panelMessage = response.resource?.message || await interaction.fetchReply().catch(() => null);
    if (!panelMessage) return;

    const collector = panelMessage.createMessageComponentCollector({ time: PANEL_SURESI });
    collector.on("collect", async component => {
      if (component.user.id !== interaction.user.id) {
        return component.reply({
          content: `${emojiler.uyari} **Bu paneli yalnızca komutu kullanan kişi yönetebilir.**`,
          flags: MessageFlags.Ephemeral,
        });
      }

      try {
        if (component.customId === controlIds.kaynak && component.isChannelSelectMenu()) {
          await component.deferUpdate();
          seciliKaynakId = component.values[0];
          silmeOnayi = false;
          const veri = veriOku();
          const kayitli = yonlendirmeBul(sunucuVerisiniHazirla(veri, guild.id), seciliKaynakId);
          return interaction.editReply(buildPanelPayload(
            guild,
            seciliKaynakId,
            kayitli
              ? `${emojiler.tik} Kayıtlı yönlendirme **yüklendi.**`
              : `${emojiler.sadesagok} Şimdi hedef kanalı seçin.`,
          ));
        }

        if (component.customId === controlIds.hedef && component.isChannelSelectMenu()) {
          if (!seciliKaynakId) {
            return component.reply({ content: `${emojiler.uyari} **Önce kaynak kanalı seçin.**`, flags: MessageFlags.Ephemeral });
          }

          const hedefId = component.values[0];
          if (hedefId === seciliKaynakId) {
            return component.reply({
              content: `${emojiler.uyari} **Kaynak ve hedef kanal aynı olamaz.**`,
              flags: MessageFlags.Ephemeral,
            });
          }

          await component.deferUpdate();
          silmeOnayi = false;
          const veri = veriOku();
          const mevcut = yonlendirmeBul(sunucuVerisiniHazirla(veri, guild.id), seciliKaynakId);
          yonlendirmeKaydet(veri, guild.id, seciliKaynakId, { hedefId });
          return interaction.editReply(buildPanelPayload(
            guild,
            seciliKaynakId,
            mevcut
              ? `${emojiler.tik} Hedef kanal <#${hedefId}> olarak **güncellendi.**`
              : `${emojiler.tik} Yönlendirme <#${hedefId}> hedefine **oluşturuldu.**`,
          ));
        }

        if (component.customId === controlIds.rol && component.isRoleSelectMenu()) {
          if (!seciliKaynakId) {
            return component.reply({ content: `${emojiler.uyari} **Önce yönlendirme oluşturun.**`, flags: MessageFlags.Ephemeral });
          }

          const rolId = component.values[0];
          if (rolId === guild.id) {
            return component.reply({ content: `${emojiler.uyari} **@everyone rolü seçilemez.**`, flags: MessageFlags.Ephemeral });
          }

          const veri = veriOku();
          const yonlendirme = yonlendirmeBul(sunucuVerisiniHazirla(veri, guild.id), seciliKaynakId);
          if (!yonlendirme) {
            return component.reply({ content: `${emojiler.uyari} **Önce hedef kanalı seçin.**`, flags: MessageFlags.Ephemeral });
          }

          await component.deferUpdate();
          silmeOnayi = false;
          yonlendirmeKaydet(veri, guild.id, seciliKaynakId, { rolId });
          return interaction.editReply(buildPanelPayload(
            guild,
            seciliKaynakId,
            `${emojiler.tik} Etiket rolü <@&${rolId}> olarak **ayarlandı.**`,
          ));
        }

        if (component.customId === controlIds.embed && component.isStringSelectMenu()) {
          const veri = veriOku();
          const yonlendirme = yonlendirmeBul(sunucuVerisiniHazirla(veri, guild.id), seciliKaynakId);
          if (!yonlendirme) {
            return component.reply({ content: `${emojiler.uyari} **Önce yönlendirme oluşturun.**`, flags: MessageFlags.Ephemeral });
          }

          const secenek = component.values[0];
          const secenekBilgisi = EMBED_SECENEKLERI.find(item => item.key === secenek);
          if (!secenekBilgisi) return component.deferUpdate();

          await component.deferUpdate();
          silmeOnayi = false;
          yonlendirme.embedAyar[secenek] = !yonlendirme.embedAyar[secenek];
          yonlendirmeKaydet(veri, guild.id, seciliKaynakId, { embedAyar: yonlendirme.embedAyar });
          return interaction.editReply(buildPanelPayload(
            guild,
            seciliKaynakId,
            `${emojiler.tik} **${secenekBilgisi.label}** aktarımı ${yonlendirme.embedAyar[secenek] ? "açıldı" : "kapatıldı"}.`,
          ));
        }

        if (component.customId === controlIds.rolKaldir && component.isButton()) {
          const veri = veriOku();
          const yonlendirme = yonlendirmeBul(sunucuVerisiniHazirla(veri, guild.id), seciliKaynakId);
          if (!yonlendirme) {
            return component.reply({ content: `${emojiler.uyari} **Seçili yönlendirme bulunamadı.**`, flags: MessageFlags.Ephemeral });
          }

          await component.deferUpdate();
          silmeOnayi = false;
          yonlendirmeKaydet(veri, guild.id, seciliKaynakId, { rolId: null });
          return interaction.editReply(buildPanelPayload(
            guild,
            seciliKaynakId,
            `${emojiler.tik} Etiket rolü **kaldırıldı.**`,
          ));
        }

        if (
          (component.customId === controlIds.tumunuAc || component.customId === controlIds.tumunuKapat) &&
          component.isButton()
        ) {
          const veri = veriOku();
          const yonlendirme = yonlendirmeBul(sunucuVerisiniHazirla(veri, guild.id), seciliKaynakId);
          if (!yonlendirme) {
            return component.reply({ content: `${emojiler.uyari} **Seçili yönlendirme bulunamadı.**`, flags: MessageFlags.Ephemeral });
          }

          await component.deferUpdate();
          silmeOnayi = false;
          const acik = component.customId === controlIds.tumunuAc;
          yonlendirmeKaydet(veri, guild.id, seciliKaynakId, {
            embedAyar: Object.fromEntries(EMBED_SECENEKLERI.map(({ key }) => [key, acik])),
          });
          return interaction.editReply(buildPanelPayload(
            guild,
            seciliKaynakId,
            `${emojiler.tik} Tüm embed parçaları **${acik ? "açıldı" : "kapatıldı"}.**`,
          ));
        }

        if (component.customId === controlIds.yenile && component.isButton()) {
          await component.deferUpdate();
          silmeOnayi = false;
          return interaction.editReply(buildPanelPayload(
            guild,
            seciliKaynakId,
            `${emojiler.tik} Panel **yenilendi.**`,
          ));
        }

        if (component.customId === controlIds.sil && component.isButton()) {
          const veri = veriOku();
          const yonlendirme = yonlendirmeBul(sunucuVerisiniHazirla(veri, guild.id), seciliKaynakId);
          if (!yonlendirme) {
            return component.reply({ content: `${emojiler.uyari} **Silinecek yönlendirme bulunamadı.**`, flags: MessageFlags.Ephemeral });
          }

          await component.deferUpdate();
          if (!silmeOnayi) {
            silmeOnayi = true;
            return interaction.editReply(buildPanelPayload(guild, seciliKaynakId, null, silmeOnayi));
          }

          yonlendirmeSil(veri, guild.id, seciliKaynakId);
          silmeOnayi = false;
          return interaction.editReply(buildPanelPayload(
            guild,
            seciliKaynakId,
            `${emojiler.tik} <#${seciliKaynakId}> kanalının yönlendirmesi **silindi.**`,
          ));
        }
      } catch (error) {
        return componentHatasi(component, error);
      }
    });

    collector.on("end", () => {
      interaction.editReply(
        buildPanelPayload(
          guild,
          seciliKaynakId,
          `${emojiler.saat} Panelin süresi doldu.`,
          false,
          true,
        ),
      ).catch(() => null);
    });
  },
};