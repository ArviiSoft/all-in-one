const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ChannelSelectMenuBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, LabelBuilder } = require("discord.js");
const fs = require("../../Utils/Core/databaseFs");
const path = require("path");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const ayarlar = require('../../Utils/Core/generalSettings').settings;
const { clearPersistentVoiceChannel, setPersistentVoiceChannel } = require("../../Utils/Voice/persistentVoiceConnection.js");

const dosyaYolu = path.join(__dirname, "../../Database/Ses Sistemleri/sesKanali.json");
const PANEL_SURESI = 10 * 60 * 1000;
const kontrolIdleri = {
  ekle: "ses_kanali:ekle",
  aktifSec: "ses_kanali:aktif_sec",
  tekTekSifirla: "ses_kanali:tek_tek_sifirla",
  sifirla: "ses_kanali:sifirla",
  sifirlamayiOnayla: "ses_kanali:sifirlamayi_onayla",
  sifirlamayiIptalEt: "ses_kanali:sifirlamayi_iptal_et"
};

function veriOku() {
  if (!fs.existsSync(dosyaYolu)) return {};
  try {
    return JSON.parse(fs.readFileSync(dosyaYolu, "utf8"));
  } catch {
    return {};
  }
}

function veriYaz(veri) {
  fs.writeFileSync(dosyaYolu, JSON.stringify(veri, null, 2), "utf8");
}

function kayitliKanallariGetir(veri) {
  if (!Array.isArray(veri.sesKanallari)) return [];
  return [...new Set(veri.sesKanallari.filter(kanalId => typeof kanalId === "string"))];
}

function panelSatirlariniOlustur(guild, veri, devreDisi = false) {
  const kanallar = kayitliKanallariGetir(veri);
  const aktifKanalSunucuda = guild.channels.cache.has(veri.aktifSesKanali);

  const kanalEkle = new ChannelSelectMenuBuilder()
    .setCustomId(kontrolIdleri.ekle)
    .setPlaceholder("Listeye eklenecek ses kanalını seçin...")
    .setChannelTypes(ChannelType.GuildVoice)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(devreDisi);

  const aktifKanalSec = new ChannelSelectMenuBuilder()
    .setCustomId(kontrolIdleri.aktifSec)
    .setPlaceholder("Aktif kullanılacak ses kanalını seçin...")
    .setChannelTypes(ChannelType.GuildVoice)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(devreDisi || kanallar.length === 0);

  if (aktifKanalSunucuda) aktifKanalSec.setDefaultChannels(veri.aktifSesKanali);

  const tekTekSifirla = new ButtonBuilder()
    .setCustomId(kontrolIdleri.tekTekSifirla)
    .setLabel("Sıfırla")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(devreDisi || kanallar.length === 0);

  const sifirla = new ButtonBuilder()
    .setCustomId(kontrolIdleri.sifirla)
    .setLabel("Tümünü Sıfırla")
    .setStyle(ButtonStyle.Danger)
    .setDisabled(devreDisi || (kanallar.length === 0 && !veri.aktifSesKanali));

  return [
    new ActionRowBuilder().addComponents(kanalEkle),
    new ActionRowBuilder().addComponents(aktifKanalSec),
    new ActionRowBuilder().addComponents(tekTekSifirla, sifirla)
  ];
}

function panelEmbediniOlustur(veri, onayBekliyor = false) {
  const kanallar = kayitliKanallariGetir(veri);
  const gosterilecekKanallar = kanallar.slice(0, 25);
  const kanalListesi = gosterilecekKanallar.length
    ? gosterilecekKanallar
      .map((kanalId, index) => `${index + 1}. <#${kanalId}>${veri.aktifSesKanali === kanalId ? ` — ${emojiler.tik} **Aktif**` : ""}`)
      .join("\n")
    : "Henüz bir ses kanalı eklenmemiş.";
  const kalanKanalSayisi = kanallar.length - gosterilecekKanallar.length;

  if (onayBekliyor) {
    return new EmbedBuilder()
      .setColor("Red")
      .setTitle("Ses Kanalı Ayarlarını Sıfırla")
      .setDescription([
        `${emojiler.uyari} Kayıtlı tüm ses kanalları ve aktif kanal seçimi silinecek. Devam etmek istediğinizden emin misiniz?"`,
        "",
        `-# ${emojiler.info} **__Bu işlem yalnızca bot ayarlarını temizler, Discord kanalları silinmez.__**`,
      ].join("\n"));
  }

  const aciklama = [
    "- Aşağıdaki menülerden yeni bir kanal ekleyebilir veya kayıtlı kanallardan birini aktif hale getirebilirsiniz.",
    `-# ${emojiler.info} **__Aktif kanal olarak yalnızca önce listeye eklenmiş bir kanal seçilebilir.__**`,
    "",
    `${emojiler.colorized_volume_max} **Aktif ses kanalı:** ${veri.aktifSesKanali ? `${emojiler.colorized_volume_max} <#${veri.aktifSesKanali}>` : "Ayarlı değil"}`,
    `💾 **Kayıtlı ses kanalları (${kanallar.length}):**`,
    kanalListesi
  ];

  if (kalanKanalSayisi > 0) aciklama.push(`-# ve ${kalanKanalSayisi} kanal daha...`);

  return new EmbedBuilder()
    .setColor("Blurple")
    .setTitle("Ses Kanalı Yönetim Paneli")
    .setDescription(aciklama.join("\n"));
}

