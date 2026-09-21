const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, escapeMarkdown } = require("discord.js");
const path = require("path");
const { pathToFileURL } = require("url");
const store = require("./aboneStore");

const CHECK_INTERVAL = 60_000;
let youtubeApiPromise;
let checkRunning = false;

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function safeText(value, fallback = "Bilinmiyor", maxLength = 1_600) {
  const text = String(value || "").trim() || fallback;
  return escapeMarkdown(text.slice(0, maxLength));
}

function inlineCode(value, fallback = "Bilinmiyor", maxLength = 100) {
  const text = String(value || "").trim() || fallback;
  return `\`${text.replace(/`/g, "'").slice(0, maxLength)}\``;
}

function quoteText(value) {
  return safeText(value, "Yorum metni bulunamadı.")
    .split(/\r?\n/)
    .map(line => `> ${line || " "}`)
    .join("\n");
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function linkButton(label, emoji, url) {
  const target = safeUrl(url);
  if (!target) return null;
  return new ButtonBuilder()
    .setLabel(label)
    .setEmoji(emoji)
    .setStyle(ButtonStyle.Link)
    .setURL(target);
}

function addLinkRow(container, links) {
  const buttons = links
    .map(({ label, emoji, url }) => linkButton(label, emoji, url))
    .filter(Boolean);
  if (buttons.length) {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
  }
  return container;
}

function buildRemovedDmCard(record) {
  const container = new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "## 🛡️ Abone rolün geri alındı",
        "Doğrulanan YouTube yorumun artık videoda bulunamadığı için abone rolün otomatik olarak kaldırıldı.",
      ].join("\n"))
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### Doğrulama Kaydı",
        `**YouTube kanalı:** ${safeText(record.youtubeChannelName || record.youtubeChannelId)}`,
        `**Video ID:** ${inlineCode(record.videoId)}`,
      ].join("\n"))
    );

  addLinkRow(container, [
    { label: "Videoya Git", emoji: "▶️", url: record.videoUrl },
    { label: "Kanala Git", emoji: "🔗", url: record.youtubeChannelUrl },
  ]);

  return container
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### Kayıtlı Yorum\n${quoteText(record.commentText)}`)
    );
}

function buildRemovedLogCard(record) {
  const container = new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "## 🚨 YouTube Yorumu Silindi",
        `<@${record.userId}> kullanıcısının doğrulanan yorumu silindi ve abone rolü geri alındı.`,
      ].join("\n"))
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### Eşleştirme Detayları",
        `**Discord:** <@${record.userId}>  ·  ${inlineCode(record.userId)}`,
        `**YouTube:** ${safeText(record.youtubeChannelName || record.youtubeChannelId)}`,
        `**Yorum ID:** ${inlineCode(record.commentId)}`,
      ].join("\n"))
    );

  addLinkRow(container, [
    { label: "Videoya Git", emoji: "▶️", url: record.videoUrl },
    { label: "Kanala Git", emoji: "🔗", url: record.youtubeChannelUrl },
    { label: "Başvuruya Git", emoji: "💬", url: record.sourceMessage },
  ]);

  return container
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### Silinen Yorum\n${quoteText(record.commentText)}`)
    );
}

function getYoutubeApi() {
  if (!youtubeApiPromise) {
    youtubeApiPromise = Promise.all([
      import("youtubei.js"),
      import(pathToFileURL(path.join(
        path.dirname(require.resolve("youtubei.js/package.json")),
        "dist/protos/generated/misc/params.js"
      )).href),
    ])
      .then(async ([{ Innertube }, { GetCommentsSectionParams }]) => ({
        youtube: await Innertube.create({
          generate_session_locally: true,
          retrieve_player: false,
        }),
        GetCommentsSectionParams,
      }))
      .catch(error => {
        youtubeApiPromise = null;
        throw error;
      });
  }
  return youtubeApiPromise;
}

function normalizeComment(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("tr-TR");
}

function normalizeYoutubeUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    if (!host.endsWith("youtube.com")) return null;
    const pathname = decodeURIComponent(url.pathname).replace(/\/+$/, "");
    return `https://youtube.com${pathname}`;
  } catch {
    return null;
  }
}

