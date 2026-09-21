const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ContainerBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, SectionBuilder, SlashCommandBuilder, TextDisplayBuilder, ThumbnailBuilder } = require("discord.js");
const fs = require("../../Utils/Core/databaseFs");
const path = require("path");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { AY_ADLARI, dogumGunuCoz, dogumGunuKayitMetni, dogumGunuOlustur, gelecekYas, istanbulBugunu, kalanSureMetni, mevcutYas, sonrakiDogumGunu, uzunTarih } = require("../../Utils/Engagement/dogumGunuTarih.js");

const databaseDir = path.join(__dirname, "../../Database/Üye Verileri");
const ayarlarPath = path.join(databaseDir, "dogumGunleri_ayarlar.json");
const dogumgunleriPath = path.join(databaseDir, "dogumGunleri.json");
const EMBED_RENGI = 0xeb62c3;
const YETKILI_KOMUTLARI = new Set(["kullanıcı-ayarla", "ayarları", "kullanıcı-sil"]);
const YAKLASANLAR_BUTON_PREFIXI = "dogumgunu_yaklasanlar";
const YAKLASANLAR_SAYFA_BOYUTU = 10;

if (!fs.existsSync(databaseDir)) fs.mkdirSync(databaseDir, { recursive: true });
if (!fs.existsSync(ayarlarPath)) fs.writeFileSync(ayarlarPath, JSON.stringify({}, null, 4));
if (!fs.existsSync(dogumgunleriPath)) fs.writeFileSync(dogumgunleriPath, JSON.stringify({}, null, 4));

function jsonOku(dosyaYolu) {
  try {
    return JSON.parse(fs.readFileSync(dosyaYolu, "utf8"));
  } catch (error) {
    console.error(`🔴 [DOĞUM GÜNÜ] ${path.basename(dosyaYolu)} okunamadı:`, error);
    return {};
  }
}

function jsonYaz(dosyaYolu, veri) {
  fs.writeFileSync(dosyaYolu, JSON.stringify(veri, null, 4));
}

function yoneticiMi(interaction) {
  const yetkiler = interaction.memberPermissions ?? interaction.member?.permissions;
  return Boolean(yetkiler?.has(PermissionFlagsBits.Administrator));
}

function sistemKuruluMu(ayar) {
  return Boolean(ayar?.kanalId && ayar?.rolId);
}

async function sistemiDogrula(interaction, ayar) {
  if (!sistemKuruluMu(ayar)) {
    await interaction.reply({
      content: `${emojiler.uyari} **Yetkililerin doğum günü sistemini kurmasını isteyin.**`,
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  if (ayar.enabled === false) {
    await interaction.reply({
      content: `${emojiler.uyari} **Doğum günü sistemi şu anda kapalı.**`,
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  return true;
}

function girilenDogumGununuAl(interaction) {
  const sonuc = dogumGunuOlustur(
    interaction.options.getInteger("gün", true),
    interaction.options.getInteger("ay", true),
    interaction.options.getInteger("yıl")
  );

  return sonuc;
}

function dogumGunuEmbediOlustur(kullanici, dogumGunu, baslik, ikinciKisi = false) {
  const bugun = istanbulBugunu();
  const sonraki = sonrakiDogumGunu(dogumGunu, bugun);
  const yas = gelecekYas(dogumGunu, sonraki);
  const kalanSure = kalanSureMetni(sonraki, bugun);
  const sonrakiTarih = uzunTarih(sonraki);
  const kutlamaTarihi = `${dogumGunu.gun} ${AY_ADLARI[dogumGunu.ay - 1]}`;

  let kutlamaSatiri;
  if (ikinciKisi) {
    kutlamaSatiri = yas
      ? `⏰ <@${kullanici.id}> adlı üyenin ${yas}. yaş günü ${kutlamaTarihi} tarihinde saat **10:00'da** kutlanacak! 🎂`
      : `⏰ <@${kullanici.id}> adlı üyenin doğum günü ${kutlamaTarihi} tarihinde saat **10:00'da** kutlanacak! 🎂`;
  } else {
    kutlamaSatiri = yas
      ? `⏰ ${yas}. yaş günün ${kutlamaTarihi} tarihinde saat **10:00'da** kutlanacak! 🎂`
      : `⏰ Doğum günün ${kutlamaTarihi} tarihinde saat **10:00'da** kutlanacak! 🎂`;
  }

  return new EmbedBuilder()
    .setColor(EMBED_RENGI)
    .setTitle(baslik)
    .setDescription([
      `🌍 <@${kullanici.id}>`,
      `📅 **Tarih:** ${uzunTarih(dogumGunu)}`,
      `⌛ **Kalan Süre:** \`${kalanSure}\` (${sonrakiTarih})`,
      "",
      kutlamaSatiri,
    ].join("\n"));
}

function varsayilanAvatarURL(index) {
  return `https://cdn.discordapp.com/embed/avatars/${index % 6}.png`;
}

async function kullaniciAvatariniAl(interaction, kullaniciId, index) {
  const member = interaction.guild.members.cache.get(kullaniciId);
  if (member) return member.displayAvatarURL({ size: 256 });

  const cachedUser = interaction.client.users.cache.get(kullaniciId);
  const user = cachedUser
    ?? await interaction.client.users.fetch(kullaniciId).catch(() => null);

  return user?.displayAvatarURL({ size: 256 }) ?? varsayilanAvatarURL(index);
}

async function yaklasanDogumGunleriGorunumuOlustur(
  interaction,
  yaklasanlar,
  bugun,
  baslangicSirasi = 0
) {
  const avatarlar = await Promise.all(
    yaklasanlar.map((kayit, index) =>
      kullaniciAvatariniAl(interaction, kayit.kullaniciId, index)
    )
  );

  const container = new ContainerBuilder().setAccentColor(EMBED_RENGI);
  const baslikAyriGosterilebilir = yaklasanlar.length < 10;

  if (baslikAyriGosterilebilir) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("## 📅 Yaklaşan Doğum Günleri")
    );
  }

  yaklasanlar.forEach((kayit, index) => {
    const yas = mevcutYas(kayit.dogumGunu, bugun);
    const yasMetni = yas === null ? "" : ` • 🎈 **${yas} yaşında**`;
    const baslik = !baslikAyriGosterilebilir && index === 0
      ? "## 📅 Yaklaşan Doğum Günleri\n\n"
      : "";
    const icerik = [
      `${baslik}**${baslangicSirasi + index + 1}.** 🌍 <@${kayit.kullaniciId}> — **${uzunTarih(kayit.dogumGunu)}**${yasMetni}`,
      `⌛ **Kalan Süre:** \`${kalanSureMetni(kayit.sonraki, bugun)}\` (${uzunTarih(kayit.sonraki)})`,
    ].join("\n");

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(icerik))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarlar[index]))
    );
  });

  return container;
}

