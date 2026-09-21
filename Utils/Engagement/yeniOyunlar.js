const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } = require("discord.js");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const fs = require("fs");
const path = require("path");
const emojiler = require("../Emojis/emojiler.js");
const { createJsonStore } = require("../Core/safeJsonStore");
const { buildGameSetupPayload } = require("./oyunKurulumPaneli");
const hangmanWords = require("./adamAsmacaKelimeleri");

const databaseRoot = path.resolve(__dirname, "../../Database/Eğlence ve Etkileşim");
const channelStore = createJsonStore(path.join(databaseRoot, "oyunKanallari.json"));
const numberStore = createJsonStore(path.join(databaseRoot, "sayiTahmini.json"));
const quickStore = createJsonStore(path.join(databaseRoot, "hizliYaz.json"));
const hangmanStore = createJsonStore(path.join(databaseRoot, "adamAsmaca.json"));
const wordListPath = path.join(databaseRoot, "kelimeler.txt");

const NUMBER_MIN = 1;
const NUMBER_MAX = 100;
const QUICK_ROUND_MS = 10_000;
const HANGMAN_MAX_WRONG = 6;
const GAME_BUTTON_PREFIX = "mini-game";
const FONT_FAMILY = '"Manrope", "Noto Sans", Arial, sans-serif';
const quickTimers = new Map();
const roundStartLocks = new Set();
const hangmanUpdateQueues = new Map();

const quickWords = Object.freeze(
  fs.readFileSync(wordListPath, "utf8")
    .split("\n")
    .map(normalizeWord)
    .filter(word => /^[a-zçğıöşüâîû]{4,12}$/iu.test(word))
);

const hangmanEntries = Object.freeze(hangmanWords.flatMap(group => (
  group.words.map(word => ({ category: group.category, word: normalizeWord(word) }))
)));

registerFonts();

function registerFonts() {
  try {
    const canvafyRoot = path.dirname(require.resolve("canvafy"));
    const fontRoot = path.join(canvafyRoot, "assets", "fonts", "Manrope");
    GlobalFonts.registerFromPath(path.join(fontRoot, "Manrope-Regular.ttf"), "Manrope");
    GlobalFonts.registerFromPath(path.join(fontRoot, "Manrope-Bold.ttf"), "Manrope");
  } catch {
  }
}

function normalizeWord(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFC");
}

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function randomNumber(previous = null) {
  let value;
  do {
    value = Math.floor(Math.random() * (NUMBER_MAX - NUMBER_MIN + 1)) + NUMBER_MIN;
  } while (value === previous);
  return value;
}

function randomQuickWord(previous = null) {
  if (quickWords.length === 0) throw new Error("Hızlı yaz için uygun kelime bulunamadı.");
  let word;
  do {
    word = quickWords[Math.floor(Math.random() * quickWords.length)];
  } while (quickWords.length > 1 && word === previous);
  return word;
}

function randomHangmanWord(previous = null) {
  let entry;
  do {
    entry = hangmanEntries[Math.floor(Math.random() * hangmanEntries.length)];
  } while (hangmanEntries.length > 1 && entry.word === previous);
  return entry;
}

function currentGameChannel(guildId, gameKey) {
  const settings = channelStore.get(guildId);
  return settings && typeof settings === "object" ? settings[gameKey] || null : null;
}

function buttonId(action, guildId, channelId) {
  return `${GAME_BUTTON_PREFIX}:${action}:${guildId}:${channelId}`;
}

function parseButtonId(customId) {
  const [prefix, action, guildId, channelId] = String(customId || "").split(":");
  if (prefix !== GAME_BUTTON_PREFIX || !/^\d{17,20}$/.test(guildId || "") || !/^\d{17,20}$/.test(channelId || "")) {
    return null;
  }
  return { action, guildId, channelId };
}

