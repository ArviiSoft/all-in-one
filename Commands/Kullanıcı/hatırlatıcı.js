const { SlashCommandBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, escapeMarkdown } = require('discord.js');
const fs = require('../../Utils/Core/databaseFs');
const path = require('path');
const emojiler = require("../../Utils/Emojis/emojiler.js");

const veriYolu = path.join(__dirname, '../../Database/Bildirimler ve Sosyal Medya/hatirlatici.json');
const LISTE_BUTON_PREFIXI = 'hatirlatici';
const SAYFA_BOYUTU = 10;
const LISTE_RENGI = 0xf0b232;
const MAKSIMUM_ONIZLEME_UZUNLUGU = 300;

function veriOku() {
  if (!fs.existsSync(veriYolu)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(veriYolu, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function veriYaz(data) {
  fs.writeFileSync(veriYolu, JSON.stringify(data, null, 2));
}

function guvenliOnizleme(metin) {
  const tekSatir = String(metin ?? '')
    .replace(/\s+/g, ' ')
    .trim() || 'Metin bulunamadı.';
  const kisaltilmis = tekSatir.length > MAKSIMUM_ONIZLEME_UZUNLUGU
    ? `${tekSatir.slice(0, MAKSIMUM_ONIZLEME_UZUNLUGU - 1)}…`
    : tekSatir;

  const guvenli = escapeMarkdown(kisaltilmis, {
    heading: true,
    bulletedList: true,
    numberedList: true,
    maskedLink: true,
  });

  if (guvenli.length <= MAKSIMUM_ONIZLEME_UZUNLUGU) return guvenli;
  return `${guvenli.slice(0, MAKSIMUM_ONIZLEME_UZUNLUGU - 1).replace(/\\$/, '')}…`;
}

function listeButonIdsi(eylem, ownerId, sayfa, ek = '') {
  return [LISTE_BUTON_PREFIXI, eylem, ownerId, sayfa, ek]
    .filter(parca => parca !== '')
    .join(':');
}

function sayfalamaSatiriOlustur(ownerId, sayfa, toplamSayfa) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(listeButonIdsi('sayfa', ownerId, Math.max(0, sayfa - 1), 'onceki'))
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(sayfa === 0),
    new ButtonBuilder()
      .setCustomId(listeButonIdsi('mevcut', ownerId, sayfa))
      .setLabel(`${sayfa + 1}/${toplamSayfa}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(listeButonIdsi('sayfa', ownerId, Math.min(toplamSayfa - 1, sayfa + 1), 'sonraki'))
      .setEmoji('➡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(sayfa === toplamSayfa - 1)
  );
}

function bosListePayloadi() {
  const container = new ContainerBuilder()
    .setAccentColor(LISTE_RENGI)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '## ⏰ Hatırlatıcıların',
        `${emojiler.uyari} **Aktif bir hatırlatıcın bulunmuyor.**`,
      ].join('\n'))
    );

  return {
    components: [container],
    allowedMentions: { parse: [] },
  };
}

function listePayloadiOlustur(kayitlar, ownerId, istenenSayfa = 0) {
  if (!kayitlar.length) return bosListePayloadi();

  const toplamSayfa = Math.max(1, Math.ceil(kayitlar.length / SAYFA_BOYUTU));
  const sayfa = Math.max(0, Math.min(Number(istenenSayfa) || 0, toplamSayfa - 1));
  const baslangic = sayfa * SAYFA_BOYUTU;
  const sayfaKayitlari = kayitlar.slice(baslangic, baslangic + SAYFA_BOYUTU);

  const container = new ContainerBuilder()
    .setAccentColor(LISTE_RENGI)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '## ⏰ Hatırlatıcıların',
        `-# Toplam **${kayitlar.length}** aktif hatırlatıcı`,
      ].join('\n'))
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small)
    );

  sayfaKayitlari.forEach((kayit, index) => {
    const mutlakSira = baslangic + index;
    const icerik = [
      `**${mutlakSira + 1}.** <t:${kayit.zaman}:F> (**<t:${kayit.zaman}:R>**)`,
      `> \`${guvenliOnizleme(kayit.text)}\``,
    ].join('\n');

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(icerik))
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(listeButonIdsi('sil', ownerId, sayfa, `${mutlakSira}:${kayit.id}`))
            .setLabel(`${mutlakSira + 1}. Hatırlatıcıyı Sil`)
            .setStyle(ButtonStyle.Danger)
        )
    );
  });

  container.addActionRowComponents(
    sayfalamaSatiriOlustur(ownerId, sayfa, toplamSayfa)
  );

  return {
    components: [container],
    allowedMentions: { parse: [] },
  };
}