function panelIceriginiOlustur(guild, veri, devreDisi = false) {
  return {
    embeds: [panelEmbediniOlustur(veri)],
    components: panelSatirlariniOlustur(guild, veri, devreDisi)
  };
}

function sifirlamaOnayIceriginiOlustur(veri) {
  const onaySatiri = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(kontrolIdleri.sifirlamayiOnayla)
      .setLabel("Evet, sıfırla")
      .setEmoji(`${emojiler.tik}`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(kontrolIdleri.sifirlamayiIptalEt)
      .setLabel("Vazgeç")
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [panelEmbediniOlustur(veri, true)],
    components: [onaySatiri]
  };
}

function kanalSifirlamaFormunuOlustur(guild, veri, interactionId) {
  const kanallar = kayitliKanallariGetir(veri).slice(0, 25);
  const secenekler = kanallar.map(kanalId => {
    const kanal = guild.channels.cache.get(kanalId);
    return {
      label: (kanal?.name || `Bilinmeyen Kanal (${kanalId})`).slice(0, 100),
      value: kanalId,
      description: veri.aktifSesKanali === kanalId ? "Aktif ses kanalı" : "Kayıtlı ses kanalı"
    };
  });

  return new ModalBuilder()
    .setCustomId(`ses_kanali_tek_tek_sifirla:${interactionId}`)
    .setTitle("Ses Kanallarını Sıfırla")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Sıfırlanacak ses kanalları")
        .setDescription("Listeden kaldırmak istediğiniz kanalları seçin.")
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId("sifirlanacak_ses_kanallari")
            .setPlaceholder("Ses kanallarını seçin...")
            .setRequired(true)
            .setMinValues(1)
            .setMaxValues(secenekler.length)
            .addOptions(secenekler)
        )
    );
}