function extractChannelIdentity(value) {
  const normalized = normalizeYoutubeUrl(value);
  if (!normalized) return null;
  const pathname = new URL(normalized).pathname;
  const channelMatch = pathname.match(/^\/channel\/(UC[\w-]{20,})$/i);
  if (channelMatch) return { type: "id", value: channelMatch[1] };
  const handleMatch = pathname.match(/^\/@([^/]+)$/i);
  if (handleMatch) return { type: "handle", value: handleMatch[1].toLowerCase() };
  return null;
}

function extractVideoId(value) {
  const source = String(value || "");
  const patterns = [
    /(?:youtube\.com\/watch\?[^\s]*?v=)([\w-]{11})/i,
    /(?:youtu\.be\/)([\w-]{11})/i,
    /(?:youtube\.com\/(?:shorts|live)\/)([\w-]{11})/i,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function parseSubmission(content) {
  const source = String(content || "").trim();
  const urls = source.match(/https?:\/\/[^\s<>]+/gi) || [];
  const channelUrl = urls
    .map(url => url.replace(/[),.;]+$/, ""))
    .find(url => extractChannelIdentity(url));
  const videoId = extractVideoId(source);

  let commentText = source;
  for (const url of urls) {
    const cleanedUrl = url.replace(/[),.;]+$/, "");
    if (cleanedUrl === channelUrl || extractVideoId(cleanedUrl)) {
      commentText = commentText.replace(url, " ");
    }
  }
  commentText = commentText
    .replace(/^\s*(?:youtube\s*)?(?:kanal|channel)(?:\s*(?:linki|url))?\s*[:=-]\s*/gim, "")
    .replace(/^\s*(?:yorum|comment)\s*[:=-]\s*/gim, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    channelUrl: channelUrl ? normalizeYoutubeUrl(channelUrl) : null,
    commentText: commentText || null,
    videoId,
  };
}

function channelMatches(author, identity) {
  if (!author || !identity) return false;
  if (identity.type === "id") return author.id === identity.value;

  const authorUrl = normalizeYoutubeUrl(author.url);
  if (identity.type === "handle") {
    return authorUrl?.toLowerCase() === `https://youtube.com/@${identity.value}`;
  }
  return false;
}

function findOnComments(comments, criteria) {
  const expectedText = normalizeComment(criteria.commentText);
  const identity = criteria.youtubeChannelId
    ? { type: "id", value: criteria.youtubeChannelId }
    : extractChannelIdentity(criteria.channelUrl);

  for (const comment of comments) {
    if (criteria.commentId && comment.commentId !== criteria.commentId) continue;
    if (!channelMatches(comment.author, identity)) continue;
    if (!criteria.commentId && normalizeComment(comment.commentText) !== expectedText) continue;

    return {
      commentId: comment.commentId,
      commentText: comment.commentText || criteria.commentText,
      youtubeChannelId: comment.author?.id || null,
      youtubeChannelName: comment.author?.name || null,
      youtubeChannelUrl: normalizeYoutubeUrl(comment.author?.url) || criteria.channelUrl,
    };
  }
  return null;
}

function createInitialContinuation(GetCommentsSectionParams, videoId, commentId) {
  const token = GetCommentsSectionParams.encode({
    ctx: { videoId },
    unkParam: 6,
    params: {
      opts: {
        videoId,
        sortBy: 1,
        type: 2,
        commentId: commentId || "",
      },
      target: "comments-section",
    },
  });
  return encodeURIComponent(Buffer.from(token.finish()).toString("base64"));
}

function findContinuation(data) {
  const endpoints = [
    ...(data.onResponseReceivedEndpoints || []),
    ...(data.onResponseReceivedActions || []),
  ];

  for (const endpoint of endpoints) {
    const command = endpoint.reloadContinuationItemsCommand
      || endpoint.appendContinuationItemsAction;
    if (!command || (command.targetId && command.targetId !== "comments-section")) continue;
    const items = command.continuationItems || [];
    for (let index = items.length - 1; index >= 0; index--) {
      const token = items[index]?.continuationItemRenderer
        ?.continuationEndpoint?.continuationCommand?.token;
      if (token) return token;
    }
  }
  return null;
}