function turkceSureyiMsyeCevir(sureStr) {
  sureStr = sureStr.toLowerCase();
  const regex = /(\d+)\s*(saniye|dakika|saat|gün|hafta|ay|yıl)/;
  const match = sureStr.match(regex);
  if (!match) return null;

  const miktar = parseInt(match[1]);
  const birim = match[2];

  switch (birim) {
    case 'saniye': return miktar * 1000;
    case 'dakika': return miktar * 60 * 1000;
    case 'saat':   return miktar * 60 * 60 * 1000;
    case 'gün':    return miktar * 24 * 60 * 60 * 1000;
    case 'hafta':  return miktar * 7 * 24 * 60 * 60 * 1000;
    case 'ay':     return miktar * 30 * 24 * 60 * 60 * 1000;
    case 'yıl':    return miktar * 365 * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

async function hatirlatmaGonder(client, hatirlatma) {
  const kanal = await client.channels.fetch(hatirlatma.channelId).catch(() => null);
  if (!kanal) return;

  const butonlar = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Orijinal Mesaja Git')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${hatirlatma.guildId}/${hatirlatma.channelId}/${hatirlatma.messageId}`),
    new ButtonBuilder()
      .setCustomId(`okundu_${hatirlatma.userId}_${hatirlatma.id}`)
      .setLabel('Tamamdır')
      .setStyle(ButtonStyle.Primary)
      .setEmoji("👁️")
  );

  await kanal.send({
    content: `${emojiler.bildirim} <@${hatirlatma.userId}> | **<t:${hatirlatma.zaman}:F>** (**<t:${hatirlatma.zaman}:R>**) için hatırlatma: \`${hatirlatma.text}\``,
    components: [butonlar]
  }).catch(() => null);

  const veri = veriOku();
  const yeniVeri = veri.filter(v => v.id !== hatirlatma.id);
  veriYaz(yeniVeri);
}

function hatirlatmalariYukle(client) {
  const kontrolEt = () => {
    const simdi = Math.floor(Date.now() / 1000);
    const aktifler = veriOku();

    for (const h of aktifler) {
      if (h.zaman <= simdi) {
        hatirlatmaGonder(client, h);
      }
    }
  };

  setInterval(kontrolEt, 60 * 1000);
  console.log(`⏰ [HATIRLATICI] Kontrol sistemi başlatıldı.`);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hatırlatıcı')
    .setDescription('Hatırlatıcı oluşturur, listeler veya siler.')
    .addSubcommand(sub =>
      sub.setName('ekle')
        .setDescription('Yeni bir hatırlatıcı oluşturur.')
        .addStringOption(opt =>
          opt.setName('süre')
            .setDescription("Süre gir (örnek: '10 dakika', '2 saat', '1 gün').")
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('metin')
            .setDescription('Metin gir.')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('listele')
        .setDescription('Kendi hatırlatıcılarını listeler.')
    )
    .addSubcommand(sub =>
      sub.setName('sil')
        .setDescription('Bir hatırlatıcıyı siler.')
        .addIntegerOption(opt =>
          opt.setName('numara')
            .setDescription('Hatırlatıcının numarasını gir. (1, 2, 3...)')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const veri = veriOku();

    if (sub === 'ekle') {
      const sureStr = interaction.options.getString('süre');
      const metin = interaction.options.getString('metin');
      const ms = turkceSureyiMsyeCevir(sureStr);
      const hedefZaman = Math.floor((Date.now() + ms) / 1000);

      if (!ms) {
        return interaction.reply({ content: `${emojiler.uyari} **Geçerli bir süre gir.**`, flags: 64 });
      }

      await interaction.reply({
        content: `${emojiler.tik} Tamamdır <@${interaction.user.id}>, seni **<t:${hedefZaman}:F>** (**<t:${hedefZaman}:R>**) tarihinde hatırlatacağım: \`${metin}\``
      });
      const msg = await interaction.fetchReply();

      const hatirlatmaId = `${interaction.user.id}-${Date.now()}`;
      veri.push({
        id: hatirlatmaId,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: interaction.channel.id,
        messageId: msg.id, 
        text: metin,
        zaman: hedefZaman
      });

      veriYaz(veri);

      if (ms <= 2147483647) {
        setTimeout(() => hatirlatmaGonder(interaction.client, {
          ...veri.find(v => v.id === hatirlatmaId)
        }), ms);
      }
    }

    if (sub === 'listele') {
      const kullaniciVeri = veri.filter(v => v.userId === interaction.user.id);
      return interaction.reply({
        ...listePayloadiOlustur(kullaniciVeri, interaction.user.id),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (sub === 'sil') {
      const numara = interaction.options.getInteger('numara');
      const kullaniciVeri = veri.filter(v => v.userId === interaction.user.id);

      if (!kullaniciVeri[numara - 1]) {
        return interaction.reply({ content: `${emojiler.uyari} **Geçersiz numara.**`, flags: 64 });
      }

      const silinecek = kullaniciVeri[numara - 1];
      const yeniVeri = veri.filter(v => v.id !== silinecek.id);
      veriYaz(yeniVeri);

      await interaction.reply({ content: `${emojiler.tik} **"${silinecek.text}"** adlı hatırlatıcı **silindi.**`, flags: 64 });
    }
  }
};

module.exports.handleButton = async function handleButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith(`${LISTE_BUTON_PREFIXI}:`)) {
    return;
  }

  const [prefix, eylem, ownerId, sayfaMetni, , ...idParcalari] = interaction.customId.split(':');
  if (prefix !== LISTE_BUTON_PREFIXI || !['sayfa', 'sil'].includes(eylem)) return;

  if (interaction.user.id !== ownerId) {
    return interaction.reply({
      content: `${emojiler.uyari} **Bu hatırlatıcı paneli sana ait değil.**`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const istenenSayfa = Number.parseInt(sayfaMetni, 10) || 0;

  if (eylem === 'sayfa') {
    await interaction.deferUpdate();
    const kullaniciVeri = veriOku().filter(kayit => kayit.userId === ownerId);
    return interaction.editReply(listePayloadiOlustur(kullaniciVeri, ownerId, istenenSayfa));
  }

  const hatirlatmaId = idParcalari.join(':');
  const veri = veriOku();
  const hedef = veri.find(kayit => kayit.id === hatirlatmaId);

  if (!hedef || hedef.userId !== ownerId) {
    await interaction.deferUpdate();
    const kullaniciVeri = veri.filter(kayit => kayit.userId === ownerId);
    await interaction.editReply(listePayloadiOlustur(kullaniciVeri, ownerId, istenenSayfa));
    return interaction.followUp({
      content: `${emojiler.uyari} **Bu hatırlatıcı zaten silinmiş.**`,
      flags: MessageFlags.Ephemeral,
    });
  }

  veriYaz(veri.filter(kayit => kayit.id !== hatirlatmaId));
  await interaction.deferUpdate();

  const kullaniciVeri = veri
    .filter(kayit => kayit.id !== hatirlatmaId && kayit.userId === ownerId);
  await interaction.editReply(listePayloadiOlustur(kullaniciVeri, ownerId, istenenSayfa));

  return interaction.followUp({
    content: `${emojiler.tik} **"${guvenliOnizleme(hedef.text)}"** adlı hatırlatıcı **silindi.**`,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
};

module.exports.hatirlatmalariYukle = hatirlatmalariYukle;
module.exports.listePayloadiOlustur = listePayloadiOlustur;