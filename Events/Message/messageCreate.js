const { ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db2 = require('../../Utils/Core/jsonDB');
const { recordAccountMessage } = require('../../Utils/Account/accountMessageStats');
const fs = require("../../Utils/Core/databaseFs");
const path = require("path");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { acceptsAuthor, getChannelSetting } = require("../../Utils/Moderation/alintiRolStore");
const { getGuildConfig: getYetkiliBasvuruConfig } = require("../../Utils/Moderation/yetkiliBasvuruStore.js");
const { getGuildItirafSetting } = require("../../Utils/Engagement/itirafStore");
const { checkTdkWord } = require("../../Utils/Engagement/tdkSozluk");
const { buildGameSetupPayload } = require("../../Utils/Engagement/oyunKurulumPaneli");
const { createAutomationNonce, isBotOrWebhookMessage, isInternalAutomationMessage } = require("../../Utils/Core/messageOrigin");
const { isPatchBotAdEmbed } = require("../../Utils/Core/patchBotAdFilter");
const { createJsonStore } = require("../../Utils/Core/safeJsonStore");
const { resetUsedWords, recoverSessionFromChannel } = require("../../Utils/Engagement/kelimeOyunOturumu");
const cron = require('node-cron');

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//SUNUCUYA ATILAN TÜM MESAJLAR KAYIT
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const id = message.author.id;

  db2.update(data => {
    for (const key of [
      `msg_1d_${id}`,
      `msg_7d_${id}`,
      `msg_total_${id}`,
      `channelMsgCount_${message.channel.id}_${id}`,
    ]) {
      data[key] = (Number.isFinite(data[key]) ? data[key] : 0) + 1;
    }
    recordAccountMessage(data, message);
  });
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//İLTİFAT SİSTEMİ
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const ayarDosyaYolu = path.join(__dirname, '../../Database/Eğlence ve Etkileşim/iltifatVeri.json');
    const iltifatListeYolu = path.join(__dirname, '../../Database/Eğlence ve Etkileşim/iltifatlar.txt');

    if (!fs.existsSync(ayarDosyaYolu)) return;

    const veri = JSON.parse(fs.readFileSync(ayarDosyaYolu, 'utf8'));
    const ayar = veri[message.guild.id];

    if (!ayar || !ayar.status || ayar.channelId !== message.channel.id) return;
    /* 
       RASTGELE TETİKLEME MANTIĞI - Arv1S
       Math.random() 0 ve 1 arasında değer döner,
       0.05 değeri %5 ihtimal demektir (ortalama 20 mesajda bir)

       Oranları değişebilirsin:
       0.10 = %10 ihtimal
       0.02 = %2 ihtimal vs.
       BOTU ÜCRETSİZ PAYLAŞTIK ORDA BURDA BEN YAPTIM DİYE GEZMEYİN/SATMAYA KALKMAYIN LİSANSI VAR. DÜZGÜNCE KULLANIN İŞTE. 
    */
    const olasılık = Math.min(100, Math.max(1, Number(ayar.probabilityPercent) || 3)) / 100;

    if (Math.random() < olasılık) {
        if (ayar.messages?.length || fs.existsSync(iltifatListeYolu)) {
            const iltifatlar = Array.isArray(ayar.messages) && ayar.messages.length ? ayar.messages : fs.readFileSync(iltifatListeYolu, 'utf8')
                .split('\n')
                .map(line => line.trim())
                .filter(line => line !== "");
            
            if (iltifatlar.length > 0) {
                const rastgeleIltifat = iltifatlar[Math.floor(Math.random() * iltifatlar.length)];
                
                setTimeout(async () => {
                    await message.reply({ content: `${rastgeleIltifat}`, allowedMentions: { parse: [], repliedUser: false } }).catch(() => null);
                }, 1000); 
            }
        }
    }
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//AKTİF ÜYE
const aktifDB = require('../../Utils/Engagement/aktifDB');
const { buildActiveMemberPayload, yasakliKisiID } = require('../../Utils/Engagement/embedGenerator');
const yasakliSunucuID = ["990362728197681162"]; 

let lastUpdate = 0;
const updateCooldown = 1000;

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const guildID = message.guild.id;
  const userID = message.author.id;
  const data = aktifDB.loadData();

  if (yasakliSunucuID.includes(guildID)) return;

  if (yasakliKisiID.includes(userID)) return;

  if (data.guild !== guildID) return;

  aktifDB.add(`puan_${userID}`, 1);

  const now = Date.now();
  if (now - lastUpdate < updateCooldown) return;
  lastUpdate = now;

  const updatedData = aktifDB.loadData();
  if (!updatedData.kanal || !updatedData.mesaj) return;

  try {
    const kanal = await client.channels.fetch(updatedData.kanal);
    const mesaj = await kanal.messages.fetch(updatedData.mesaj);
    const payload = buildActiveMemberPayload(updatedData, message.guild);
    if (!mesaj.flags?.has(MessageFlags.IsComponentsV2)) {
      payload.content = null;
      payload.embeds = [];
    }
    await mesaj.edit(payload);
  } catch (err) {
    console.log('🔴 [AKTİF ÜYE - EVENT] Sıralama mesajı güncellenemedi:', err.message);
  }
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//YETKİLİ BAŞVURU SİSTEMİ
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const settings = getYetkiliBasvuruConfig(message.guild.id);

  if (!settings || !settings.basvuruKanal || message.channel.id !== settings.basvuruKanal) return;
  if (!settings.logKanal) return;

  const logChannel = await message.guild.channels.fetch(settings.logKanal).catch(() => null);
  if (!logChannel || logChannel.type !== ChannelType.GuildText) return;

  await message.delete().catch(() => null);

  const embed = new EmbedBuilder()
    .setTitle(`${message.author.globalName || message.author.username} ( ${message.author.username} ) \n${message.author.id}`)
    .setDescription(message.content || '`Metin içeriği bulunmuyor.`')
    .setColor(0xb3ffe6)
    .setThumbnail(message.author.displayAvatarURL());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`yetkili_onayla_${message.author.id}`)  
      .setLabel('Onayla')
      .setStyle(ButtonStyle.Success)
      .setEmoji(emojiler.tik),
    new ButtonBuilder()
      .setCustomId(`yetkili_reddet_${message.author.id}`) 
      .setLabel('Reddet')
      .setStyle(ButtonStyle.Danger)
      .setEmoji(emojiler.carpi)
  );

  await logChannel.send({ embeds: [embed], components: [row] });
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//AFK SİSTEMİ
const afkPath = path.join(__dirname, "../../Database/Üye Verileri/afk.json");