function yaklasanDogumGunleriniAl(guildId, bugun) {
  const dogumgunleri = jsonOku(dogumgunleriPath);

  return Object.entries(dogumgunleri[guildId] ?? {})
    .map(([kullaniciId, kayit]) => {
      const dogumGunu = dogumGunuCoz(kayit);
      const sonraki = dogumGunu ? sonrakiDogumGunu(dogumGunu, bugun) : null;
      return dogumGunu && sonraki ? { kullaniciId, dogumGunu, sonraki } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.sonraki.zaman - b.sonraki.zaman);
}

function yaklasanlarButonSatiriOlustur(ownerId, sayfa, toplamSayfa) {
  const oncekiSayfa = Math.max(0, sayfa - 1);
  const sonrakiSayfa = Math.min(toplamSayfa - 1, sayfa + 1);

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${YAKLASANLAR_BUTON_PREFIXI}:${ownerId}:${oncekiSayfa}:onceki`)
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(sayfa === 0),
    new ButtonBuilder()
      .setCustomId(`${YAKLASANLAR_BUTON_PREFIXI}:${ownerId}:${sayfa}:sayfa`)
      .setLabel(`${sayfa + 1}/${toplamSayfa}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${YAKLASANLAR_BUTON_PREFIXI}:${ownerId}:${sonrakiSayfa}:sonraki`)
      .setEmoji("➡️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(sayfa === toplamSayfa - 1)
  );
}

async function yaklasanlarSayfasiOlustur(interaction, istenenSayfa, ownerId) {
  const bugun = istanbulBugunu();
  const tumKayitlar = yaklasanDogumGunleriniAl(interaction.guildId, bugun);
  if (tumKayitlar.length === 0) return null;

  const toplamSayfa = Math.ceil(tumKayitlar.length / YAKLASANLAR_SAYFA_BOYUTU);
  const sayfa = Math.max(0, Math.min(Number(istenenSayfa) || 0, toplamSayfa - 1));
  const baslangic = sayfa * YAKLASANLAR_SAYFA_BOYUTU;
  const sayfaKayitlari = tumKayitlar.slice(
    baslangic,
    baslangic + YAKLASANLAR_SAYFA_BOYUTU
  );
  const container = await yaklasanDogumGunleriGorunumuOlustur(
    interaction,
    sayfaKayitlari,
    bugun,
    baslangic
  );

  return {
    components: [
      container,
      yaklasanlarButonSatiriOlustur(ownerId, sayfa, toplamSayfa),
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function bosYaklasanlarGorunumuOlustur() {
  return new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojiler.uyari} Kayıt Bulunamadı\nSunucuda kayıtlı bir doğum günü bulunmuyor.`
      )
    );
}