function fitFont(ctx, text, maxWidth, preferredSize, minSize = 30, weight = 800) {
  let size = preferredSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function renderQuickWordCard(word) {
  const width = 1200;
  const height = 540;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#050816");
  background.addColorStop(0.52, "#0b1230");
  background.addColorStop(1, "#18092a");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const cyanGlow = ctx.createRadialGradient(160, 90, 0, 160, 90, 430);
  cyanGlow.addColorStop(0, "rgba(38, 217, 255, 0.32)");
  cyanGlow.addColorStop(1, "rgba(38, 217, 255, 0)");
  ctx.fillStyle = cyanGlow;
  ctx.fillRect(0, 0, 590, 480);

  const violetGlow = ctx.createRadialGradient(1050, 420, 0, 1050, 420, 470);
  violetGlow.addColorStop(0, "rgba(196, 82, 255, 0.28)");
  violetGlow.addColorStop(1, "rgba(196, 82, 255, 0)");
  ctx.fillStyle = violetGlow;
  ctx.fillRect(590, 70, 610, 470);

  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 2;
  for (let y = 38; y < height; y += 54) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y - 170);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  ctx.roundRect(55, 40, width - 110, height - 80, 34);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.stroke();

  ctx.fillStyle = "#26d9ff";
  ctx.beginPath();
  ctx.roundRect(92, 76, 250, 52, 26);
  ctx.fill();
  ctx.fillStyle = "#06101c";
  ctx.font = `800 23px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.fillText("HIZLI YAZ", 217, 111);

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 34px ${FONT_FAMILY}`;
  ctx.textAlign = "left";
  ctx.fillText("KELİMEYİ İLK SEN YAZ", 92, 177);
  ctx.fillStyle = "#94a3bd";
  ctx.font = `500 21px ${FONT_FAMILY}`;
  ctx.fillText("Hızını göster, turu kap!", 92, 214);

  const cardGradient = ctx.createLinearGradient(92, 250, 955, 390);
  cardGradient.addColorStop(0, "rgba(255,255,255,0.98)");
  cardGradient.addColorStop(1, "rgba(222,237,255,0.92)");
  ctx.fillStyle = cardGradient;
  ctx.beginPath();
  ctx.roundRect(92, 244, 850, 158, 30);
  ctx.fill();
  ctx.shadowColor = "rgba(38,217,255,0.28)";
  ctx.shadowBlur = 28;
  ctx.strokeStyle = "rgba(38,217,255,0.72)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.shadowBlur = 0;

  const displayWord = word.toLocaleUpperCase("tr-TR");
  const wordSize = fitFont(ctx, displayWord, 760, 86, 42, 800);
  ctx.font = `800 ${wordSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = "#080d1d";
  ctx.textAlign = "center";
  ctx.fillText(displayWord, 517, 348);

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.roundRect(982, 76, 126, 326, 30);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.stroke();

  ctx.strokeStyle = "#ff6f91";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(1045, 163, 45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(1045, 163);
  ctx.lineTo(1045, 130);
  ctx.moveTo(1045, 163);
  ctx.lineTo(1071, 179);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 70px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.fillText("10", 1045, 287);
  ctx.fillStyle = "#aab5cc";
  ctx.font = `700 18px ${FONT_FAMILY}`;
  ctx.fillText("SANİYE", 1045, 323);

  ctx.fillStyle = "#dbe7ff";
  ctx.font = `600 20px ${FONT_FAMILY}`;
  ctx.textAlign = "left";
  ctx.fillText("İlk doğru yazan kazanır.", 92, 457);

  return canvas.toBuffer("image/png");
}

function drawHangman(ctx, wrongCount, lost) {
  const ox = 615;
  const oy = 100;
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#dce8ff";

  ctx.beginPath();
  ctx.moveTo(ox, oy + 430);
  ctx.lineTo(ox + 390, oy + 430);
  ctx.moveTo(ox + 70, oy + 430);
  ctx.lineTo(ox + 70, oy + 20);
  ctx.lineTo(ox + 320, oy + 20);
  ctx.lineTo(ox + 320, oy + 74);
  ctx.moveTo(ox + 70, oy + 95);
  ctx.lineTo(ox + 145, oy + 20);
  ctx.stroke();

  const bodyColor = lost ? "#ff5d73" : "#a78bfa";
  ctx.strokeStyle = bodyColor;
  if (wrongCount >= 1) {
    ctx.beginPath();
    ctx.arc(ox + 320, oy + 125, 50, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (wrongCount >= 2) {
    ctx.beginPath();
    ctx.moveTo(ox + 320, oy + 175);
    ctx.lineTo(ox + 320, oy + 310);
    ctx.stroke();
  }
  if (wrongCount >= 3) {
    ctx.beginPath();
    ctx.moveTo(ox + 320, oy + 210);
    ctx.lineTo(ox + 245, oy + 270);
    ctx.stroke();
  }
  if (wrongCount >= 4) {
    ctx.beginPath();
    ctx.moveTo(ox + 320, oy + 210);
    ctx.lineTo(ox + 395, oy + 270);
    ctx.stroke();
  }
  if (wrongCount >= 5) {
    ctx.beginPath();
    ctx.moveTo(ox + 320, oy + 310);
    ctx.lineTo(ox + 255, oy + 390);
    ctx.stroke();
  }
  if (wrongCount >= 6) {
    ctx.beginPath();
    ctx.moveTo(ox + 320, oy + 310);
    ctx.lineTo(ox + 385, oy + 390);
    ctx.stroke();
  }
}

function maskedHangmanWord(state) {
  const guessed = new Set(state.guessed || []);
  return [...state.word].map(letter => (
    /[a-zçğıöşüâîû]/iu.test(letter) && !guessed.has(letter)
      ? "_"
      : letter.toLocaleUpperCase("tr-TR")
  )).join(" ");
}

function renderHangmanCard(state) {
  const width = 1100;
  const height = 650;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const lost = state.status === "lost";
  const won = state.status === "won";
  const accent = lost ? "#ed4245" : won ? "#4be7b0" : "#a78bfa";
  const glowColor = lost
    ? "rgba(237, 66, 69, 0.27)"
    : won
      ? "rgba(75, 231, 176, 0.27)"
      : "rgba(167, 139, 250, 0.27)";

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#070a15");
  bg.addColorStop(0.55, "#10152b");
  bg.addColorStop(1, "#17102a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(920, 130, 0, 920, 130, 420);
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(510, 0, 590, 540);

  ctx.fillStyle = "rgba(255,255,255,0.055)";
  ctx.beginPath();
  ctx.roundRect(44, 42, width - 88, height - 84, 34);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(80, 76, 230, 48, 24);
  ctx.fill();
  ctx.fillStyle = "#080b17";
  ctx.font = `800 20px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.fillText(lost ? "TUR KAYBEDİLDİ" : won ? "KELİME BULUNDU" : "ADAM ASMACA", 195, 108);

  ctx.textAlign = "left";
  ctx.fillStyle = "#f8fbff";
  ctx.font = `800 35px ${FONT_FAMILY}`;
  ctx.fillText("Gizli Kelime", 80, 180);

  const masked = state.status === "active"
    ? maskedHangmanWord(state)
    : [...state.word.toLocaleUpperCase("tr-TR")].join(" ");
  const wordSize = fitFont(ctx, masked, 455, 54, 25, 800);
  ctx.font = `800 ${wordSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = accent;
  ctx.fillText(masked, 80, 252);

  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.beginPath();
  ctx.roundRect(80, 300, 410, 174, 24);
  ctx.fill();
  ctx.fillStyle = "#9ba8c2";
  ctx.font = `600 18px ${FONT_FAMILY}`;
  ctx.fillText("KATEGORİ", 110, 341);
  ctx.fillText("KALAN HAK", 110, 405);
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 24px ${FONT_FAMILY}`;
  ctx.fillText(state.category, 250, 341);
  ctx.fillText(`${Math.max(0, HANGMAN_MAX_WRONG - state.wrong.length)} / ${HANGMAN_MAX_WRONG}`, 250, 405);

  ctx.fillStyle = "#8290ab";
  ctx.font = `600 17px ${FONT_FAMILY}`;
  const wrongLetters = state.wrong.length
    ? state.wrong.map(letter => letter.toLocaleUpperCase("tr-TR")).join("  •  ")
    : "Henüz yok";
  ctx.fillText(`Yanlış harfler: ${wrongLetters}`, 80, 525);

  drawHangman(ctx, state.wrong.length, lost);
  return canvas.toBuffer("image/png");
}