function parseRawComments(data) {
  const mutations = data.frameworkUpdates?.entityBatchUpdate?.mutations || [];
  const comments = [];

  for (const mutation of mutations) {
    const payload = mutation.payload?.commentEntityPayload;
    const properties = payload?.properties;
    const author = payload?.author;
    if (!properties?.commentId || !author?.channelId) continue;

    const canonicalPath = author.channelCommand?.innertubeCommand
      ?.browseEndpoint?.canonicalBaseUrl;
    comments.push({
      commentId: properties.commentId,
      commentText: properties.content?.content || "",
      author: {
        id: author.channelId,
        name: author.displayName || author.channelId,
        url: canonicalPath
          ? `https://youtube.com${canonicalPath}`
          : `https://youtube.com/channel/${author.channelId}`,
      },
    });
  }

  const endpoints = [
    ...(data.onResponseReceivedEndpoints || []),
    ...(data.onResponseReceivedActions || []),
  ];
  let header = null;
  for (const endpoint of endpoints) {
    const command = endpoint.reloadContinuationItemsCommand
      || endpoint.appendContinuationItemsAction;
    const headerItem = command?.continuationItems
      ?.find(item => item.commentsHeaderRenderer);
    if (headerItem) {
      header = headerItem.commentsHeaderRenderer;
      break;
    }
  }

  const serialized = JSON.stringify(data);
  const unavailable = Boolean(header && !header.countText);
  const hasCommentResponse = Boolean(
    header
    || data.frameworkUpdates?.entityBatchUpdate
    || serialized.includes('"targetId":"comments-section"')
  );

  return {
    comments,
    continuation: findContinuation(data),
    unavailable,
    hasCommentResponse,
  };
}

async function getRawCommentsPage(videoId, commentId, continuation) {
  const { youtube, GetCommentsSectionParams } = await getYoutubeApi();
  const token = continuation || createInitialContinuation(GetCommentsSectionParams, videoId, commentId);
  const response = await youtube.actions.execute("/next", { continuation: token });
  if (!response.success) throw new Error(`YouTube yorum isteği HTTP ${response.status_code} döndürdü.`);
  return parseRawComments(response.data);
}

async function findYoutubeComment(criteria, options = {}) {
  const { maxPages = 1 } = options;
  if (!criteria.videoId || !criteria.channelUrl) {
    return { status: "invalid", reason: "Video veya YouTube kanal bilgisi eksik." };
  }

  try {
    let continuation = null;

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
      const page = await getRawCommentsPage(
        criteria.videoId,
        criteria.commentId,
        continuation
      );
      if (page.unavailable) return { status: "unavailable", reason: "Video yorumları kullanılamıyor." };
      if (!page.hasCommentResponse) return { status: "error", reason: "YouTube geçerli bir yorum yanıtı döndürmedi." };
      const match = findOnComments(page.comments, criteria);
      if (match) return { status: "found", comment: match };
      if (!page.continuation || criteria.commentId || pageIndex === maxPages - 1) break;
      continuation = page.continuation;
    }

    return { status: "missing" };
  } catch (error) {
    const message = String(error?.message || error);
    if (/comments (?:are|have been) disabled|video unavailable/i.test(message)) {
      return { status: "unavailable", reason: message };
    }
    console.warn("⚠️ [ABONE TAKİP] YouTube yorum sorgusu başarısız:", message);
    return { status: "error", reason: message };
  }
}

async function listYoutubeComments(videoId, options = {}) {
  const { maxPages = 2, limit = 25 } = options;
  if (!videoId) {
    return { status: "invalid", reason: "Video bilgisi eksik.", comments: [] };
  }

  try {
    const comments = [];
    const seenCommentIds = new Set();
    let continuation = null;

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
      const page = await getRawCommentsPage(videoId, null, continuation);
      if (page.unavailable) {
        return { status: "unavailable", reason: "Video yorumları kullanılamıyor.", comments: [] };
      }
      if (!page.hasCommentResponse) {
        return { status: "error", reason: "YouTube geçerli bir yorum yanıtı döndürmedi.", comments: [] };
      }

      for (const comment of page.comments) {
        if (seenCommentIds.has(comment.commentId)) continue;
        seenCommentIds.add(comment.commentId);
        comments.push({
          commentId: comment.commentId,
          commentText: comment.commentText || "",
          youtubeChannelId: comment.author?.id || null,
          youtubeChannelName: comment.author?.name || null,
          youtubeChannelUrl: normalizeYoutubeUrl(comment.author?.url)
            || (comment.author?.id ? `https://youtube.com/channel/${comment.author.id}` : null),
        });
        if (comments.length >= limit) return { status: "ok", comments };
      }

      if (!page.continuation || pageIndex === maxPages - 1) break;
      continuation = page.continuation;
    }

    return { status: "ok", comments };
  } catch (error) {
    const message = String(error?.message || error);
    console.warn("⚠️ [ABONE TAKİP] YouTube yorum listesi alınamadı:", message);
    return { status: "error", reason: message, comments: [] };
  }
}