async function etkilesimHatasiGonder(component, hata) {
  console.error("🔴 [SES KANALI] Panel etkileşimi işlenemedi:", hata);
  const icerik = { content: `${emojiler.uyari} **İşlem sırasında hata oluştu.**` };
  if (component.deferred) return component.editReply(icerik).catch(() => null);
  if (component.replied) return component.followUp({ ...icerik, flags: 64 }).catch(() => null);
  return component.reply({ ...icerik, flags: 64 }).catch(() => null);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ses-kanalı")
    .setDescription("Ses kanalı yönetim panelini açar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const sahipID = ayarlar.sahipID;
    if (interaction.user.id !== sahipID) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu komutu sadece <@${sahipID}> kullanabilir.**`,
        flags: 64
      });
    }

    const response = await interaction.reply({
      ...panelIceriginiOlustur(interaction.guild, veriOku()),
      flags: 64,
      withResponse: true
    });
    const message = response.resource?.message || await interaction.fetchReply().catch(() => null);
    if (!message) return;

    const collector = message.createMessageComponentCollector({ time: PANEL_SURESI });

    collector.on("collect", async component => {
      if (component.user.id !== sahipID) {
        return component.reply({
          content: `${emojiler.uyari} **Bu paneli sadece botun sahibi kullanabilir.**`,
          flags: 64
        });
      }

      try {
        if (component.customId === kontrolIdleri.ekle && component.isChannelSelectMenu()) {
          await component.deferReply({ flags: 64 });
          const kanalId = component.values[0];
          const kanal = await interaction.guild.channels.fetch(kanalId).catch(() => null);

          if (!kanal || kanal.type !== ChannelType.GuildVoice) {
            return component.editReply({ content: `${emojiler.uyari} **Seçilen ses kanalı bulunamadı.**` });
          }

          const veri = veriOku();
          const kanallar = kayitliKanallariGetir(veri);
          if (kanallar.includes(kanal.id)) {
            return component.editReply({ content: `${emojiler.uyari} **Bu kanal zaten listede.**` });
          }

          kanallar.push(kanal.id);
          veri.sesKanallari = kanallar;
          veriYaz(veri);
          await message.edit(panelIceriginiOlustur(interaction.guild, veri)).catch(() => {});

          return component.editReply({
            content: `${emojiler.tik} **${kanal.name}** listeye **eklendi.**`
          });
        }

        if (component.customId === kontrolIdleri.aktifSec && component.isChannelSelectMenu()) {
          await component.deferReply({ flags: 64 });
          const kanalId = component.values[0];
          const veri = veriOku();
          const kanallar = kayitliKanallariGetir(veri);

          if (!kanallar.includes(kanalId)) {
            return component.editReply({
              content: `${emojiler.uyari} **Bu kanal listede yok.**\n\n${emojiler.info} Önce panelin üst menüsünden kanalı listeye **ekleyin.**`
            });
          }

          const kanal = await interaction.guild.channels.fetch(kanalId).catch(() => null);
          if (!kanal || kanal.type !== ChannelType.GuildVoice) {
            return component.editReply({ content: `${emojiler.uyari} **Seçilen ses kanalı bulunamadı.**` });
          }

          veri.sesKanallari = kanallar;
          veri.aktifSesKanali = kanal.id;
          veriYaz(veri);
          await message.edit(panelIceriginiOlustur(interaction.guild, veri)).catch(() => {});

          const baglanti = await setPersistentVoiceChannel(interaction.client, kanal);

          return component.editReply({
            content: baglanti.connected
              ? `${emojiler.tik} Aktif ses kanalı **değiştirildi** ve bot kanala bağlandı. ${emojiler.sadesagok} **(<#${kanal.id}>)**`
              : `${emojiler.uyari} Aktif ses kanalı **değiştirildi**, bağlantı yöneticisi kanala yeniden bağlanmayı deneyecek. ${emojiler.sadesagok} **(<#${kanal.id}>)**`
          });
        }

        if (component.customId === kontrolIdleri.tekTekSifirla && component.isButton()) {
          const veri = veriOku();
          const kanallar = kayitliKanallariGetir(veri);
          if (kanallar.length === 0) {
            return component.reply({
              content: `${emojiler.uyari} **Sıfırlanabilecek kayıtlı bir ses kanalı yok.**`,
              flags: 64
            });
          }

          const modal = kanalSifirlamaFormunuOlustur(interaction.guild, veri, component.id);
          await component.showModal(modal);
          const submitted = await component.awaitModalSubmit({
            filter: modalInteraction => modalInteraction.customId === modal.data.custom_id && modalInteraction.user.id === sahipID,
            time: 60 * 1000
          }).catch(() => null);

          if (!submitted) {
            return component.followUp({
              content: `${emojiler.saat} **Formun süresi doldu.**`,
              flags: 64
            });
          }

          await submitted.deferReply({ flags: 64 });
          const secilenKanallar = submitted.fields.getStringSelectValues("sifirlanacak_ses_kanallari");
          const secilenKanalSeti = new Set(secilenKanallar);
          const guncelVeri = veriOku();
          const kalanKanallar = kayitliKanallariGetir(guncelVeri).filter(kanalId => !secilenKanalSeti.has(kanalId));

          if (kalanKanallar.length > 0) guncelVeri.sesKanallari = kalanKanallar;
          else delete guncelVeri.sesKanallari;
          const aktifKanalSilindi = secilenKanalSeti.has(guncelVeri.aktifSesKanali);
          if (aktifKanalSilindi) delete guncelVeri.aktifSesKanali;
          veriYaz(guncelVeri);
          if (aktifKanalSilindi) clearPersistentVoiceChannel();

          await message.edit(panelIceriginiOlustur(interaction.guild, guncelVeri)).catch(() => {});
          return submitted.editReply({
            content: `${emojiler.tik} Seçilen ses kanalları listeden **kaldırıldı.**\n\n${secilenKanallar.map(kanalId => `- <#${kanalId}>`).join("\n")}`
          });
        }

        if (component.customId === kontrolIdleri.sifirla && component.isButton()) {
          const veri = veriOku();
          const kanallar = kayitliKanallariGetir(veri);
          if (kanallar.length === 0 && !veri.aktifSesKanali) {
            return component.reply({
              content: `${emojiler.uyari} **Ayarlanmış herhangi bir ses kanalı yok.**`,
              flags: 64
            });
          }

          return component.update(sifirlamaOnayIceriginiOlustur(veri));
        }

        if (component.customId === kontrolIdleri.sifirlamayiIptalEt && component.isButton()) {
          return component.update(panelIceriginiOlustur(interaction.guild, veriOku()));
        }

        if (component.customId === kontrolIdleri.sifirlamayiOnayla && component.isButton()) {
          const veri = veriOku();
          delete veri.sesKanallari;
          delete veri.aktifSesKanali;
          veriYaz(veri);
          clearPersistentVoiceChannel();

          await component.update(panelIceriginiOlustur(interaction.guild, veri));
          return component.followUp({
            content: `${emojiler.tik} Tüm ses kanalı ayarları **sıfırlandı.**`,
            flags: 64
          });
        }
      } catch (hata) {
        return etkilesimHatasiGonder(component, hata);
      }
    });

    collector.on("end", () => {
      message.edit(panelIceriginiOlustur(interaction.guild, veriOku(), true)).catch(() => {});
    });
  }
};
