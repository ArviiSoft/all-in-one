const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const fs = require("../../Utils/Core/databaseFs");
const path = require("path");
const store = require("../../Utils/Membership/aboneStore");
const { listYoutubeComments, parseSubmission } = require("../../Utils/Membership/youtubeCommentTracker");
const { fetchLatestVideoForChannels } = require("../../Utils/Membership/ytalertconf");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const pendingPath = path.join(__dirname, "../../Database/Abonelik/abonePending.json");
const statsPath = path.join(__dirname, "../../Database/Abonelik/aboneStats.json");
const processingMessages = new Set();
const processingSelections = new Set();

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf8") || "{}");
  } catch (error) {
    console.error(`🔴 [ABONE] ${path.basename(filePath)} okunamadı:`, error);
    return {};
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function readStats() {
  return readJson(statsPath);
}

function saveStats(data) {
  writeJson(statsPath, data);
}

function readPending() {
  return readJson(pendingPath);
}

function savePending(data) {
  writeJson(pendingPath, data);
}

function findTrackingConflict(guildId, userId, record) {
  const guildRecords = store.readTracking()[guildId] || {};
  return Object.values(guildRecords).find(item => (
    item.userId !== userId
    && item.status === "active"
    && (
      item.commentId === record.commentId
      || (item.youtubeChannelId && item.youtubeChannelId === record.youtubeChannelId)
    )
  ));
}

async function sendTemporary(channel, payload, timeout = 12_000) {
  const message = await channel.send(payload).catch(() => null);
  if (message) setTimeout(() => message.delete().catch(() => null), timeout);
  return message;
}

function truncateComponentText(value, maxLength = 100) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "Bilinmeyen";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function buildCommentSelectionView({ sourceMessageId, staffId, video, comments }) {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`abone-yorum-sec:${sourceMessageId}`)
    .setPlaceholder("Ekran görüntüsündeki yorumu seç")
    .addOptions(comments.map(comment => ({
      label: truncateComponentText(comment.youtubeChannelName),
      description: truncateComponentText(comment.commentText || "Metinsiz yorum"),
      value: comment.commentId,
    })));
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  const refreshRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`abone-yorum-yenile:${sourceMessageId}`)
      .setLabel("Yorumları Yenile")
      .setEmoji(`${emojiler.yukleniyor}`)
      .setStyle(ButtonStyle.Primary)
  );
  const selectEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${emojiler.speechbubble_arviis} YouTube Yorumunu Seç`)
    .setDescription([
      `<@${staffId}> ekran görüntüsündeki yorumu aşağıdaki listeden seç. \n`,
      `📽️ **Video:** [${truncateComponentText(video.title, 200)}](${video.link})`,
      `-# En yeni ${comments.length} yorum gösteriliyor.`,
    ].join("\n"));

  return {
    embeds: [selectEmbed],
    components: [selectRow, refreshRow],
  };
}

