const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextDisplayBuilder, ThumbnailBuilder, escapeMarkdown } = require("discord.js");
const { GifDisposal, GifEncoder, ImageData, createCanvas, loadImage } = require("@napi-rs/canvas");
const { GifReader } = require("omggif");
const axios = require("axios");

const ACCENT_COLOR = 0xd7ff00;
const ERROR_COLOR = 0xed4245;
const SESSION_TIME = 5 * 60_000;
const V2_FLAGS = MessageFlags.IsComponentsV2;
const PRIVATE_V2_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_ANIMATED_RENDER_SIZE = 1024;
const MAX_ANIMATED_FRAMES = 120;
const MAX_ANIMATED_OUTPUT_BYTES = 8 * 1024 * 1024;

const SIZES = Object.freeze([
  { label: "512px", value: "512", size: 512 },
  { label: "1024px (HD)", value: "1024", size: 1024 },
  { label: "2048px (2K)", value: "2048", size: 2048 },
  { label: "4096px (4K)", value: "4096", size: 4096 },
]);

const SCOPES = Object.freeze([
  { label: "Avatar", value: "avatar", emoji: "🖼️" },
  { label: "Banner", value: "banner", emoji: "🏳️" },
  { label: "Dekorasyon", value: "decoration", emoji: "🎨" },
  { label: "Tümünü Göster (Avatar, Banner, Dekorasyon)", value: "all", emoji: "🌟" },
]);

const FORMATS = Object.freeze([
  { label: "PNG", value: "png" },
  { label: "WEBP", value: "webp" },
  { label: "JPG", value: "jpg" },
]);

const SHAPES = Object.freeze([
  { label: "Orijinal (Kare)", value: "original", emoji: "🖼️" },
  { label: "Oval / Daire", value: "circle", emoji: "🔴" },
  { label: "Yuvarlatılmış Kare", value: "rounded", emoji: "⬜" },
  { label: "Altıgen", value: "hexagon", emoji: "🔷" },
  { label: "Yıldız", value: "star", emoji: "⭐" },
  { label: "Kalp", value: "heart", emoji: "💖" },
  { label: "Elmas", value: "diamond", emoji: "💎" },
  { label: "Cyberpunk Çerçeve", value: "cyberpunk", emoji: "🤖" },
  { label: "Kalkan Rozeti", value: "shield", emoji: "🛡️" },
]);

const SIZE_BY_VALUE = new Map(SIZES.map((entry) => [entry.value, entry]));
const SCOPE_BY_VALUE = new Map(SCOPES.map((entry) => [entry.value, entry]));
const SHAPE_BY_VALUE = new Map(SHAPES.map((entry) => [entry.value, entry]));

function slashChoices(entries) {
  return entries.map(({ label, value }) => ({ name: label, value }));
}

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function buildSelectRow(customId, definitions, selectedValue) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      definitions.map((definition) => {
        const option = new StringSelectMenuOptionBuilder()
          .setLabel(definition.label)
          .setValue(definition.value)
          .setDefault(definition.value === selectedValue);

        if (definition.emoji) option.setEmoji(definition.emoji);
        return option;
      })
    );

  return new ActionRowBuilder().addComponents(select);
}

function getMemberAvatarURL(member, user, extension, size) {
  return member?.avatarURL?.({ extension, size })
    || user.displayAvatarURL({ extension, size });
}

function assetKey(extension, size) {
  return `${extension}:${size}`;
}