function buildQuickPayload(state) {
  const fileName = `hizli-yaz-${state.guildId}-${state.round}.png`;
  const container = new ContainerBuilder()
    .setAccentColor(0x26d9ff)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems({
        media: { url: `attachment://${fileName}` },
      })
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Tur <t:${Math.floor(state.expiresAt / 1000)}:R> sona erer. Yeni kelime butonu tur bittikten sonra sonuç panelinde görünür.`
      )
    );

  return {
    files: [new AttachmentBuilder(renderQuickWordCard(state.word), { name: fileName })],
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function buildQuickResultPayload(title, description, color, state, allowedUsers = []) {
  const container = new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}\n${description}`))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(buttonId("quick", state.guildId, state.channelId))
          .setLabel("Yeni Kelime Ver")
          .setEmoji("⚡")
          .setStyle(ButtonStyle.Primary)
      )
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], users: allowedUsers },
  };
}

function buildHangmanPayload(state) {
  const fileName = `adam-asmaca-${state.guildId}-${state.round}.png`;
  const won = state.status === "won";
  const lost = state.status === "lost";
  const title = won ? "## 🎉 Kelime Bulundu!" : lost ? "## 💀 Tur Kaybedildi" : "## 🪢 Adam Asmaca";
  const detail = won
    ? `Kelime **${state.word.toLocaleUpperCase("tr-TR")}** idi. <@${state.lastPlayerId}> son harfi buldu.`
    : lost
      ? `Doğru kelime **${state.word.toLocaleUpperCase("tr-TR")}** idi.`
      : `**Kategori:** ${state.category}  •  **Kalan hak:** ${HANGMAN_MAX_WRONG - state.wrong.length}/${HANGMAN_MAX_WRONG}\n**Kelime:** \`${maskedHangmanWord(state)}\``;

  const container = new ContainerBuilder()
    .setAccentColor(lost ? 0xff5d73 : won ? 0x4be7b0 : 0x9b7bff)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${title}\n${detail}`))
    .addSeparatorComponents(separator())
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems({
        media: { url: `attachment://${fileName}` }
      })
    );

  if (state.status !== "active") {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(buttonId("hangman", state.guildId, state.channelId))
          .setLabel("Yeni Oyun Başlat")
          .setEmoji("🪢")
          .setStyle(ButtonStyle.Primary)
      )
    );
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      state.status === "active"
        ? "-# Bir harf yaz, cümle yazsan bile mesajındaki ilk harf tahmin olarak alınır."
        : "-# Yeni tur için yukarıdaki butonu kullan."
    )
  );

  return {
    files: [new AttachmentBuilder(renderHangmanCard(state), { name: fileName })],
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function simpleNotice(title, description, color = 0x5865f2, allowedUsers = []) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(color)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}\n${description}`)),
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], users: allowedUsers },
  };
}

function createNumberGuessState(current, channelId) {
  const previous = current && typeof current === "object" ? current : {};
  return {
    ...previous,
    target: randomNumber(previous.target),
    attempts: 0,
    round: (Number(previous.round) || 0) + 1,
    channelId,
    startedAt: Date.now(),
  };
}

function initializeNumberGuess(guildId, channelId) {
  return numberStore.update(data => {
    const state = createNumberGuessState(data[guildId], channelId);
    data[guildId] = state;
    return state;
  });
}

async function startQuickRound(channel, guildId) {
  const previous = quickStore.get(guildId);
  const state = {
    ...previous,
    guildId,
    channelId: channel.id,
    word: randomQuickWord(previous?.word),
    round: (Number(previous?.round) || 0) + 1,
    startedAt: Date.now(),
    expiresAt: Date.now() + QUICK_ROUND_MS,
    active: true,
    winnerId: null,
    messageId: null,
  };
  quickStore.set(guildId, state);

  let gameMessage;
  try {
    gameMessage = await channel.send(buildQuickPayload(state));
  } catch (error) {
    quickStore.update(data => {
      if (data[guildId]?.round === state.round) {
        data[guildId].active = false;
        data[guildId].failedAt = Date.now();
      }
    });
    throw error;
  }
  quickStore.update(data => {
    if (data[guildId]?.round === state.round) data[guildId].messageId = gameMessage.id;
  });
  scheduleQuickTimeout(channel, state);
  return state;
}

function scheduleQuickTimeout(channel, state) {
  clearTimeout(quickTimers.get(state.guildId));
  const timer = setTimeout(async () => {
    try {
      const ended = quickStore.update(data => {
        const current = data[state.guildId];
        if (!current || current.round !== state.round || !current.active) return null;
        current.active = false;
        current.endedAt = Date.now();
        return { ...current };
      });
      quickTimers.delete(state.guildId);
      if (!ended) return;
      if (currentGameChannel(state.guildId, "hizliYaz") !== state.channelId) return;

      await channel.send(buildQuickResultPayload(
        `${emojiler.donensaat} Süre Doldu`,
        `Kimse **${ended.word.toLocaleUpperCase("tr-TR")}** kelimesini 10 saniye içinde yazamadı.`,
        0xf0b232,
        ended
      ));
    } catch (error) {
      quickTimers.delete(state.guildId);
      console.error("🔴 [HIZLI YAZ - SÜRE]", error);
    }
  }, Math.max(0, state.expiresAt - Date.now()));
  timer.unref?.();
  quickTimers.set(state.guildId, timer);
}

async function startHangmanRound(channel, guildId) {
  const previous = hangmanStore.get(guildId);
  const selected = randomHangmanWord(previous?.word);
  const state = {
    ...previous,
    guildId,
    channelId: channel.id,
    word: selected.word,
    category: selected.category,
    guessed: [],
    wrong: [],
    status: "active",
    round: (Number(previous?.round) || 0) + 1,
    startedAt: Date.now(),
    lastPlayerId: null,
    messageId: null,
  };
  hangmanStore.set(guildId, state);

  const gameMessage = await channel.send(buildHangmanPayload(state));
  hangmanStore.update(data => {
    if (data[guildId]?.round === state.round) data[guildId].messageId = gameMessage.id;
  });
  return state;
}

async function setupNewGame(gameKey, guildId, channel) {
  const stateStore = { sayiTahmini: numberStore, hizliYaz: quickStore, adamAsmaca: hangmanStore }[gameKey];
  if (!stateStore) throw new Error(`Bilinmeyen yeni oyun: ${gameKey}`);
  const previous = stateStore.get(guildId);
  try {
  if (gameKey === "sayiTahmini") {
    initializeNumberGuess(guildId, channel.id);
    await channel.send(buildGameSetupPayload("sayiTahmini"));
    return "1 ile 100 arasında gizli sayı tutuldu.";
  }
  if (gameKey === "hizliYaz") {
    await startQuickRound(channel, guildId);
    return "İlk 10 saniyelik hızlı yaz turu başlatıldı.";
  }
  if (gameKey === "adamAsmaca") {
    await startHangmanRound(channel, guildId);
    return "İlk adam asmaca kelimesi hazırlandı.";
  }
  throw new Error(`Bilinmeyen yeni oyun: ${gameKey}`);
  } catch (error) {
    stateStore.update(data => { if (previous) data[guildId] = previous; else delete data[guildId]; });
    throw error;
  }
}

async function handleNumberGuess(message) {
  const raw = message.content.trim();
  if (!/^\d{1,3}$/.test(raw)) {
    await message.react(emojiler.getReactionEmoji("carpi", "❌")).catch(() => null);
    return;
  }

  const guess = Number(raw);
  if (guess < NUMBER_MIN || guess > NUMBER_MAX) {
    await message.react(emojiler.getReactionEmoji("carpi", "❌")).catch(() => null);
    return;
  }

  const result = numberStore.update(data => {
    let current = data[message.guildId];
    if (!current || !Number.isInteger(current.target)) {
      current = createNumberGuessState(current, message.channelId);
      data[message.guildId] = current;
    }
    delete current.scores;
    current.attempts = (Number(current.attempts) || 0) + 1;

    if (guess !== current.target) return { won: false };

    const pickedNumber = current.target;
    const nextTarget = randomNumber(pickedNumber);
    current.target = nextTarget;
    current.attempts = 0;
    current.round = (Number(current.round) || 0) + 1;
    current.startedAt = Date.now();

    return {
      won: true,
      pickedNumber,
      nextTarget,
    };
  });

  if (!result.won) {
    await message.react(emojiler.getReactionEmoji("carpi", "❌")).catch(() => null);
    return;
  }

  await message.react(emojiler.getReactionEmoji("tik", "✅")).catch(() => null);
  await message.channel.send(simpleNotice(
    "🎉 Tebrikler!",
    `<@${message.author.id}>, tuttuğum sayı **${result.pickedNumber}** idi.\n\nYeni bir tur başladı: 1 ile 100 arasında başka bir sayı tuttum.`,
    0x4be7b0,
    [message.author.id]
  ));
}

async function handleQuickGuess(message) {
  const state = quickStore.get(message.guildId);
  if (!state?.active) return;
  if (Date.now() > Number(state.expiresAt)) {
    quickStore.update(data => {
      if (data[message.guildId]?.round === state.round) data[message.guildId].active = false;
    });
    return;
  }

  if (normalizeWord(message.content) !== state.word) {
    await message.react(emojiler.getReactionEmoji("carpi", "❌")).catch(() => null);
    return;
  }

  const won = quickStore.update(data => {
    const current = data[message.guildId];
    if (!current || !current.active || current.round !== state.round || Date.now() > current.expiresAt) return null;
    current.active = false;
    current.winnerId = message.author.id;
    current.endedAt = Date.now();
    current.elapsedMs = current.endedAt - current.startedAt;
    return { ...current };
  });
  if (!won) return;

  clearTimeout(quickTimers.get(message.guildId));
  quickTimers.delete(message.guildId);
  await message.react(emojiler.getReactionEmoji("tik", "✅")).catch(() => null);
  await message.channel.send(buildQuickResultPayload(
    "⚡ Işık Hızında!",
    `<@${message.author.id}> **${won.word.toLocaleUpperCase("tr-TR")}** kelimesini **${(won.elapsedMs / 1000).toFixed(2)} saniyede** doğru yazdı`,
    0x26d9ff,
    won,
    [message.author.id]
  ));
}

function extractFirstLetter(content) {
  const normalized = normalizeWord(content);
  return [...normalized].find(character => /^[a-zçğıöşüâîû]$/iu.test(character)) || null;
}

function allHangmanLettersFound(state) {
  const required = new Set([...state.word].filter(letter => /[a-zçğıöşüâîû]/iu.test(letter)));
  return [...required].every(letter => state.guessed.includes(letter));
}

function enqueueHangmanUpdate(guildId, updater) {
  const previous = hangmanUpdateQueues.get(guildId) || Promise.resolve();
  const queued = previous.catch(() => null).then(updater);
  hangmanUpdateQueues.set(guildId, queued);

  return queued.finally(() => {
    if (hangmanUpdateQueues.get(guildId) === queued) hangmanUpdateQueues.delete(guildId);
  });
}

function updateHangmanMessage(channel, guildId) {
  return enqueueHangmanUpdate(guildId, async () => {
    const state = hangmanStore.get(guildId);
    if (!state) return;
    if (state.channelId !== channel.id || currentGameChannel(guildId, "adamAsmaca") !== channel.id) return;

    let previousMessage = null;
    if (state.messageId) {
      previousMessage = await channel.messages.fetch(state.messageId).catch(() => null);
    }
    if (previousMessage) await previousMessage.delete().catch(() => null);

    const replacement = await channel.send(buildHangmanPayload(state));
    hangmanStore.update(data => {
      if (data[guildId]?.round === state.round) data[guildId].messageId = replacement.id;
    });
  });
}

async function handleHangmanGuess(message) {
  const letter = extractFirstLetter(message.content);
  if (!letter) return;

  const result = hangmanStore.update(data => {
    const state = data[message.guildId];
    if (!state || state.status !== "active") return null;
    if (state.guessed.includes(letter) || state.wrong.includes(letter)) {
      return { repeated: true, state: { ...state } };
    }

    state.lastPlayerId = message.author.id;
    const correct = state.word.includes(letter);
    if (correct) {
      state.guessed.push(letter);
      if (allHangmanLettersFound(state)) state.status = "won";
    } else {
      state.wrong.push(letter);
      if (state.wrong.length >= HANGMAN_MAX_WRONG) state.status = "lost";
    }
    return { repeated: false, correct, state: { ...state } };
  });
  if (!result) return;

  if (result.repeated) {
    await message.react("🔁").catch(() => null);
    await updateHangmanMessage(message.channel, message.guildId);
    return;
  }

  await message.react(
    result.correct
      ? emojiler.getReactionEmoji("tik", "✅")
      : emojiler.getReactionEmoji("carpi", "❌")
  ).catch(() => null);
  await updateHangmanMessage(message.channel, message.guildId);
}

async function handleGameMessage(message) {
  if (!message.guild || message.author.bot) return false;
  const settings = channelStore.get(message.guildId);
  if (!settings || typeof settings !== "object") return false;

  if (settings.sayiTahmini === message.channelId) {
    await handleNumberGuess(message);
    return true;
  }
  if (settings.hizliYaz === message.channelId) {
    await handleQuickGuess(message);
    return true;
  }
  if (settings.adamAsmaca === message.channelId) {
    await handleHangmanGuess(message);
    return true;
  }
  return false;
}

function ephemeralNotice(content) {
  return { content, flags: MessageFlags.Ephemeral };
}

async function handleGameInteraction(interaction) {
  if (!interaction.isButton()) return false;
  const parsed = parseButtonId(interaction.customId);
  if (!parsed) return false;

  if (interaction.guildId !== parsed.guildId || interaction.channelId !== parsed.channelId) {
    await interaction.reply(ephemeralNotice(`${emojiler.uyari || "⚠️"} Bu oyun butonu artık geçerli değil.`)).catch(() => null);
    return true;
  }

  const expectedGame = parsed.action === "quick" ? "hizliYaz" : parsed.action === "hangman" ? "adamAsmaca" : null;
  if (!expectedGame || currentGameChannel(parsed.guildId, expectedGame) !== parsed.channelId) {
    await interaction.reply(ephemeralNotice(`${emojiler.uyari || "⚠️"} Bu kanal artık ilgili oyun için ayarlı değil.`)).catch(() => null);
    return true;
  }

  if (parsed.action === "quick") {
    const state = quickStore.get(parsed.guildId);
    const remainingMs = Number(state?.expiresAt) - Date.now();
    if (state?.active && remainingMs > 0) {
      await interaction.reply(ephemeralNotice(
        `${emojiler.uyari || "⚠️"} Aktif turun bitmesine **${Math.max(1, Math.ceil(remainingMs / 1000))} saniye** var.`
      ));
      return true;
    }

    const lockKey = `quick:${parsed.guildId}`;
    if (roundStartLocks.has(lockKey)) {
      await interaction.reply(ephemeralNotice(`${emojiler.uyari || "⚠️"} Yeni tur zaten hazırlanıyor.`));
      return true;
    }

    roundStartLocks.add(lockKey);
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const latest = quickStore.get(parsed.guildId);
      if (latest?.active && Number(latest.expiresAt) > Date.now()) {
        await interaction.editReply(`${emojiler.uyari || "⚠️"} Başka bir oyuncu yeni turu senden hemen önce başlattı.`);
        return true;
      }
      const round = await startQuickRound(interaction.channel, parsed.guildId);
      await interaction.editReply(`${emojiler.tik || "✅"} Yeni kelime gönderildi; **10 saniyelik** tur başladı. (Tur ${round.round})`);
    } finally {
      roundStartLocks.delete(lockKey);
    }
    return true;
  }

  const state = hangmanStore.get(parsed.guildId);
  if (state?.status === "active") {
    await interaction.reply(ephemeralNotice(`${emojiler.uyari || "⚠️"} Devam eden adam asmaca turu henüz bitmedi.`));
    return true;
  }

  const lockKey = `hangman:${parsed.guildId}`;
  if (roundStartLocks.has(lockKey)) {
    await interaction.reply(ephemeralNotice(`${emojiler.uyari || "⚠️"} Yeni tur zaten hazırlanıyor.`));
    return true;
  }

  roundStartLocks.add(lockKey);
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const latest = hangmanStore.get(parsed.guildId);
    if (latest?.status === "active") {
      await interaction.editReply(`${emojiler.uyari || "⚠️"} Başka bir oyuncu yeni turu senden hemen önce başlattı.`);
      return true;
    }
    await startHangmanRound(interaction.channel, parsed.guildId);
    await interaction.editReply(`${emojiler.tik || "✅"} Yeni adam asmaca turu başlatıldı.`);
  } finally {
    roundStartLocks.delete(lockKey);
  }
  return true;
}

module.exports = {
  buildHangmanPayload,
  buildQuickPayload,
  buildQuickResultPayload,
  extractFirstLetter,
  handleGameInteraction,
  handleGameMessage,
  initializeNumberGuess,
  renderHangmanCard,
  renderQuickWordCard,
  setupNewGame,
  startHangmanRound,
  startQuickRound,
};