function readAfkDB() {
  if (!fs.existsSync(afkPath)) return {};
  return JSON.parse(fs.readFileSync(afkPath, "utf-8"));
}

function writeAfkDB(data) {
  fs.writeFileSync(afkPath, JSON.stringify(data, null, 2));
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const db = readAfkDB();
  const afkData = db[message.author.id];

  if (afkData) {
    const sureMs = Date.now() - afkData.zaman;
    const gun = Math.floor(sureMs / (1000 * 60 * 60 * 24));
    const saat = Math.floor(sureMs / (1000 * 60 * 60)) % 24;
    const dakika = Math.floor(sureMs / (1000 * 60)) % 60;
    const saniye = Math.floor(sureMs / 1000) % 60;

    let zamanString = "";
    if (gun > 0) zamanString += `${gun} Gün `;
    zamanString += `${String(saat).padStart(2, "0")}:${String(dakika).padStart(2, "0")}:${String(saniye).padStart(2, "0")}`;

    const member = message.guild.members.cache.get(message.author.id);

let yeniIsim;
if (member.nickname && member.nickname.startsWith("[AFK]")) {
  yeniIsim = member.nickname.replace(/^\[AFK\]\s*/i, "");
} else {
  yeniIsim = member.user.globalName || member.user.username;
}

member.setNickname(yeniIsim).catch(() => {});

    delete db[message.author.id];
    writeAfkDB(db);

    return message.reply(`**AFK** modundan çıktın. ${emojiler.sadesagok} ${emojiler.saat} **(** ${zamanString} **)**`).then(sentMsg => {
      setTimeout(() => {
        sentMsg.delete().catch(() => {}); 
      }, 5000);
    });
  }

  const kullanıcı = message.mentions.users.first();
  if (!kullanıcı) return;

  const etiketAFK = db[kullanıcı.id];
if (etiketAFK) {
  message.reply(`Etiketlediğin kişi \`${etiketAFK.sebep}\` sebebiyle **AFK** 💤`).then(sentMsg => {
    setTimeout(() => {
      sentMsg.delete().catch(() => {}); 
    }, 5000);
  });
}
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//OTO PUBLISH SİSTEMİ
const dbPath33 = path.join(__dirname, '../../Database/Sunucu Yönetimi/otoPublish.json');

const publishQueue = [];
let processing = false;

client.on("messageCreate", async (message) => {
  if (!message.guild || message.channel.type !== ChannelType.GuildAnnouncement) return;

  let otoPublishData;
  try {
    otoPublishData = fs.existsSync(dbPath33)
      ? JSON.parse(fs.readFileSync(dbPath33, 'utf-8'))
      : {};
  } catch (err) {
    console.error('🔴 [OTO PUBLISH - EVENT] otoPublish.json okuma hatası:', err);
    return;
  }

  const channelIds = otoPublishData[message.guild.id];
  if (!Array.isArray(channelIds) || !channelIds.includes(message.channel.id)) return;

  publishQueue.push(message);
  processQueue();
});

async function processQueue() {
  if (processing || publishQueue.length === 0) return;
  processing = true;

  const message = publishQueue.shift();

  try {
    if (message.crosspostable) {
      await message.crosspost();
    } else {
      const kaynakTuru = message.webhookId
        ? "webhook"
        : (message.author.bot ? "bot" : "kullanıcı");
      console.warn(
        `🟡 [OTO PUBLISH - EVENT] Mesaj Discord tarafından yayınlanabilir değil, `
        + `mesaj=${message.id} ● kaynak=${kaynakTuru} ● tür=${message.type} `
        + `● webhook=${Boolean(message.webhookId)} ● poll=${Boolean(message.poll)} `
        + `● flags=${message.flags?.bitfield ?? 0}`
      );
    }
  } catch (err) {
    console.error('🔴 [OTO PUBLISH - EVENT] crosspost() hatası:', err);
  }

  setTimeout(() => {
    processing = false;
    processQueue();
  }, 1100); 
}
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//BOT ETİKET CEVAP
client.on("messageCreate", message => {
  if (message.content === `<@${client.user.id}>`) {
    message.reply({ content: "Efendim?" })
  }
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//ALINTI ROL SİSTEMİ
client.on("messageCreate", async (message) => {
  if (!message.guild) return;
  if (isInternalAutomationMessage(message, client.user.id)) return;

  const setting = getChannelSetting(message.guild.id, message.channel.id);
  if (!setting || !acceptsAuthor(setting.accountType, isBotOrWebhookMessage(message))) return;

  try {
    await message.reply({
      content: setting.roleIds.map(roleId => `<@&${roleId}>`).join(" "),
      nonce: createAutomationNonce("alinti"),
      allowedMentions: {
        parse: [],
        roles: setting.roleIds,
        repliedUser: false
      },
    });
  } catch (err) {
    console.error("🔴 [ALINTI ROL - EVENT] Alıntı rol sistemi hata:", err);
  }
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//OTOMATİK THREAD SİSTEMİ
const filePath22 = path.join(__dirname, "../../Database/Sunucu Yönetimi/otoThread.json");

function readOtoThreadData() {
  if (!fs.existsSync(filePath22)) return {};
  return JSON.parse(fs.readFileSync(filePath22, "utf-8"));
}

client.on("messageCreate", async (message) => {
  if (
    message.channel.type !== ChannelType.GuildText
    && message.channel.type !== ChannelType.GuildAnnouncement
  ) return;

  const data = readOtoThreadData();
  const guildId = message.guild?.id;
  if (!guildId || !data[guildId]) return;

  const ayar = data[guildId][message.channel.id];
  if (!ayar) return;

  if (message.hasThread) return;

  if (message.author.bot && !ayar.botlar) return;

  try {
    await message.startThread({
      name: ayar.isim,
      autoArchiveDuration: ayar.süre,
      reason: ayar.sebep
    });
  } catch (e) {
    console.error("🔴 [OTOMATİK THREAD - EVENT] Thread oluşturulurken hata:", e);
  }
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//VİDEOLARA-FOTOLARA OTOMATİK TEPKİ SİSTEMİ
const {
  getDefaultEmojis: getDefaultMediaEmojis,
  getSetting: getMediaEmojiSetting,
  loadData: loadMediaEmojiData,
} = require("../../Utils/Media/mediaEmojiStore.js");

function hasMediaAttachment(message, mediaType) {
  const contentTypePrefix = mediaType === "image" ? "image/" : "video/";
  const extensionPattern = mediaType === "image"
    ? /\.(?:png|webp|jpe?g|gif)(?:[?#]\S*)?(?:\s|$)/i
    : /\.(?:mp4|webm|mov|mkv)(?:[?#]\S*)?(?:\s|$)/i;

  return message.attachments.some(attachment =>
    attachment.contentType?.startsWith(contentTypePrefix)
    || extensionPattern.test(attachment.name || attachment.url || "")
  ) || extensionPattern.test(message.content);
}

function resolveMediaReactionEmoji(message, emoji) {
  const match = String(emoji).match(/^<a?:[A-Za-z0-9_]+:(\d+)>$/);
  if (!match) return emoji;

  const emojiId = match[1];
  return message.guild.emojis.cache.get(emojiId)
    || emojiler.getEmojiById(emojiId)
    || message.client.guilds.cache.find(guild => guild.emojis.cache.has(emojiId))?.emojis.cache.get(emojiId)
    || emoji;
}

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const kanalId = message.channelId;
  const data = loadMediaEmojiData();
  const defaultEmojis = getDefaultMediaEmojis();
  const imageSetting = getMediaEmojiSetting(data, "görsel", kanalId, defaultEmojis);
  const videoSetting = getMediaEmojiSetting(data, "video", kanalId, defaultEmojis);
  const reactions = new Set();

  if (imageSetting.enabled && hasMediaAttachment(message, "image")) {
    imageSetting.emojis.forEach(emoji => reactions.add(emoji));
  }

  if (videoSetting.enabled && hasMediaAttachment(message, "video")) {
    videoSetting.emojis.forEach(emoji => reactions.add(emoji));
  }

  for (const emoji of reactions) {
    try {
      await message.react(resolveMediaReactionEmoji(message, emoji));
    } catch (error) {
      console.warn(`⚠️ [MEDYALARA EMOJİ] ${emoji} tepkisi eklenemedi:`, error.message);
    }
  }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//KANAL YÖNLENDİRME SİSTEMİ
client.on("messageCreate", async (message) => {
  if (!message.guild) return;
  if (isInternalAutomationMessage(message, client.user?.id)) return;

  const veriYolu = path.join(__dirname, "../../Database/Sunucu Yönetimi/kanalaYonlendirme.json");
 
  function veriOku() {
    if (!fs.existsSync(veriYolu)) return {};
    return JSON.parse(fs.readFileSync(veriYolu, "utf8"));
  }
 
  const veri = veriOku();
  const guildVerisi = veri[message.guild.id];
  if (!guildVerisi) return;
 
  const yönlendirmeler = guildVerisi.yönlendirmeler || [];
  const aktifYönlendirme = yönlendirmeler.find(y => y.kaynakId === message.channel.id);
  if (!aktifYönlendirme) return;
 
  const hedefKanal = message.guild.channels.cache.get(aktifYönlendirme.hedefId);
  if (!hedefKanal || !hedefKanal.isTextBased()) return;

  const yonlendirilmisMesajGonder = payload => hedefKanal.send({
    ...payload,
    nonce: createAutomationNonce("yonl"),
  });
 
  const ayarlar2 = aktifYönlendirme.embedAyar || {};
  const rolPing  = aktifYönlendirme.rolId ? `<@&${aktifYönlendirme.rolId}> ` : "";
 
const allowedMentions = {
  parse: [],
  users: [],
  roles: aktifYönlendirme.rolId ? [aktifYönlendirme.rolId] : [],
  repliedUser: false,
};

const kaynakMentionRegex = /@everyone|@here|<@!?\d+>|<@&\d+>/gi;

function emojiKullanilabilir(emoji) {
  if (!emoji?.id) return true;
  if (client.application?.emojis?.cache?.has(emoji.id)) return true;
  return client.guilds.cache.some(guild => guild.emojis.cache.has(emoji.id));
}

function cleanMedia(media) {
  if (!media || typeof media !== "object" || !media.url) return media;
  return { url: media.url };
}

function stripSourceMentions(text = "") {
  return text
    .replace(kaynakMentionRegex, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanComponents(components = []) {
  return components
    .map(c => {
      const raw = c.toJSON ? c.toJSON() : JSON.parse(JSON.stringify(c));

      delete raw.id;

      if (typeof raw.content === "string") {
        raw.content = stripSourceMentions(raw.content);
      }

      if (raw.emoji && !emojiKullanilabilir(raw.emoji)) {
        delete raw.emoji;
      }

      if (Array.isArray(raw.options)) {
        raw.options = raw.options.map(option => {
          if (option.emoji && !emojiKullanilabilir(option.emoji)) delete option.emoji;
          return option;
        });
      }

      if (raw.media) raw.media = cleanMedia(raw.media);
      if (raw.file) raw.file = cleanMedia(raw.file);
      if (Array.isArray(raw.items)) {
        raw.items = raw.items.map(item => ({
          ...item,
          ...(item.media && { media: cleanMedia(item.media) }),
        }));
      }

      if ([2, 3, 5, 6, 7, 8].includes(raw.type) && raw.style !== 5) {
        raw.disabled = true;
      }

      if (raw.components?.length) {
        raw.components = cleanComponents(raw.components);
      }

      if (raw.accessory) {
        raw.accessory = cleanComponents([raw.accessory])[0];
      }

      return raw;
    })
    .filter(c => {
      if (c.type === 10) return !!c.content;
      if ((c.type === 1 || c.type === 17) && Array.isArray(c.components)) {
        return c.components.length > 0;
      }
      return true;
    });
}

function statikComponents(components = []) {
  return components.flatMap(component => {
    if (!component || typeof component !== "object") return [];
    if ([1, 2, 3, 5, 6, 7, 8].includes(component.type)) return [];

    const raw = { ...component };
    if (Array.isArray(raw.components)) {
      raw.components = statikComponents(raw.components);
    }

    if (raw.accessory) {
      const aksesuar = statikComponents([raw.accessory])[0];
      if (aksesuar) raw.accessory = aksesuar;
      else delete raw.accessory;
    }

    if (raw.type === 9 && !raw.accessory) {
      return raw.components || [];
    }
    if (raw.type === 17 && (!raw.components || raw.components.length === 0)) return [];
    return [raw];
  });
}

  const isEmbedEmpty = (embed) => {
    const data = embed.data;
    return !data.title && !data.description && !data.fields?.length &&
           !data.footer && !data.image && !data.thumbnail && !data.url && !data.color;
  };
 
  function collectAttachments(msg) {
    return msg.attachments.map(att => ({ attachment: att.url, name: att.name }));
  }
 
  function collectGifsFromEmbeds(embeds) {
    const gifFiles = [];
    for (const embed of embeds) {
      const url = embed.url || embed.image?.url || embed.thumbnail?.url;
      if (url && url.split("?")[0].toLowerCase().endsWith(".gif")) {
        gifFiles.push({ attachment: url, name: "image.gif" });
      }
    }
    return gifFiles;
  }
 
  function stripUnknownEmojis(text, client) {
    if (!text) return text;
    return text.replace(/<a?:\w+:\d+>/g, (match) => {
      const id = match.match(/\d+/)[0];
      const isApplicationEmoji = client.application?.emojis.cache.has(id);
      const isKnownGuildEmoji = client.guilds.cache.some(guild => guild.emojis.cache.has(id));
      return isApplicationEmoji || isKnownGuildEmoji ? match : "";
    }).replace(/\s{2,}/g, " ").trim();
  }
 
  const isComponentsV2 = !!(message.flags?.bitfield & (1 << 15));
 
  try {
 
    if (isComponentsV2 && message.components?.length > 0) {
 
      function extractText(components) {
        let text = "";
        for (const comp of components) {
          const raw = comp.toJSON ? comp.toJSON() : comp;
          if (raw.type === 10 && raw.content) text += " " + raw.content;
          if (raw.components?.length) text += extractText(raw.components);
          if (raw.accessory) text += extractText([raw.accessory]);
        }
        return text;
      }
 
      const tumMetin = extractText(message.components);
 
      const rawComponents = statikComponents(cleanComponents(message.components));
 
      if (rolPing.trim() !== "") {
        const { TextDisplayBuilder } = require("discord.js");
        const pingComponent = new TextDisplayBuilder().setContent(rolPing.trim()).toJSON();
 
        if (rawComponents[0]?.type === 17) {
          rawComponents[0].components = [pingComponent, ...(rawComponents[0].components || [])];
        } else {
          rawComponents.unshift(pingComponent);
        }
      }
 
      const files = collectAttachments(message);
 
      try {
        await yonlendirilmisMesajGonder({
          components: rawComponents,
          flags: 1 << 15,
          allowedMentions,
          ...(files.length > 0 && { files }),
        });
      } catch (v2Error) {
        console.warn("🟡 [KANAL YÖNLENDİRME] Components V2 statik kopyalanamadı, metin görünümüne geçiliyor:", v2Error.message);
        const yedekMetin = stripUnknownEmojis(stripSourceMentions(tumMetin), client);
        const yedekIcerik = [rolPing.trim(), yedekMetin]
          .filter(Boolean)
          .join("\n")
          .slice(0, 2000);

        if (!yedekIcerik && files.length === 0) throw v2Error;
        await yonlendirilmisMesajGonder({
          content: yedekIcerik || undefined,
          allowedMentions,
          ...(files.length > 0 && { files }),
        });
      }
    }
 
    else if (message.embeds.length > 0) {
      const yonlendirilebilirEmbedler = message.embeds.filter(embed => !isPatchBotAdEmbed(embed));
      const attachmentFiles = collectAttachments(message);
      const gifFiles        = collectGifsFromEmbeds(yonlendirilebilirEmbedler);
      const allFiles        = [...attachmentFiles, ...gifFiles];
 
      for (const originalEmbed of yonlendirilebilirEmbedler) {
        const embedImageUrl = originalEmbed.url || originalEmbed.image?.url || originalEmbed.thumbnail?.url || "";
        const isGifEmbed    = embedImageUrl.split("?")[0].toLowerCase().endsWith(".gif");
 
        if (isGifEmbed) continue;
 
        const newEmbed = new EmbedBuilder();
 
        if (ayarlar2.title && originalEmbed.title)
          newEmbed.setTitle(originalEmbed.title);
        if (ayarlar2.description && originalEmbed.description)
          newEmbed.setDescription(originalEmbed.description);
        if (ayarlar2.url && originalEmbed.url)
          newEmbed.setURL(originalEmbed.url);
        if (ayarlar2.thumbnail && originalEmbed.thumbnail?.url)
          newEmbed.setThumbnail(originalEmbed.thumbnail.url);
        if (ayarlar2.image && originalEmbed.image?.url)
          newEmbed.setImage(originalEmbed.image.url);
        if (ayarlar2.fields && originalEmbed.fields?.length > 0)
          newEmbed.setFields(originalEmbed.fields.map(f => ({
            name: f.name, value: f.value, inline: f.inline ?? false,
          })));
        if (ayarlar2.footer && originalEmbed.footer?.text)
          newEmbed.setFooter({ text: originalEmbed.footer.text, iconURL: originalEmbed.footer.iconURL || null });
        if (ayarlar2.color && typeof originalEmbed.color === "number")
          newEmbed.setColor(originalEmbed.color);
 
        if (isEmbedEmpty(newEmbed)) continue;
 
        await yonlendirilmisMesajGonder({
          content: rolPing || undefined,
          embeds: [newEmbed],
          allowedMentions,
        });
      }
 
if (allFiles.length > 0) {
  await yonlendirilmisMesajGonder({
    files: allFiles,
    allowedMentions,
  });
      }
    }
 
    else if (message.components?.length > 0) {
      let textContent = "";
      const files = collectAttachments(message);
 
      for (const row of message.components) {
        for (const comp of row.components ?? []) {
          const compData = comp.toJSON ? comp.toJSON() : {};
          const label = compData.label || compData.text || compData.content || "";
          if (typeof label === "string" && label.trim() !== "")
            textContent += `\n${label}`;
        }
      }
 
      if (textContent.trim() !== "") {
        const resolved = stripUnknownEmojis(rolPing + textContent.trim(), client);
        await yonlendirilmisMesajGonder({
          content: resolved,
          allowedMentions,
          ...(files.length > 0 && { files }),
        });
      } else if (files.length > 0) {
        await yonlendirilmisMesajGonder({
          content: rolPing || undefined,
          files,
          allowedMentions,
        });
      }
    }
 
    else {
      const files    = collectAttachments(message);
      const hasText  = message.content && message.content.trim() !== "";
      const hasFiles = files.length > 0;
 
      if (!hasText && !hasFiles) return;
 
      const resolvedContent = hasText
        ? stripUnknownEmojis(rolPing + stripSourceMentions(message.content), client)
        : (rolPing || undefined);
 
      await yonlendirilmisMesajGonder({
        content: resolvedContent,
        ...(hasFiles && { files }),
        allowedMentions,
      });
    }
 
  } catch (err) {
    console.error("🔴 [KANAL YÖNLENDİRME - EVENT] Yönlendirme Hatası:", err);
  }
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//OTOMATİK SELAM SİSTEMİ
const selamRegex = /^(s+a+|sea+|se+l+a+m+|s+e*l+a+m*(u+n|ü+n)?(\s*a+l+e+y+(k(u|ü)m+))?|sl+m+|selam(l+a+r+)?|selamünaleyk(ü|u)m+|selamunaleyk(ü|u)m+)$/i;

const merhabaRegex = /^(m+e*r*h*a*b+a+|m+e*r+a*b+a+|m+r+h*b+|m+r+b+|merhab(a+|e+)?(lar+)?|mrh+blar+)$/i;

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!message.content) return;

  const content = message.content
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-zçğıöşü\s]/gi, "")
    .trim();

  try {
    if (selamRegex.test(content)) {
      await message.reply({
        content: `Selam, **hoş geldin!** ${message.author}`,
        allowedMentions: { users: [message.author.id], repliedUser: false },
      });
    } else if (merhabaRegex.test(content)) {
      await message.reply({
        content: `Merhaba, **hoş geldin!** ${message.author}`,
        allowedMentions: { users: [message.author.id], repliedUser: false },
      });
    }
  } catch (err) {
    console.error("🔴 [OTOMATİK CEVAP] Selam sistemi hatası:", err);
  }
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//İTİRAF SİSTEMİ
const webhookCache = new Map();

async function getOrCreateWebhook(channel) {
  if (webhookCache.has(channel.id)) return webhookCache.get(channel.id);

  const webhooks = await channel.fetchWebhooks();
  let webhook = webhooks.find(w => w.name === 'itiraf_webhook');

  if (!webhook) {
    webhook = await channel.createWebhook({
      name: 'itiraf_webhook',
      avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
    });
  }

  webhookCache.set(channel.id, webhook);
  return webhook;
}

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const guildAyar = getGuildItirafSetting(message.guild.id);
  if (!guildAyar || !guildAyar.aktif) return;

  const { itirafKanal, logKanal, minimumKarakter, tepkiler } = guildAyar;
  if (message.channel.id !== itirafKanal) return;

  const karakterSayisi = message.content.replace(/\s/g, '').length;
  if (karakterSayisi < minimumKarakter) {
    try {
      await message.delete();
    } catch (err) {
      console.error('🔴 [İTİRAF - EVENT] Kısa itiraf mesajı silinemedi:', err);
    }

    const uyari = await message.channel.send({
      content: `${emojiler.uyari} <@${message.author.id}> **İtirafın çok kısa.** (En az ${minimumKarakter} karakter olmalı)`,
    });

    setTimeout(() => uyari.delete().catch(() => {}), 5000);
    return;
  }

  try {
    const globalName = message.member.globalName || message.member.displayName;
    const harfliIsim = globalName.charAt(0).toUpperCase() + '****';
    const defaultAvatar = 'https://cdn.discordapp.com/embed/avatars/0.png';

    const webhook = await getOrCreateWebhook(message.channel);

    await message.delete().catch((err) =>
      console.error('🔴 [İTİRAF - EVENT] Mesaj silinemedi:', err)
    );

    const webhookMessage = await webhook.send({
      content: message.content,
      username: harfliIsim,
      avatarURL: defaultAvatar,
    });

    if (tepkiler) {
      const emojilers = [
        '👍🏻',
        emojiler.getEmojiString('redheart', '❤️'),
        emojiler.getEmojiString('laugh', '😂'),
        emojiler.getEmojiString('think', '🤔'),
        emojiler.getEmojiString('anxious', '😰'),
        emojiler.getEmojiString('sob', '😭'),
        emojiler.getEmojiString('swear', '🤬'),
      ];
      for (const emoji of emojilers) {
        await webhookMessage.react(emoji).catch(err => {
          console.error(`🔴 [İTİRAF - TEPKİ] ${emoji} eklenemedi:`, err.message);
        });
      }
    }

    if (logKanal && logKanal !== itirafKanal) {
      const logChannel = message.guild.channels.cache.get(logKanal);
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle(`${message.author.globalName} (${message.author.username})\n${message.author.id}`)
          .setDescription(`# ${emojiler.speechbubble} İtiraf İçeriği \n${message.content}\n\n# ${emojiler.pin} Mesaj \n[**__[Mesaja Git]__**](${webhookMessage.url}) ${emojiler.sadesagok} ${webhookMessage.url} \nMesaj ID ${emojiler.sadesagok} ${webhookMessage.id}`)
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .setColor(0x2F3136);

        await logChannel.send({ embeds: [embed] });
      }
    }
  } catch (err) {
    console.error('🔴 [İTİRAF - EVENT] İtiraf sistemi hatası:', err);
  }
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///OYUN SİSTEMİ
//SAYI SAYMACA
const dbPath = path.join(__dirname, '../../Database/Eğlence ve Etkileşim/oyunKanallari.json');
const sayiPath = path.join(__dirname, '../../Database/Eğlence ve Etkileşim/sayiSaymaca.json');

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  if (!fs.existsSync(dbPath)) return;
  const kanalVerisi = JSON.parse(fs.readFileSync(dbPath, 'utf-8'))[message.guildId];
  if (!kanalVerisi || !kanalVerisi.sayi) return;
  if (message.channelId !== kanalVerisi.sayi) return;

  const webhooks = await message.channel.fetchWebhooks();
  let webhook = webhooks.find(w => w.name === 'Sayı Saymaca Webhook');
  if (!webhook) {
    webhook = await message.channel.createWebhook({
      name: 'Sayı Saymaca Webhook',
      avatar: client.user.displayAvatarURL(),
    }).catch(console.error);
  }

  await message.delete().catch(() => {});

  let oyunVerisi = {};
  if (fs.existsSync(sayiPath)) {
    oyunVerisi = JSON.parse(fs.readFileSync(sayiPath, 'utf-8'));
  }

  const onceki = oyunVerisi[message.guildId]?.sayi || 0;
  const yazilanSayi = Number(message.content);

  if (!Number.isInteger(yazilanSayi) || yazilanSayi !== onceki + 1) {
    const hata = await message.channel.send(
      `${emojiler.uyari} ${message.member || message.author} **Sırayı bozma. Doğru sayı:** \`${onceki + 1}\``
    );
    setTimeout(() => hata.delete().catch(() => {}), 5000);
    return;
  }

  try {
    const gönderilen = await webhook.send({
      content: `${yazilanSayi}`,
      username: message.member?.displayName || message.author.globalName || message.author.username,
      avatarURL: message.author.displayAvatarURL(),
      allowedMentions: { parse: [] }
    });

    if (gönderilen && gönderilen.react) {
      await gönderilen.react(emojiler.getReactionEmoji('tik', '✅'));
    }

    oyunVerisi[message.guildId] = { sayi: yazilanSayi };
    fs.writeFileSync(sayiPath, JSON.stringify(oyunVerisi, null, 2));
  } catch (err) {
    console.error('🔴 [SAYI SAYMACA - EVENT] Webhook hatası:', err);
  }
});

//BOM
const bomPath = path.join(__dirname, '../../Database/Eğlence ve Etkileşim/bom.json');

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (!fs.existsSync(dbPath)) return;
  const kanalVerisi = JSON.parse(fs.readFileSync(dbPath, 'utf-8'))[message.guildId];
  if (!kanalVerisi || !kanalVerisi.bom) return;
  if (message.channelId !== kanalVerisi.bom) return;

  const webhooks = await message.channel.fetchWebhooks();
  let webhook = webhooks.find(w => w.name === 'Bom Webhook');

  if (!webhook) {
    webhook = await message.channel.createWebhook({
      name: 'Bom Webhook',
      avatar: client.user.displayAvatarURL(),
    });
  }

  await message.delete().catch(() => {});

  let oyunVerisi = {};
  if (fs.existsSync(bomPath)) {
    oyunVerisi = JSON.parse(fs.readFileSync(bomPath, 'utf-8'));
  }

  const onceki = oyunVerisi[message.guildId]?.sayi || 0;
  const sonraki = onceki + 1;
  const icerik = message.content.toLowerCase();

  const dogruIcerik = sonraki % 5 === 0 ? 'bom' : String(sonraki);

  if (
    (sonraki % 5 === 0 && icerik !== 'bom') ||
    (sonraki % 5 !== 0 && icerik === 'bom') ||
    (sonraki % 5 !== 0 && icerik !== String(sonraki))
  ) {
    const msg = await message.channel.send(`${emojiler.uyari} ${message.member} **Sıra hatalı veya yanlış kullanım. Beklenen:** \`${dogruIcerik}\``);
    setTimeout(() => msg.delete().catch(() => {}), 5000);
    return;
  }

  await webhook.send({
    content: icerik,
    username: message.member.displayName,
    avatarURL: message.author.displayAvatarURL(),
    allowedMentions: { parse: [] }
  });

  if (icerik === 'bom') {
    const fetched = await message.channel.messages.fetch({ limit: 10 });
    const webhookMsg = fetched.find(m => m.author.id === webhook.id && m.content === 'bom');
    if (webhookMsg) {
      webhookMsg.react(emojiler.getReactionEmoji('bomb', '💣')).catch(() => {});
    }
  }

  oyunVerisi[message.guildId] = { sayi: sonraki };
  fs.writeFileSync(bomPath, JSON.stringify(oyunVerisi, null, 2));
});

//KELİME OYUNU
const kelimePath = path.join(__dirname, '../../Database/Eğlence ve Etkileşim/kelime.json');
const txtPath = path.join(__dirname, '../../Database/Eğlence ve Etkileşim/kelimeler.txt');
const kelimeStore = createJsonStore(kelimePath);
const kelimeSirasi = new Map();

const tdkListesi = fs.readFileSync(txtPath, 'utf-8')
  .split('\n')
  .map(k => k.trim().toLowerCase())
  .filter(Boolean); 

cron.schedule('0 0 * * *', () => {
  try {
    if (fs.existsSync(kelimePath)) {
      kelimeStore.update(resetUsedWords);
      console.log('🌐 [KELİME OYUNU] Kullanılan kelimeler yenilendi, oyun oturumları korundu.');
    }
  } catch (err) {
    console.error('🔴 [KELİME OYUNU - EVENT] Sıfırlama hatası:', err);
  }
}, {
  timezone: 'Europe/Istanbul'
});


client.on('messageCreate', async (message) => {
  if (isBotOrWebhookMessage(message) || !message.guild) return;

  const dbPath = path.join(__dirname, '../../Database/Eğlence ve Etkileşim/oyunKanallari.json');
  if (!fs.existsSync(dbPath)) return;
  const kanalVerisi = JSON.parse(fs.readFileSync(dbPath, 'utf-8'))[message.guildId];
  if (!kanalVerisi || !kanalVerisi.kelime) return;
  if (message.channelId !== kanalVerisi.kelime) return;

  const pending = (kelimeSirasi.get(message.guildId) || Promise.resolve())
    .then(() => handleKelimeMessage(message))
    .catch(error => console.error('🔴 [KELİME OYUNU - MESAJ]', error));
  kelimeSirasi.set(message.guildId, pending);
  try {
    await pending;
  } finally {
    if (kelimeSirasi.get(message.guildId) === pending) kelimeSirasi.delete(message.guildId);
  }
});

async function handleKelimeMessage(message) {
  const kelime = message.content
    .toLocaleLowerCase('tr-TR')
    .normalize('NFC')
    .replace(/[^a-zçğıöşüâîû]/giu, '');

  const webhooks = await message.channel.fetchWebhooks();
  let webhook = webhooks.find(w => w.name === 'Kelime Webhook');

  if (!webhook) {
    webhook = await message.channel.createWebhook({
      name: 'Kelime Webhook',
      avatar: client.user.displayAvatarURL(),
    });
  }

  let oyun = kelimeStore.get(message.guildId);

  if (!oyun?.sonKelime) {
    oyun = await recoverSessionFromChannel(message.channel, {
      webhookId: webhook.id,
      botId: client.user.id,
      before: message.id,
    });

    if (oyun) {
      kelimeStore.set(message.guildId, oyun);
    } else {
      const baslangic = tdkListesi[Math.floor(Math.random() * tdkListesi.length)];
      await message.channel.send(buildGameSetupPayload("kelime", { initialWord: baslangic }));
      kelimeStore.set(message.guildId, {
        sonKelime: baslangic,
        kullanilanlar: [baslangic],
      });
      await message.delete().catch(() => {});
      return;
    }
  }

  await message.delete().catch(() => {});

  const { sonKelime, kullanilanlar = [] } = oyun;
  const beklenenHarf = sonKelime.slice(-1);

  if (!kelime.startsWith(beklenenHarf)) {
    const msg = await message.channel.send(`${emojiler.uyari} ${message.member} **kelimen** \`${beklenenHarf}\` **harfiyle başlamalı.**`);
    return setTimeout(() => msg.delete().catch(() => {}), 5000);
  }

  if (kullanilanlar.includes(kelime)) {
    const msg = await message.channel.send(`${emojiler.uyari} ${message.member} \`${kelime}\` **daha önce kullanılmış.**`);
    return setTimeout(() => msg.delete().catch(() => {}), 5000);
  }

  const tdkKontrolu = await checkTdkWord(kelime);
  const kelimeGecerli = tdkKontrolu.available
    ? tdkKontrolu.valid
    : tdkListesi.includes(kelime);

  if (!kelimeGecerli) {
    const aciklama = tdkKontrolu.available
      ? "Güncel Türkçe Sözlük'te bulunmuyor"
      : "TDK'ye şu anda ulaşılamadı ve yerel sözlükte bulunmuyor";
    const msg = await message.channel.send(`${emojiler.uyari} ${message.member} \`${kelime}\` **${aciklama}.**`);
    return setTimeout(() => msg.delete().catch(() => {}), 5000);
  }

  const gönderilen = await webhook.send({
    content: `${kelime}`,
    username: message.member?.displayName || message.author.globalName || message.author.username,
    avatarURL: message.author.displayAvatarURL(),
    allowedMentions: { parse: [] }
  });

  kelimeStore.update(data => {
    const session = data[message.guildId] || oyun;
    session.sonKelime = kelime;
    session.kullanilanlar = [...new Set([...(session.kullanilanlar || []), kelime])];
    data[message.guildId] = session;
  });

  if (gönderilen && gönderilen.react) {
    await gönderilen.react(`${emojiler.tik}`).catch(() => {});
  }
}

//TUTTU-TUTMADI
const dbPath123 = path.join(__dirname, '../../Database/Eğlence ve Etkileşim/oyunKanallari.json');
const lastPlayers = new Map();

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  if (!fs.existsSync(dbPath123)) return;
  const db = JSON.parse(fs.readFileSync(dbPath123, 'utf-8'));
  const guildData = db[message.guild.id];
  if (!guildData || message.channel.id !== guildData.tuttu) return;

  const content = message.content.trim().toLocaleLowerCase('tr-TR');
  const sentenceMatch = content.match(/^(tuttu|tutmadı)(?:\s+|\s*[:;,.!?—-]\s*)(.+)$/iu);
  const explanationWords = sentenceMatch?.[2].match(/[\p{L}\p{N}]+/gu) || [];

  if (!sentenceMatch || explanationWords.length < 2) {
    const msg = await message.reply(
      `${emojiler.uyari} **Yalnızca "Tuttu" veya "Tutmadı" yazamazsın. Seçiminle başlayıp en az iki kelimelik bir açıklama eklemelisin.**`
    );
    setTimeout(() => msg.delete().catch(() => {}), 5000);
    return message.delete().catch(() => {});
  }

  const lastPlayer = lastPlayers.get(message.guild.id);
  if (lastPlayer === message.author.id) {
    const msg = await message.reply(`${emojiler.uyari} **Sıranı bekle.**`);
    setTimeout(() => msg.delete().catch(() => {}), 5000);
    return message.delete().catch(() => {});
  }

  lastPlayers.set(message.guild.id, message.author.id);

  const webhooks = await message.channel.fetchWebhooks();
  let webhook = webhooks.find(w => w.name === 'TuttuBot');
  if (!webhook) {
    webhook = await message.channel.createWebhook({
      name: 'TuttuBot',
      avatar: client.user.displayAvatarURL(),
    });
  }
  const gönderilen = await webhook.send({
    content: `${content}`,
    username: message.member?.displayName || message.author.globalName || message.author.username,
    avatarURL: message.author.displayAvatarURL(),
    allowedMentions: { parse: [] }
  });

    if (gönderilen && gönderilen.react) {
      await gönderilen.react('👇🏻');
    }

  await message.delete().catch(() => {});
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