function createProfileAssetSnapshot(member, user) {
  const bannerURLs = new Map();
  const avatarGifURLs = new Map();
  const displayedAvatarHash = member?.avatar || user.avatar || null;
  const animatedAvatar = typeof displayedAvatarHash === "string"
    && displayedAvatarHash.startsWith("a_");

  for (const format of FORMATS) {
    for (const size of SIZES) {
      const options = { extension: format.value, size: size.size };
      const bannerURL = member?.bannerURL?.(options)
        || user.bannerURL?.(options)
        || null;

      if (bannerURL) bannerURLs.set(assetKey(format.value, size.size), bannerURL);
    }
  }

  if (animatedAvatar) {
    for (const size of SIZES) {
      const options = { extension: "gif", size: size.size };
      const gifURL = member?.avatar
        ? member.avatarURL?.(options)
        : user.avatarURL?.(options);

      if (gifURL) avatarGifURLs.set(size.size, gifURL);
    }
  }

  const decorationURL = member?.avatarDecorationURL?.()
    || user.avatarDecorationURL?.()
    || null;

  return { avatarGifURLs, bannerURLs, decorationURL };
}

function getAvatarGifURL(session, size) {
  return session.profileAssets.avatarGifURLs.get(size) || null;
}

function getBannerURL(session, extension, size) {
  return session.profileAssets.bannerURLs.get(assetKey(extension, size)) || null;
}

function getDecorationURL(session) {
  return session.profileAssets.decorationURL;
}

function getMimeType(format) {
  return format === "jpg" ? "image/jpeg" : `image/${format}`;
}

function drawCover(ctx, image, x, y, width, height) {
  const imageRatio = image.width / image.height;
  const targetRatio = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.width;
  let sourceHeight = image.height;

  if (imageRatio > targetRatio) {
    sourceWidth = image.height * targetRatio;
    sourceX = (image.width - sourceWidth) / 2;
  } else if (imageRatio < targetRatio) {
    sourceHeight = image.width / targetRatio;
    sourceY = (image.height - sourceHeight) / 2;
  }

  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height
  );
}