module.exports = client => {
  client.on(Events.MessageCreate, async message => {
    if (!message.guild || message.author.bot || !message.attachments.size) return;

    const setting = store.getGuildSetting(message.guild.id);
    if (!setting.kanal || message.channel.id !== setting.kanal) return;

    const attachment = message.attachments.first();
    if (!attachment.contentType?.startsWith("image/")) return;

    const parsed = parseSubmission(message.content);
    const tikEmoji = emojiler.getReactionEmoji("tik", "✅");
    const carpiEmoji = emojiler.getReactionEmoji("carpi", "❌");
    await message.react(tikEmoji).catch(() => message.react("✅"));
    await message.react(carpiEmoji).catch(() => message.react("❌"));

    const pending = readPending();
    pending[message.id] = {
      guildId: message.guild.id,
      channelId: message.channel.id,
      messageId: message.id,
      authorId: message.author.id,
      youtubeChannelUrl: parsed.channelUrl,
      commentText: parsed.commentText,
      videoId: parsed.videoId || setting.youtube.sonVideoId,
      videoUrl: parsed.videoId
        ? `https://www.youtube.com/watch?v=${parsed.videoId}`
        : setting.youtube.sonVideoUrl,
      submittedAt: new Date().toISOString(),
    };
    savePending(pending);

    const modRole = setting.yetkili ? message.guild.roles.cache.get(setting.yetkili) : null;
    const activeMods = modRole
      ? modRole.members.filter(member => ["online", "idle", "dnd"].includes(member.presence?.status))
      : null;
    const mentions = activeMods?.size
      ? activeMods.map(member => `<@${member.id}>`).join(" ")
      : `Şu anda hiçbir yetkili çevrimiçi değil. ${emojiler.offline}`;

    const embed = new EmbedBuilder()
      .setColor(0xa9ff47)
      .setTitle(`${emojiler.tik} Ekran Görüntüsü Alındı`)
      .setDescription([
        "- Lütfen aktif yetkilinin ilgilenmesini __sabırla__ bekle.",
        "- Bu süre zarfında yetkilileri __tekrar etiketleme.__",
      ].join("\n"));

    const reply = await message.reply({
      content: `${emojiler.online} **Aktif Yetkililer:** ${mentions}`,
      embeds: [embed],
      allowedMentions: { users: activeMods?.map(member => member.id) || [] },
    });
    setTimeout(() => reply.delete().catch(() => null), 120_000);
  });

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;

    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();
    } catch {
      return;
    }

    const guild = reaction.message.guild;
    if (!guild) return;
    const setting = store.getGuildSetting(guild.id);
    if (!setting.kanal || reaction.message.channel.id !== setting.kanal) return;

    const pending = readPending();
    const record = pending[reaction.message.id];
    if (!record) return;

    const tikId = emojiler.getEmojiId("tik");
    const carpiId = emojiler.getEmojiId("carpi");
    const isTik = (tikId && reaction.emoji.id === tikId) || reaction.emoji.name === "✅";
    const isCarpi = (carpiId && reaction.emoji.id === carpiId) || reaction.emoji.name === "❌";
    if (!isTik && !isCarpi) return;

    const staff = await guild.members.fetch(user.id).catch(() => null);
    if (!staff?.roles.cache.has(setting.yetkili)) {
      await reaction.users.remove(user.id).catch(() => null);
      try {
        await user.send(`${emojiler.uyari} **Abone rolü için emojileri kullanma yetkin yok. :)**`);
      } catch {
        await sendTemporary(
          reaction.message.channel,
          { content: `${emojiler.uyari} **Abone rolü için emojileri kullanma yetkin yok. :)** <@${user.id}>` },
          3_000
        );
      }
      return;
    }

    const processingKey = `${guild.id}:${reaction.message.id}`;
    if (processingMessages.has(processingKey)) {
      await reaction.users.remove(user.id).catch(() => null);
      return;
    }
    processingMessages.add(processingKey);

    try {
    const targetMember = await guild.members.fetch(record.authorId).catch(() => null);
    if (!targetMember) {
      delete pending[reaction.message.id];
      savePending(pending);
      return sendTemporary(reaction.message.channel, {
        content: `${emojiler.uyari} Başvuru sahibi artık sunucuda bulunmuyor.`,
      });
    }

    if (isTik) {
      if (!setting.rol) {
        return sendTemporary(reaction.message.channel, {
          content: `${emojiler.uyari} **Abone rolü ayarlanmamış. /abone-sistemi-ayarla panelini kontrol et.**`,
        });
      }

      if (record.commentSelection?.status === "awaiting") {
        await reaction.users.remove(user.id).catch(() => null);
        return sendTemporary(reaction.message.channel, {
          content: `${emojiler.uyari} **Bu başvuru için yorum seçim menüsü zaten açılmış.**`,
        });
      }

      const liveLatestVideo = setting.youtube.kaynakKanallar.length
        ? await fetchLatestVideoForChannels(setting.youtube.kaynakKanallar)
        : null;
      const latestVideo = liveLatestVideo || (setting.youtube.sonVideoId ? {
        videoId: setting.youtube.sonVideoId,
        link: setting.youtube.sonVideoUrl
          || `https://www.youtube.com/watch?v=${setting.youtube.sonVideoId}`,
        title: setting.youtube.sonVideoBaslik || "Son video",
        author: setting.youtube.sonVideoKanal || "YouTube",
        published: setting.youtube.sonVideoPublished || null,
      } : null);

      if (!latestVideo?.videoId) {
        await reaction.users.remove(user.id).catch(() => null);
        return reaction.message.reply({
          content: `${emojiler.uyari} <@${user.id}> **Takip edilen kanallardan son video alınamadı. Paneldeki YouTube kaynak kanallarını kontrol et.**`,
          allowedMentions: { users: [user.id] },
        });
      }

      const commentResult = await listYoutubeComments(latestVideo.videoId, {
        maxPages: 3,
        limit: 25,
      });
      if (commentResult.status !== "ok" || !commentResult.comments.length) {
        await reaction.users.remove(user.id).catch(() => null);
        const detail = commentResult.status === "unavailable"
          ? "Bu videonun yorumları kapalı veya kullanılamıyor."
          : "Son videoda seçilebilecek yeni bir yorum bulunamadı.";
        return reaction.message.reply({
          content: `${emojiler.uyari} <@${user.id}> **${detail}**`,
          allowedMentions: { users: [user.id] },
        });
      }

      if (liveLatestVideo) {
        store.updateGuildSetting(guild.id, draft => {
          draft.youtube.sonVideoId = liveLatestVideo.videoId;
          draft.youtube.sonVideoUrl = liveLatestVideo.link;
          draft.youtube.sonVideoBaslik = liveLatestVideo.title;
          draft.youtube.sonVideoKanal = liveLatestVideo.author;
          draft.youtube.sonVideoPublished = liveLatestVideo.published;
        });
      }

      const latestPending = readPending();
      if (!latestPending[reaction.message.id]) return;
      latestPending[reaction.message.id].commentSelection = {
        status: "awaiting",
        staffId: user.id,
        video: latestVideo,
        comments: commentResult.comments,
        createdAt: new Date().toISOString(),
      };
      savePending(latestPending);

      const selectionView = buildCommentSelectionView({
        sourceMessageId: reaction.message.id,
        staffId: user.id,
        video: latestVideo,
        comments: commentResult.comments,
      });

      try {
        await reaction.message.reply({
          content: `<@${user.id}>`,
          ...selectionView,
          allowedMentions: { users: [user.id] },
        });
      } catch (error) {
        const rollbackPending = readPending();
        if (
          rollbackPending[reaction.message.id]?.commentSelection?.createdAt
          === latestPending[reaction.message.id].commentSelection.createdAt
        ) {
          delete rollbackPending[reaction.message.id].commentSelection;
          savePending(rollbackPending);
        }
        throw error;
      }
      return;
    } else {
      const messageLink = reaction.message.url;
      const embed = new EmbedBuilder()
        .setTitle(`${emojiler.carpi} Hatalı Ekran Görüntüsü`)
        .setDescription(`${emojiler.info} [**Mesaja Git**](${messageLink})`)
        .setColor("Red");

      const row = new ActionRowBuilder().addComponents(
        ["Kırpılmış", "Saat/Tarih Yok", "Bildirimler Açık Değil", "Yorum Yok", "Beğeni Yok"].map(reason =>
          new ButtonBuilder()
            .setCustomId(`red-${reason}`)
            .setLabel(reason)
            .setStyle(ButtonStyle.Danger)
        )
      );
      const lastVideoRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("red-Son Video Değil")
          .setLabel("Son Video Değil")
          .setStyle(ButtonStyle.Danger)
      );
      await reaction.message.reply({ embeds: [embed], components: [row, lastVideoRow] });
    }

    delete pending[reaction.message.id];
    savePending(pending);
    } catch (error) {
      console.error("🔴 [ABONE] Başvuru tepkisi işlenemedi:", error);
      await reaction.users.remove(user.id).catch(() => null);
      await sendTemporary(reaction.message.channel, {
        content: `${emojiler.uyari} **Başvuru işlenirken hata oluştu, bot izinlerini ve panel ayarlarını kontrol et.**`,
      });
    } finally {
      processingMessages.delete(processingKey);
    }
  });

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton() || !interaction.customId.startsWith("abone-yorum-yenile:")) return;
    if (!interaction.guild) return;

    const sourceMessageId = interaction.customId.slice("abone-yorum-yenile:".length);
    const selectionKey = `${interaction.guild.id}:${sourceMessageId}`;
    const setting = store.getGuildSetting(interaction.guild.id);
    const staff = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

    if (!staff?.roles.cache.has(setting.yetkili)) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu işlemi yapma yetkin yok.**`,
        flags: 64,
      });
    }

    const pending = readPending();
    const application = pending[sourceMessageId];
    const selection = application?.commentSelection;
    if (!application || selection?.status !== "awaiting") {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu yorum seçim menüsünün süresi dolmuş veya başvuru daha önce işlenmiş.**`,
        flags: 64,
      });
    }

    if (processingSelections.has(selectionKey)) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu başvuru şu anda başka bir işlem yapıyor.**`,
        flags: 64,
      });
    }

    processingSelections.add(selectionKey);
    try {
      await interaction.deferUpdate();

      const liveLatestVideo = !selection.video && setting.youtube.kaynakKanallar.length
        ? await fetchLatestVideoForChannels(setting.youtube.kaynakKanallar)
        : null;
      const latestVideo = selection.video || liveLatestVideo || (setting.youtube.sonVideoId ? {
        videoId: setting.youtube.sonVideoId,
        link: setting.youtube.sonVideoUrl
          || `https://www.youtube.com/watch?v=${setting.youtube.sonVideoId}`,
        title: setting.youtube.sonVideoBaslik || "Son video",
        author: setting.youtube.sonVideoKanal || "YouTube",
        published: setting.youtube.sonVideoPublished || null,
      } : null);
      if (!latestVideo?.videoId) throw new Error("Son video alınamadı.");

      const commentResult = await listYoutubeComments(latestVideo.videoId, {
        maxPages: 3,
        limit: 25,
      });
      if (commentResult.status !== "ok") {
        throw new Error(commentResult.status === "unavailable"
          ? "Bu videonun yorumları kapalı veya kullanılamıyor."
          : "YouTube yorumlarına şu anda ulaşılamıyor.");
      }
      if (!commentResult.comments.length) {
        throw new Error("Son videoda henüz görüntülenebilen bir yorum yok.");
      }

      if (liveLatestVideo) {
        store.updateGuildSetting(interaction.guild.id, draft => {
          draft.youtube.sonVideoId = liveLatestVideo.videoId;
          draft.youtube.sonVideoUrl = liveLatestVideo.link;
          draft.youtube.sonVideoBaslik = liveLatestVideo.title;
          draft.youtube.sonVideoKanal = liveLatestVideo.author;
          draft.youtube.sonVideoPublished = liveLatestVideo.published;
        });
      }

      const latestPending = readPending();
      const currentSelection = latestPending[sourceMessageId]?.commentSelection;
      if (currentSelection?.status !== "awaiting") {
        throw new Error("Başvuru bu sırada işlenmiş veya seçim menüsünün süresi dolmuş.");
      }

      const refreshedAt = new Date().toISOString();
      latestPending[sourceMessageId].commentSelection = {
        ...currentSelection,
        video: latestVideo,
        comments: commentResult.comments,
        refreshedAt,
      };
      savePending(latestPending);

      const selectionView = buildCommentSelectionView({
        sourceMessageId,
        staffId: currentSelection.staffId || interaction.user.id,
        video: latestVideo,
        comments: commentResult.comments,
      });

      try {
        await interaction.editReply({
          content: `<@${currentSelection.staffId || interaction.user.id}>`,
          ...selectionView,
          allowedMentions: { users: [currentSelection.staffId || interaction.user.id] },
        });
      } catch (error) {
        const rollbackPending = readPending();
        if (rollbackPending[sourceMessageId]?.commentSelection?.refreshedAt === refreshedAt) {
          rollbackPending[sourceMessageId].commentSelection = currentSelection;
          savePending(rollbackPending);
        }
        throw error;
      }

      await interaction.followUp({
        content: `${emojiler.tik} Yorum listesi yenilendi, en yeni **${commentResult.comments.length} yorum** gösteriliyor.`,
        flags: 64,
      });
    } catch (error) {
      console.error("🔴 [ABONE] Yorum listesi yenilenemedi:", error);
      const errorPayload = {
        content: `${emojiler.uyari} **Yorumlar yenilenemedi:** ${error.message || "Bilinmeyen hata"}`,
        flags: 64,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(errorPayload).catch(() => null);
      } else {
        await interaction.reply(errorPayload).catch(() => null);
      }
    } finally {
      processingSelections.delete(selectionKey);
    }
  });

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith("abone-yorum-sec:")) return;
    if (!interaction.guild) return;

    const sourceMessageId = interaction.customId.slice("abone-yorum-sec:".length);
    const selectionKey = `${interaction.guild.id}:${sourceMessageId}`;
    const setting = store.getGuildSetting(interaction.guild.id);
    const staff = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

    if (!staff?.roles.cache.has(setting.yetkili)) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu işlemi yapma yetkin yok.**`,
        flags: 64,
      });
    }

    const pending = readPending();
    const application = pending[sourceMessageId];
    const selection = application?.commentSelection;
    if (!application || selection?.status !== "awaiting") {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu yorum seçim menüsünün süresi dolmuş veya başvuru daha önce işlenmiş.**`,
        flags: 64,
      });
    }

    if (processingSelections.has(selectionKey)) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu başvuru başka bir yetkili tarafından işleniyor.**`,
        flags: 64,
      });
    }

    const selectedComment = selection.comments.find(comment => comment.commentId === interaction.values[0]);
    if (!selectedComment) {
      return interaction.reply({
        content: `${emojiler.uyari} **Seçilen yorum kaydı bulunamadı. Menüyü yeniden açmak için ✅ tepkisini kaldırıp tekrar ekle.**`,
        flags: 64,
      });
    }

    processingSelections.add(selectionKey);
    let roleAdded = false;
    let trackingSaved = false;
    try {
      await interaction.deferUpdate();
      if (!setting.rol) throw new Error("Abone rolü ayarlanmamış.");
      const targetMember = await interaction.guild.members.fetch(application.authorId).catch(() => null);
      if (!targetMember) throw new Error("Başvuru sahibi artık sunucuda bulunmuyor.");

      const video = selection.video;
      const now = new Date().toISOString();
      const trackingRecord = {
        guildId: interaction.guild.id,
        userId: targetMember.id,
        roleId: setting.rol,
        status: "active",
        approvedBy: interaction.user.id,
        approvedAt: now,
        lastCheckedAt: now,
        sourceMessage: `https://discord.com/channels/${interaction.guild.id}/${application.channelId}/${sourceMessageId}`,
        videoId: video.videoId,
        videoUrl: video.link || `https://www.youtube.com/watch?v=${video.videoId}`,
        commentId: selectedComment.commentId,
        commentText: selectedComment.commentText,
        youtubeChannelId: selectedComment.youtubeChannelId,
        youtubeChannelName: selectedComment.youtubeChannelName,
        youtubeChannelUrl: selectedComment.youtubeChannelUrl,
      };

      const conflict = findTrackingConflict(interaction.guild.id, targetMember.id, trackingRecord);
      if (conflict) {
        await interaction.followUp({
          content: `${emojiler.uyari} **Bu YouTube kanalı veya yorum başka bir Discord hesabıyla zaten eşleştirilmiş.**`,
          flags: 64,
        });
        return;
      }

      const alreadyHadRole = targetMember.roles.cache.has(setting.rol);
      await targetMember.roles.add(
        setting.rol,
        `YouTube yorumu ${interaction.user.tag} tarafından seçilerek doğrulandı.`
      );
      roleAdded = !alreadyHadRole;
      store.saveTrackingRecord(trackingRecord);
      trackingSaved = true;

      if (!alreadyHadRole) {
        try {
          const stats = readStats();
          if (!stats[interaction.guild.id]) stats[interaction.guild.id] = {};
          stats[interaction.guild.id][interaction.user.id] = (
            Number(stats[interaction.guild.id][interaction.user.id]) || 0
          ) + 1;
          saveStats(stats);
        } catch (error) {
          console.error("🔴 [ABONE] Yetkili istatistiği kaydedilemedi:", error);
        }
      }

      const latestPending = readPending();
      delete latestPending[sourceMessageId];
      savePending(latestPending);

      const completedSelectionMessage = await interaction.editReply({
        content: `${emojiler.tik} <@${interaction.user.id}> yorumu seçti, eşleştirme tamamlandı.`,
        embeds: [],
        components: [],
        allowedMentions: { users: [interaction.user.id] },
      });
      setTimeout(() => completedSelectionMessage.delete().catch(() => null), 5_000);

      const rollbackRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`geri-al-${targetMember.id}`)
          .setLabel("Rolü Geri Al")
          .setStyle(ButtonStyle.Danger)
      );
      await interaction.channel.send({
        content: `${emojiler.tik} <@${targetMember.id}> abone rolün **verildi**.`,
        components: [rollbackRow],
        allowedMentions: { users: [targetMember.id] },
      }).catch(error => console.error("🔴 [ABONE] Başarı mesajı gönderilemedi:", error));
    } catch (error) {
      console.error("🔴 [ABONE] Yorum seçimi işlenemedi:", error);
      if (roleAdded && !trackingSaved && setting.rol) {
        const targetMember = await interaction.guild.members.fetch(application.authorId).catch(() => null);
        await targetMember?.roles.remove(setting.rol, "Yorum eşleştirmesi kaydedilemedi.").catch(() => null);
      }
      const errorPayload = {
        content: `${emojiler.uyari} **Yorum eşleştirilemedi:** ${error.message || "Bilinmeyen hata"}`,
        flags: 64,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(errorPayload).catch(() => null);
      } else {
        await interaction.reply(errorPayload).catch(() => null);
      }
    } finally {
      processingSelections.delete(selectionKey);
    }
  });

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton() || !interaction.customId.startsWith("geri-al-")) return;

    const setting = store.getGuildSetting(interaction.guild.id);
    if (!interaction.member.roles.cache.has(setting.yetkili)) {
      return interaction.reply({ content: `${emojiler.uyari} **Bu işlemi yapma yetkin yok.**`, flags: 64 });
    }

    const targetId = interaction.customId.slice("geri-al-".length);
    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      return interaction.reply({ content: `${emojiler.uyari} **Kişi bulunamadı.**`, flags: 64 });
    }

    try {
      if (setting.rol) {
        await targetMember.roles.remove(setting.rol, `Abone rolü ${interaction.user.tag} tarafından geri alındı.`);
      }
      store.updateTrackingRecord(interaction.guild.id, targetId, tracking => {
        tracking.status = "manual_removed";
        tracking.removedAt = new Date().toISOString();
        tracking.removedBy = interaction.user.id;
      });
      return interaction.reply({
        content: `${emojiler.tik} <@${targetId}> adlı kişiden abone rolü **geri alındı.**`,
        flags: 64,
      });
    } catch (error) {
      console.error("🔴 [ABONE] Rol geri alınamadı:", error);
      return interaction.reply({ content: `${emojiler.uyari} **Rol geri alınamadı.**`, flags: 64 });
    }
  });

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton() || !interaction.customId.startsWith("red-")) return;

    const setting = store.getGuildSetting(interaction.guild.id);
    if (!interaction.member.roles.cache.has(setting.yetkili)) {
      return interaction.reply({ content: `${emojiler.uyari} **Bu işlemi yapma yetkin yok.**`, flags: 64 });
    }

    try {
      await interaction.deferReply({ flags: 64 });
      const reason = interaction.customId.slice("red-".length);
      const referenceId = interaction.message.reference?.messageId;
      const reference = referenceId
        ? await interaction.channel.messages.fetch(referenceId).catch(() => null)
        : null;
      if (!reference) throw new Error("Başvuru mesajı bulunamadı.");

      let latestVideoText = "";
      if (reason === "Son Video Değil") {
        const latestVideo = await fetchLatestVideoForChannels(setting.youtube.kaynakKanallar);
        const latestVideoUrl = latestVideo?.link || setting.youtube.sonVideoUrl;

        if (latestVideo) {
          store.updateGuildSetting(interaction.guild.id, draft => {
            draft.youtube.sonVideoId = latestVideo.videoId;
            draft.youtube.sonVideoUrl = latestVideo.link;
            draft.youtube.sonVideoBaslik = latestVideo.title;
            draft.youtube.sonVideoKanal = latestVideo.author;
            draft.youtube.sonVideoPublished = latestVideo.published;
          });
        }

        latestVideoText = latestVideoUrl
          ? `\n\n▶️ **Son Video:** ${latestVideoUrl}`
          : `\n\n${emojiler.uyari} **Son video bağlantısı alınamadı.**`;
      }

      const infoText = setting.kontrolMesaj ? `\n\n${setting.kontrolMesaj}` : "";
      const embed = new EmbedBuilder()
        .setTitle(`${emojiler.carpi} Ekran görüntün reddedildi.`)
        .setDescription(`${emojiler.info} Sebep: **${reason}**${latestVideoText}${infoText}`)
        .setColor("Red");

      await reference.reply({
        content: `<@${reference.author.id}>`,
        embeds: [embed],
        allowedMentions: { users: [reference.author.id] },
      });
      await interaction.editReply({ content: `${emojiler.tik} Red nedeni kullanıcıya gönderildi.` });
      setTimeout(() => interaction.message.delete().catch(() => null), 1_000);
    } catch (error) {
      console.error("🔴 [ABONE] Red nedeni gönderilemedi:", error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `${emojiler.uyari} **Mesaj bulunamadı veya başka bir hata oluştu.**`,
        }).catch(() => null);
      } else {
        await interaction.reply({
          content: `${emojiler.uyari} **Mesaj bulunamadı veya başka bir hata oluştu.**`,
          flags: 64,
        });
      }
    }
  });
};