async function notifyRemoved(client, record, setting) {
  const guild = client.guilds.cache.get(record.guildId)
    || await client.guilds.fetch(record.guildId).catch(() => null);
  if (!guild) return false;

  const member = await guild.members.fetch(record.userId).catch(() => null);
  const roleId = setting.rol || record.roleId;
  if (member && roleId && member.roles.cache.has(roleId)) {
    const removed = await member.roles.remove(roleId, "Takip edilen YouTube yorumu silindi.")
      .then(() => true)
      .catch(error => {
        console.error("🔴 [ABONE TAKİP] Rol alınamadı:", error);
        return false;
      });
    if (!removed) return false;
  }

  if (member) {
    await member.send({
      components: [buildRemovedDmCard(record)],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).catch(() => null);
  }

  if (setting.logKanal) {
    const logChannel = await guild.channels.fetch(setting.logKanal).catch(() => null);
    if (logChannel?.isTextBased?.()) {
      await logChannel.send({
        components: [buildRemovedLogCard(record)],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [], users: [record.userId] },
      }).catch(error => console.error("🔴 [ABONE TAKİP] Log gönderilemedi:", error));
    }
  }
  return true;
}

async function checkTrackedComments(client) {
  if (checkRunning) return;
  checkRunning = true;

  try {
    const tracking = store.readTracking();
    const settings = store.getAllGuildSettings();
    const updates = [];

    for (const [guildId, records] of Object.entries(tracking)) {
      const setting = settings[guildId];
      if (!setting) continue;

      for (const [userId, record] of Object.entries(records || {})) {
        if (record.status !== "active") continue;

        const result = await findYoutubeComment({
          videoId: record.videoId,
          channelUrl: record.youtubeChannelUrl,
          youtubeChannelId: record.youtubeChannelId,
          commentId: record.commentId,
          commentText: record.commentText,
        });

        const patch = {
          lastCheckedAt: new Date().toISOString(),
          lastCheckResult: result.status,
        };

        if (result.status !== "missing") {
          updates.push({ guildId, userId, commentId: record.commentId, patch });
          continue;
        }

        const removedAt = new Date().toISOString();
        const removed = await notifyRemoved(client, { ...record, removedAt }, setting);
        if (!removed) {
          patch.lastCheckResult = "role_remove_failed";
          updates.push({ guildId, userId, commentId: record.commentId, patch });
          continue;
        }

        Object.assign(patch, { status: "comment_deleted", removedAt });
        updates.push({ guildId, userId, commentId: record.commentId, patch });
        console.log(`🟠 [ABONE TAKİP] ${guildId}/${userId} yorumu silindi, rol geri alındı.`);
      }
    }

    if (updates.length) {
      const latest = store.readTracking();
      for (const update of updates) {
        const current = latest[update.guildId]?.[update.userId];
        if (!current || current.commentId !== update.commentId) continue;
        Object.assign(current, update.patch);
      }
      store.writeTracking(latest);
    }
  } finally {
    checkRunning = false;
  }
}

function startYoutubeCommentTracker(client) {
  console.log("▶️ [ABONE TAKİP] YouTube yorum kontrolü 1 dakikalık aralıkla başlatıldı.");
  const timer = setInterval(() => {
    checkTrackedComments(client).catch(error => {
      console.error("🔴 [ABONE TAKİP] Kontrol döngüsü başarısız:", error);
    });
  }, CHECK_INTERVAL);
  timer.unref?.();
  return timer;
}

module.exports = {
  CHECK_INTERVAL,
  buildRemovedDmCard,
  buildRemovedLogCard,
  extractChannelIdentity,
  extractVideoId,
  findYoutubeComment,
  listYoutubeComments,
  normalizeComment,
  normalizeYoutubeUrl,
  parseSubmission,
  startYoutubeCommentTracker,
};