function addPolygonPath(ctx, centerX, centerY, radius, sides, rotation = -Math.PI / 2) {
  for (let index = 0; index < sides; index++) {
    const angle = rotation + (index * Math.PI * 2) / sides;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function addStarPath(ctx, centerX, centerY, outerRadius, innerRadius, points = 5) {
  for (let index = 0; index < points * 2; index++) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + (index * Math.PI) / points;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function addHeartPath(ctx, size, inset = 0) {
  const start = inset;
  const span = size - inset * 2;
  const x = (factor) => start + span * factor;
  const y = (factor) => start + span * factor;

  ctx.moveTo(x(0.5), y(0.94));
  ctx.bezierCurveTo(x(0.42), y(0.84), x(0.08), y(0.64), x(0.08), y(0.34));
  ctx.bezierCurveTo(x(0.08), y(0.12), x(0.35), y(0.03), x(0.5), y(0.25));
  ctx.bezierCurveTo(x(0.65), y(0.03), x(0.92), y(0.12), x(0.92), y(0.34));
  ctx.bezierCurveTo(x(0.92), y(0.64), x(0.58), y(0.84), x(0.5), y(0.94));
  ctx.closePath();
}

function addRoundedRectPath(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function addCyberpunkPath(ctx, size, inset) {
  const far = size - inset;
  const cut = size * 0.13;
  ctx.moveTo(inset + cut, inset);
  ctx.lineTo(far - cut * 0.45, inset);
  ctx.lineTo(far, inset + cut * 0.8);
  ctx.lineTo(far, far - cut);
  ctx.lineTo(far - cut, far);
  ctx.lineTo(inset + cut * 0.45, far);
  ctx.lineTo(inset, far - cut * 0.75);
  ctx.lineTo(inset, inset + cut);
  ctx.closePath();
}

function addShieldPath(ctx, size, inset) {
  const start = inset;
  const span = size - inset * 2;
  const x = (factor) => start + span * factor;
  const y = (factor) => start + span * factor;

  ctx.moveTo(x(0.5), y(0.03));
  ctx.lineTo(x(0.9), y(0.18));
  ctx.lineTo(x(0.82), y(0.66));
  ctx.quadraticCurveTo(x(0.72), y(0.84), x(0.5), y(0.97));
  ctx.quadraticCurveTo(x(0.28), y(0.84), x(0.18), y(0.66));
  ctx.lineTo(x(0.1), y(0.18));
  ctx.closePath();
}

function addShapePath(ctx, shape, size, inset = 0) {
  const center = size / 2;
  const radius = size / 2 - inset;

  ctx.beginPath();
  switch (shape) {
    case "circle":
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      break;
    case "rounded":
      addRoundedRectPath(ctx, inset, inset, size - inset * 2, size - inset * 2, size * 0.16);
      break;
    case "hexagon":
      addPolygonPath(ctx, center, center, radius, 6);
      break;
    case "star":
      addStarPath(ctx, center, center, radius, radius * 0.46);
      break;
    case "heart":
      addHeartPath(ctx, size, inset);
      break;
    case "diamond":
      addPolygonPath(ctx, center, center, radius, 4);
      break;
    case "cyberpunk":
      addCyberpunkPath(ctx, size, inset);
      break;
    case "shield":
      addShieldPath(ctx, size, inset);
      break;
    default:
      ctx.rect(inset, inset, size - inset * 2, size - inset * 2);
      break;
  }
}

function drawCyberpunkFrame(ctx, size) {
  const outerInset = size * 0.018;
  const innerInset = size * 0.055;

  ctx.save();
  ctx.lineJoin = "bevel";
  ctx.shadowBlur = size * 0.025;
  ctx.shadowColor = "#00eaff";
  ctx.strokeStyle = "#00eaff";
  ctx.lineWidth = Math.max(4, size * 0.018);
  addCyberpunkPath(ctx, size, outerInset);
  ctx.stroke();

  ctx.shadowColor = "#ff2bd6";
  ctx.strokeStyle = "#ff2bd6";
  ctx.lineWidth = Math.max(2, size * 0.008);
  addCyberpunkPath(ctx, size, innerInset);
  ctx.stroke();

  const corner = size * 0.18;
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(4, 8, 18, 0.92)";
  ctx.beginPath();
  ctx.moveTo(outerInset, outerInset);
  ctx.lineTo(outerInset + corner, outerInset);
  ctx.lineTo(outerInset, outerInset + corner);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawShieldFrame(ctx, size) {
  const outerInset = size * 0.02;
  const innerInset = size * 0.055;

  ctx.save();
  ctx.lineJoin = "round";
  ctx.shadowBlur = size * 0.025;
  ctx.shadowColor = "#68d7ff";
  ctx.strokeStyle = "#d9f4ff";
  ctx.lineWidth = Math.max(5, size * 0.022);
  addShieldPath(ctx, size, outerInset);
  ctx.stroke();

  ctx.shadowColor = "#ffcf58";
  ctx.strokeStyle = "#ffcf58";
  ctx.lineWidth = Math.max(2, size * 0.008);
  addShieldPath(ctx, size, innerInset);
  ctx.stroke();
  ctx.restore();
}

function drawShapedImage(ctx, image, size, shape, background = null) {
  const framed = shape === "cyberpunk" || shape === "shield";
  const inset = framed ? size * 0.065 : 0;

  ctx.clearRect(0, 0, size, size);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);
  }

  ctx.save();
  addShapePath(ctx, shape, size, inset);
  ctx.clip();
  drawCover(ctx, image, inset, inset, size - inset * 2, size - inset * 2);
  ctx.restore();

  if (shape === "cyberpunk") drawCyberpunkFrame(ctx, size);
  if (shape === "shield") drawShieldFrame(ctx, size);
}

async function renderShapedAvatar(imageInput, size, shape, format) {
  const image = await loadImage(imageInput);
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  drawShapedImage(ctx, image, size, shape, format === "jpg" ? "#111214" : null);

  return canvas.toBuffer(getMimeType(format));
}

function clearGifFrameRect(pixels, canvasWidth, frame) {
  const startX = Math.max(0, frame.x);
  const startY = Math.max(0, frame.y);
  const endX = Math.min(canvasWidth, frame.x + frame.width);
  const canvasHeight = Math.floor(pixels.length / 4 / canvasWidth);
  const endY = Math.min(canvasHeight, frame.y + frame.height);

  for (let y = startY; y < endY; y++) {
    pixels.fill(0, (y * canvasWidth + startX) * 4, (y * canvasWidth + endX) * 4);
  }
}

function getSampledGifFrames(reader) {
  const frameCount = reader.numFrames();
  const step = Math.max(1, Math.ceil(frameCount / MAX_ANIMATED_FRAMES));
  const selected = [];

  for (let index = 0; index < frameCount; index += step) selected.push(index);
  if (selected[selected.length - 1] !== frameCount - 1) selected.push(frameCount - 1);

  return selected.slice(0, MAX_ANIMATED_FRAMES);
}

function getGifFrameDelay(reader, frameIndex, nextFrameIndex) {
  let delay = 0;
  const end = nextFrameIndex ?? reader.numFrames();

  for (let index = frameIndex; index < end; index++) {
    delay += Math.max(2, reader.frameInfo(index).delay || 10) * 10;
  }

  return Math.min(delay, 65_535);
}

function encodeShapedGif(gifInput, renderSize, shape) {
  const input = gifInput instanceof Uint8Array
    ? gifInput
    : new Uint8Array(gifInput.buffer, gifInput.byteOffset, gifInput.byteLength);
  const reader = new GifReader(input);
  const sourcePixels = new Uint8ClampedArray(reader.width * reader.height * 4);
  const sourceCanvas = createCanvas(reader.width, reader.height);
  const sourceContext = sourceCanvas.getContext("2d");
  const outputCanvas = createCanvas(renderSize, renderSize);
  const outputContext = outputCanvas.getContext("2d");
  const selectedFrames = getSampledGifFrames(reader);
  const selectedFrameSet = new Set(selectedFrames);
  const selectedFramePosition = new Map(selectedFrames.map((frame, index) => [frame, index]));
  const encoder = new GifEncoder(renderSize, renderSize, {
    quality: 10,
    repeat: reader.loopCount() ?? 0,
  });
  let previousFrame = null;
  let restorePixels = null;

  try {
    for (let frameIndex = 0; frameIndex < reader.numFrames(); frameIndex++) {
      if (previousFrame?.disposal === 2) {
        clearGifFrameRect(sourcePixels, reader.width, previousFrame);
      } else if (previousFrame?.disposal === 3 && restorePixels) {
        sourcePixels.set(restorePixels);
      }

      const frame = reader.frameInfo(frameIndex);
      const restoreBeforeFrame = frame.disposal === 3 ? sourcePixels.slice() : null;
      reader.decodeAndBlitFrameRGBA(frameIndex, sourcePixels);

      if (selectedFrameSet.has(frameIndex)) {
        sourceContext.putImageData(
          new ImageData(sourcePixels, reader.width, reader.height),
          0,
          0
        );
        drawShapedImage(outputContext, sourceCanvas, renderSize, shape);

        const selectedIndex = selectedFramePosition.get(frameIndex);
        const nextFrameIndex = selectedFrames[selectedIndex + 1];
        const rgba = outputContext.getImageData(0, 0, renderSize, renderSize).data;
        const outputPixels = new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);
        encoder.addFrame(outputPixels, renderSize, renderSize, {
          delay: getGifFrameDelay(reader, frameIndex, nextFrameIndex),
          disposal: GifDisposal.Background,
        });
      }

      previousFrame = frame;
      restorePixels = restoreBeforeFrame;
    }

    return encoder.finish();
  } finally {
    encoder.dispose();
  }
}

function renderShapedGif(gifInput, requestedSize, shape) {
  const renderSizes = [
    Math.min(requestedSize, MAX_ANIMATED_RENDER_SIZE),
    512,
    256,
  ].filter((size, index, sizes) => size <= requestedSize && sizes.indexOf(size) === index);

  let output = null;
  for (const renderSize of renderSizes) {
    output = encodeShapedGif(gifInput, renderSize, shape);
    if (output.length <= MAX_ANIMATED_OUTPUT_BYTES) break;
  }

  return output;
}

async function downloadImage(url, cache) {
  if (cache.has(url)) return cache.get(url);

  const request = axios.get(url, {
    responseType: "arraybuffer",
    timeout: 10_000,
    maxContentLength: MAX_IMAGE_BYTES,
    maxBodyLength: MAX_IMAGE_BYTES,
  }).then((response) => Buffer.from(response.data));

  cache.set(url, request);
  try {
    return await request;
  } catch (error) {
    cache.delete(url);
    throw error;
  }
}

function getVisibleAssetKeys(state, availability) {
  const keys = [];

  if (state.scope === "all") {
    keys.push("avatar");
    if (availability.banner) keys.push("banner");
    if (availability.decoration) keys.push("decoration");
  } else if (state.scope === "banner" && availability.banner) {
    keys.push("banner");
  } else if (state.scope === "decoration" && availability.decoration) {
    keys.push("decoration");
  } else {
    keys.push("avatar");
  }

  if (state.includeBanner && availability.banner && !keys.includes("banner")) {
    keys.push("banner");
  }

  return keys;
}

async function prepareView(session, state) {
  const { interactionId, member, user, imageCache } = session;
  const avatarURL = getMemberAvatarURL(member, user, state.format, state.size);
  const avatarGifURL = getAvatarGifURL(session, state.size);
  const bannerURL = getBannerURL(session, state.format, state.size);
  const decorationURL = getDecorationURL(session);
  const availability = {
    banner: Boolean(bannerURL),
    decoration: Boolean(decorationURL),
  };
  const visibleAssetKeys = getVisibleAssetKeys(state, availability);
  const mediaItems = [];
  const files = [];

  for (const key of visibleAssetKeys) {
    if (key === "avatar") {
      let mediaURL = avatarGifURL || avatarURL;

      if (state.shape !== "original") {
        const animated = Boolean(avatarGifURL);
        const sourceURL = animated
          ? getAvatarGifURL(session, Math.min(state.size, MAX_ANIMATED_RENDER_SIZE))
          : avatarURL;
        const sourceBuffer = await downloadImage(sourceURL, imageCache);
        const outputBuffer = animated
          ? renderShapedGif(sourceBuffer, state.size, state.shape)
          : await renderShapedAvatar(sourceBuffer, state.size, state.shape, state.format);
        const extension = animated ? "gif" : state.format;
        const filename = `avatar-${interactionId}.${extension}`;
        files.push(new AttachmentBuilder(outputBuffer, { name: filename }));
        mediaURL = `attachment://${filename}`;
      }

      mediaItems.push({
        key,
        url: mediaURL,
        description: `${user.username} kullanıcısının avatarı`,
      });
    } else if (key === "banner") {
      mediaItems.push({
        key,
        url: bannerURL,
        description: `${user.username} kullanıcısının bannerı`,
      });
    } else if (key === "decoration") {
      mediaItems.push({
        key,
        url: decorationURL,
        description: `${user.username} kullanıcısının avatar dekorasyonu`,
      });
    }
  }

  return { availability, files, mediaItems };
}

function buildLinkButtons(session, state) {
  const { member, user } = session;
  const row = new ActionRowBuilder();

  for (const format of FORMATS) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel(format.label)
        .setStyle(ButtonStyle.Link)
        .setURL(getMemberAvatarURL(member, user, format.value, state.size))
    );
  }

  const avatarGifURL = getAvatarGifURL(session, state.size);
  if (avatarGifURL) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("GIF")
        .setStyle(ButtonStyle.Link)
        .setURL(avatarGifURL)
    );
  }

  const bannerURL = getBannerURL(session, state.format, state.size);
  if (bannerURL) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("Bannerı Aç")
        .setEmoji("🏳️")
        .setStyle(ButtonStyle.Link)
        .setURL(bannerURL)
    );
  }

  return row;
}