function tarihSecenekleri(subcommand, kullaniciSecenegi = false) {
  if (kullaniciSecenegi) {
    subcommand.addUserOption(option =>
      option
        .setName("kullanıcı")
        .setDescription("Doğum günü ayarlanacak üye.")
        .setRequired(true)
    );
  }

  return subcommand
    .addIntegerOption(option =>
      option
        .setName("gün")
        .setDescription("Doğduğunuz gün.")
        .setMinValue(1)
        .setMaxValue(31)
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("ay")
        .setDescription("Doğduğunuz ay.")
        .setMinValue(1)
        .setMaxValue(12)
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("yıl")
        .setDescription("Doğduğunuz yıl (isteğe bağlı).")
        .setMinValue(new Date().getFullYear() - 100)
        .setMaxValue(new Date().getFullYear())
        .setRequired(false)
    );
}

const data = new SlashCommandBuilder()
  .setName("doğum-günü")
  .setDescription("Doğum günü sistemi komutları.")
  .addSubcommand(subcommand =>
    tarihSecenekleri(
      subcommand
        .setName("kaydet")
        .setDescription("Doğum gününü sisteme kaydet.")
    )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("görüntüle")
      .setDescription("Kendinin veya başka bir üyenin doğum gününü göster.")
      .addUserOption(option =>
        option
          .setName("kullanıcı")
          .setDescription("Doğum günü görüntülenecek üye.")
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("unut")
      .setDescription("Doğum günü kaydını sistemden kaldır.")
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("yaklaşanlar")
      .setDescription("Sunucudaki yaklaşan 10 doğum gününü göster.")
  )
  .addSubcommand(subcommand =>
    tarihSecenekleri(
      subcommand
        .setName("kullanıcı-ayarla")
        .setDescription("Belirli bir üyenin doğum gününü ayarla."),
      true
    )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("ayarları")
      .setDescription("Doğum günü sistemini açar, kapatır ve ayarlar.")
      .addBooleanOption(option =>
        option
          .setName("aktif")
          .setDescription("Sistem açık mı, kapalı mı?")
          .setRequired(true)
      )
      .addChannelOption(option =>
        option
          .setName("kanal")
          .setDescription("Doğum günü mesajlarının gönderileceği kanal.")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true)
      )
      .addRoleOption(option =>
        option
          .setName("rol")
          .setDescription("Doğum günü olan üyelere verilecek rol.")
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("kullanıcı-sil")
      .setDescription("Belirli bir üyenin doğum günü kaydını kaldır.")
      .addUserOption(option =>
        option
          .setName("kullanıcı")
          .setDescription("Doğum günü kaydı kaldırılacak üye.")
          .setRequired(true)
      )
  );

async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand(true);
  const guildId = interaction.guildId;

  if (YETKILI_KOMUTLARI.has(subcommand) && !yoneticiMi(interaction)) {
    return interaction.reply({
      content: `${emojiler.uyari} **Bu komutu sadece yöneticiler kullanabilir.**`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === "ayarları") {
    const aktif = interaction.options.getBoolean("aktif", true);
    const kanal = interaction.options.getChannel("kanal", true);
    const rol = interaction.options.getRole("rol", true);
    const botUyesi = interaction.guild.members.me;

    if (rol.id === interaction.guildId || rol.managed) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu rol doğum günü rolü olarak kullanılamaz.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (botUyesi && rol.position >= botUyesi.roles.highest.position) {
      return interaction.reply({
        content: `${emojiler.uyari} **Seçilen rol botun en yüksek rolünden aşağıda olmalı.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (aktif && botUyesi) {
      const kanalYetkileri = kanal.permissionsFor(botUyesi);
      if (!kanalYetkileri?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
        return interaction.reply({
          content: `${emojiler.uyari} **Botun seçilen kanalı görme ve mesaj gönderme yetkisi olmalı.**`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    const ayarlar = jsonOku(ayarlarPath);
    ayarlar[guildId] = {
      enabled: aktif,
      kanalId: kanal.id,
      rolId: rol.id,
    };
    jsonYaz(ayarlarPath, ayarlar);

    const embed = new EmbedBuilder()
      .setColor(aktif ? 0x57f287 : 0xed4245)
      .setTitle("⚙️ Doğum Günü Sistemi Ayarlandı")
      .setDescription([
        `**Durum:** ${aktif ? "Açık" : "Kapalı"}`,
        `**Kanal:** <#${kanal.id}>`,
        `**Rol:** <@&${rol.id}>`,
        "",
        "Doğum günü kutlamaları saat **10:00'da** yapılır.",
      ].join("\n"));

    return interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  }

  const ayarlar = jsonOku(ayarlarPath);
  const ayar = ayarlar[guildId];
  if (!await sistemiDogrula(interaction, ayar)) return;

  if (subcommand === "kaydet" || subcommand === "kullanıcı-ayarla") {
    const sonuc = girilenDogumGununuAl(interaction);
    if (sonuc.hata) {
      return interaction.reply({
        content: `${emojiler.uyari} **${sonuc.hata}**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const kullanici = subcommand === "kullanıcı-ayarla"
      ? interaction.options.getUser("kullanıcı", true)
      : interaction.user;
    const dogumgunleri = jsonOku(dogumgunleriPath);
    if (!dogumgunleri[guildId]) dogumgunleri[guildId] = {};
    dogumgunleri[guildId][kullanici.id] = dogumGunuKayitMetni(sonuc.deger);
    jsonYaz(dogumgunleriPath, dogumgunleri);

    const embed = dogumGunuEmbediOlustur(
      kullanici,
      sonuc.deger,
      "🎉 Doğum Günü Kaydedildi",
      kullanici.id !== interaction.user.id
    );

    return interaction.reply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  }

  if (subcommand === "görüntüle") {
    const kullanici = interaction.options.getUser("kullanıcı") ?? interaction.user;
    const dogumgunleri = jsonOku(dogumgunleriPath);
    const dogumGunu = dogumGunuCoz(dogumgunleri[guildId]?.[kullanici.id]);

    if (!dogumGunu) {
      return interaction.reply({
        content: kullanici.id === interaction.user.id
          ? `${emojiler.uyari} **Kayıtlı doğum gününüz bulunmuyor.**`
          : `${emojiler.uyari} **Bu üyenin kayıtlı doğum günü bulunmuyor.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const embed = dogumGunuEmbediOlustur(
      kullanici,
      dogumGunu,
      "🎂 Doğum Günü Bilgisi",
      kullanici.id !== interaction.user.id
    );

    return interaction.reply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  }

  if (subcommand === "unut" || subcommand === "kullanıcı-sil") {
    const kullanici = subcommand === "kullanıcı-sil"
      ? interaction.options.getUser("kullanıcı", true)
      : interaction.user;
    const dogumgunleri = jsonOku(dogumgunleriPath);

    if (!dogumgunleri[guildId]?.[kullanici.id]) {
      return interaction.reply({
        content: kullanici.id === interaction.user.id
          ? `${emojiler.uyari} **Kayıtlı doğum gününüz bulunmuyor.**`
          : `${emojiler.uyari} **Bu üyenin kayıtlı doğum günü bulunmuyor.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    delete dogumgunleri[guildId][kullanici.id];
    if (Object.keys(dogumgunleri[guildId]).length === 0) delete dogumgunleri[guildId];
    jsonYaz(dogumgunleriPath, dogumgunleri);

    return interaction.reply({
      content: kullanici.id === interaction.user.id
        ? `${emojiler.tik} Doğum günü kaydınız **silindi.**`
        : `${emojiler.tik} <@${kullanici.id}> adlı üyenin doğum günü kaydı **silindi.**`,
      allowedMentions: { parse: [] },
    });
  }

  if (subcommand === "yaklaşanlar") {
    const kayitSayisi = yaklasanDogumGunleriniAl(guildId, istanbulBugunu()).length;
    if (kayitSayisi === 0) {
      return interaction.reply({
        content: `${emojiler.uyari} **Sunucuda kayıtlı bir doğum günü bulunmuyor.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const payload = await yaklasanlarSayfasiOlustur(interaction, 0, interaction.user.id);

    if (!payload) {
      return interaction.editReply({
        components: [bosYaklasanlarGorunumuOlustur()],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
    }

    return interaction.editReply(payload);
  }
}

async function handleButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith(`${YAKLASANLAR_BUTON_PREFIXI}:`)) {
    return;
  }

  const [, ownerId, sayfaMetni] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) {
    return interaction.reply({
      content: `${emojiler.uyari} **Bu sayfalama paneli size ait değil.**`,
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferUpdate();
  const payload = await yaklasanlarSayfasiOlustur(
    interaction,
    Number.parseInt(sayfaMetni, 10),
    ownerId
  );

  if (!payload) {
    return interaction.editReply({
      components: [bosYaklasanlarGorunumuOlustur()],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  }

  return interaction.editReply(payload);
}

module.exports = { data, execute, handleButton };