function buildPanel(session, state, mediaItems, interactive = true) {
  const { interactionId, member, user } = session;
  const displayName = escapeMarkdown(user.username);
  const thumbnailURL = getMemberAvatarURL(member, user, "png", 256);
  const header = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Avatar Görüntüleyici\n**${displayName}** (<@${user.id}>)`)
    )
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailURL));

  const gallery = new MediaGalleryBuilder().addItems(
    mediaItems.map((item) => new MediaGalleryItemBuilder()
      .setURL(item.url)
      .setDescription(item.description))
  );

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addSectionComponents(header)
    .addSeparatorComponents(separator())
    .addMediaGalleryComponents(gallery)
    .addActionRowComponents(buildLinkButtons(session, state));

  if (interactive) {
    container
      .addActionRowComponents(
        buildSelectRow(`avatar:${interactionId}:scope`, SCOPES, state.scope)
      )
      .addActionRowComponents(
        buildSelectRow(`avatar:${interactionId}:shape`, SHAPES, state.shape)
      )
      .addActionRowComponents(
        buildSelectRow(`avatar:${interactionId}:size`, SIZES, String(state.size))
      );
  }

  return container;
}

function buildNoticePanel(title, description) {
  return new ContainerBuilder()
    .setAccentColor(ERROR_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
    );
}

function buildState(interaction) {
  return {
    format: interaction.options.getString("format") || "png",
    includeBanner: interaction.options.getBoolean("banner") || false,
    scope: interaction.options.getString("kapsam") || "avatar",
    shape: interaction.options.getString("şekil") || "original",
    size: Number(interaction.options.getString("boyut") || 1024),
  };
}

function getSelectedValue(componentInteraction) {
  return componentInteraction.values?.[0] || null;
}

function applySelection(state, control, value) {
  if (control === "scope" && SCOPE_BY_VALUE.has(value)) state.scope = value;
  if (control === "shape" && SHAPE_BY_VALUE.has(value)) state.shape = value;
  if (control === "size" && SIZE_BY_VALUE.has(value)) state.size = SIZE_BY_VALUE.get(value).size;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Avatar, banner ve dekorasyonu gelişmiş seçeneklerle gösterir.")
    .addUserOption((option) => option
      .setName("kişi")
      .setDescription("İncelenecek kişiyi seç.")
      .setRequired(false))
    .addStringOption((option) => option
      .setName("boyut")
      .setDescription("Görsel boyutunu seç.")
      .setRequired(false)
      .addChoices(...slashChoices(SIZES)))
    .addStringOption((option) => option
      .setName("kapsam")
      .setDescription("Gösterilecek profil görselini seç.")
      .setRequired(false)
      .addChoices(...slashChoices(SCOPES)))
    .addStringOption((option) => option
      .setName("format")
      .setDescription("Tercih edilen görsel formatını seç.")
      .setRequired(false)
      .addChoices(...slashChoices(FORMATS)))
    .addBooleanOption((option) => option
      .setName("banner")
      .setDescription("Banner önizlemesini dahil et.")
      .setRequired(false))
    .addStringOption((option) => option
      .setName("şekil")
      .setDescription("Avatar çerçevesinin şeklini seç.")
      .setRequired(false)
      .addChoices(...slashChoices(SHAPES))),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const selectedUser = interaction.options.getUser("kişi") || interaction.user;
      const member = interaction.guild
        ? await interaction.guild.members.fetch(selectedUser.id).catch(() => null)
        : null;
      const user = await interaction.client.users
        .fetch(selectedUser.id, { force: true })
        .catch(() => member?.user || selectedUser);
      const state = buildState(interaction);
      const session = {
        imageCache: new Map(),
        interactionId: interaction.id,
        member,
        profileAssets: createProfileAssetSnapshot(member, user),
        user,
      };

      const initialAvailability = {
        banner: Boolean(getBannerURL(session, state.format, state.size)),
        decoration: Boolean(getDecorationURL(session)),
      };

      if (state.scope === "banner" && !initialAvailability.banner) state.scope = "avatar";
      if (state.scope === "decoration" && !initialAvailability.decoration) state.scope = "avatar";

      let latestView = await prepareView(session, state);
      const message = await interaction.editReply({
        allowedMentions: { parse: [] },
        attachments: [],
        components: [buildPanel(session, state, latestView.mediaItems)],
        files: latestView.files,
        flags: V2_FLAGS,
      });

      const customIdPrefix = `avatar:${interaction.id}:`;
      const collector = message.createMessageComponentCollector({ time: SESSION_TIME });
      let latestState = { ...state };
      let sessionEnded = false;
      let revision = 0;

      collector.on("collect", async (componentInteraction) => {
        if (!componentInteraction.customId.startsWith(customIdPrefix)) return;

        if (componentInteraction.user.id !== interaction.user.id) {
          await componentInteraction.reply({
            components: [buildNoticePanel(
              "🔒 Bu panel sana ait değil",
              "Kendi görüntüleyicini açmak için `/avatar` komutunu kullan."
            )],
            flags: PRIVATE_V2_FLAGS,
          }).catch(() => {});
          return;
        }

        const control = componentInteraction.customId.slice(customIdPrefix.length);
        const value = getSelectedValue(componentInteraction);

        if (
          (control === "scope" && value === "banner" && !latestView.availability.banner)
          || (control === "scope" && value === "decoration" && !latestView.availability.decoration)
        ) {
          const unavailableName = value === "banner" ? "bannerı" : "avatar dekorasyonu";
          await componentInteraction.reply({
            components: [buildNoticePanel(
              "⚠️ Görsel bulunamadı",
              `Bu kişinin ${unavailableName} bulunmuyor.`
            )],
            flags: PRIVATE_V2_FLAGS,
          }).catch(() => {});
          return;
        }

        await componentInteraction.deferUpdate();
        applySelection(state, control, value);
        const nextState = { ...state };
        const currentRevision = ++revision;

        try {
          const nextView = await prepareView(session, nextState);
          if (sessionEnded || currentRevision !== revision) return;

          latestState = nextState;
          latestView = nextView;
          await componentInteraction.editReply({
            allowedMentions: { parse: [] },
            attachments: [],
            components: [buildPanel(session, latestState, latestView.mediaItems)],
            files: latestView.files,
            flags: V2_FLAGS,
          });
        } catch (error) {
          console.error("🔴 [AVATAR] Panel güncellenemedi:", error);
          await componentInteraction.followUp({
            components: [buildNoticePanel(
              "⚠️ Önizleme oluşturulamadı",
              "Seçilen avatar önizlemesi hazırlanamadı. Lütfen başka bir ayar dene."
            )],
            flags: PRIVATE_V2_FLAGS,
          }).catch(() => {});
        }
      });

      collector.on("end", async () => {
        sessionEnded = true;
        revision++;
        session.imageCache.clear();
        await interaction.editReply({
          allowedMentions: { parse: [] },
          components: [buildPanel(session, latestState, latestView.mediaItems, false)],
          flags: V2_FLAGS,
        }).catch(() => {});
      });
    } catch (error) {
      console.error("🔴 [AVATAR] Komut çalıştırılamadı:", error);
      await interaction.editReply({
        components: [buildNoticePanel(
          "⚠️ Avatar alınamadı",
          "Kullanıcının avatar bilgileri şu anda yüklenemedi."
        )],
        flags: V2_FLAGS,
      }).catch(() => {});
    }
  },
};