const { SlashCommandBuilder } = require("discord.js");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const CANVAS_WIDTH = 1240;
const CANVAS_HEIGHT = 520;
const SPOTIFY_GREEN = "#1ed760";
const FONT_FAMILY = '"Manrope", "Noto Sans", sans-serif';

registerFonts();

module.exports = {
    data: new SlashCommandBuilder()
        .setName("spotify")
        .setDescription("Kişinin dinlediği şarkıyı gösterir.")
        .addUserOption(option =>
            option.setName("kişi").setDescription("Kişi seç").setRequired(false)
        ),

    async execute(interaction) {
        const member = interaction.options.getMember("kişi") || interaction.member;
        const activity = member.presence?.activities.find(
            item => item.name === "Spotify" && item.type === 2
        );

        if (!activity) {
            return interaction.reply({
                content: `${emojiler.uyari} **Bu kişi şu anda şarkı dinlemiyor.**`,
                flags: 64
            });
        }

        await interaction.deferReply();

        const startTime = Number(activity.timestamps?.start);
        const endTime = Number(activity.timestamps?.end);
        const duration = Math.max(0, (endTime - startTime) / 1000);
        const elapsed = Math.max(0, (Date.now() - startTime) / 1000);
        const spotifyURL = `https://open.spotify.com/track/${activity.syncId}`;
        const image = await renderSpotifyCard({
            trackName: activity.details || "Bilinmeyen şarkı",
            artistName: activity.state || "Bilinmeyen sanatçı",
            albumName: activity.assets?.largeText || "Albüm bilgisi yok",
            albumImageURL: activity.assets.largeImageURL(),
            duration,
            elapsed
        });

        await interaction.editReply({
            files: [{ attachment: image, name: "spotify-now-playing.png" }],
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    label: "Spotify'da dinle",
                    style: 5,
                    url: spotifyURL,
                    emoji: {
                        id: "1121506073749237911",
                        name: "muzikdiski_arviis",
                        animated: true
                    }
                }]
            }]
        });
    },

    renderSpotifyCard
};

async function renderSpotifyCard({
    trackName,
    artistName,
    albumName,
    albumImageURL,
    duration,
    elapsed
}) {
    const albumImage = await loadImage(albumImageURL);
    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext("2d");

    drawBackground(ctx, albumImage);
    drawNowPlayingLabel(ctx);
    drawTrackDetails(ctx, trackName, artistName, albumName);
    drawProgress(ctx, elapsed, duration);
    drawAlbumCover(ctx, albumImage);

    return canvas.toBuffer("image/png");
}

function registerFonts() {
    try {
        const canvafyRoot = path.dirname(require.resolve("canvafy"));
        GlobalFonts.registerFromPath(
            path.join(canvafyRoot, "assets/fonts/Manrope/Manrope-Regular.ttf"),
            "Manrope"
        );
        GlobalFonts.registerFromPath(
            path.join(canvafyRoot, "assets/fonts/Manrope/Manrope-Bold.ttf"),
            "Manrope"
        );
    } catch {
    }
}

function drawBackground(ctx, albumImage) {
    ctx.save();
    roundedPath(ctx, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 34);
    ctx.clip();

    ctx.fillStyle = "#080b0d";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.filter = "blur(42px) saturate(1.25)";
    drawImageCover(ctx, albumImage, 680, -80, 660, 680);
    ctx.restore();

    const shade = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, 0);
    shade.addColorStop(0, "rgba(5, 8, 10, 0.98)");
    shade.addColorStop(0.58, "rgba(5, 8, 10, 0.9)");
    shade.addColorStop(1, "rgba(5, 8, 10, 0.52)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const glow = ctx.createRadialGradient(980, 250, 20, 980, 250, 460);
    glow.addColorStop(0, "rgba(30, 215, 96, 0.14)");
    glow.addColorStop(1, "rgba(30, 215, 96, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(480, -180, 900, 900);
    ctx.restore();

    ctx.save();
    roundedPath(ctx, 1, 1, CANVAS_WIDTH - 2, CANVAS_HEIGHT - 2, 33);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
}

function drawNowPlayingLabel(ctx) {
    const iconX = 73;
    const iconY = 72;

    ctx.fillStyle = SPOTIFY_GREEN;
    ctx.beginPath();
    ctx.arc(iconX, iconY, 19, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#07140c";
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.lineWidth = 3.2;
    ctx.moveTo(iconX - 12, iconY - 6);
    ctx.bezierCurveTo(
        iconX - 4, iconY - 10,
        iconX + 7, iconY - 9,
        iconX + 13, iconY - 4
    );
    ctx.stroke();

    ctx.beginPath();
    ctx.lineWidth = 2.9;
    ctx.moveTo(iconX - 10, iconY + 1);
    ctx.bezierCurveTo(
        iconX - 3, iconY - 2,
        iconX + 6, iconY - 1,
        iconX + 11, iconY + 3
    );
    ctx.stroke();

    ctx.beginPath();
    ctx.lineWidth = 2.6;
    ctx.moveTo(iconX - 8, iconY + 7);
    ctx.bezierCurveTo(
        iconX - 2, iconY + 5,
        iconX + 4, iconY + 6,
        iconX + 9, iconY + 8
    );
    ctx.stroke();

    setFont(ctx, 17, 700);
    ctx.fillStyle = "#f4f7f5";
    ctx.fillText("SPOTIFY", 108, 78);

    ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
    ctx.beginPath();
    ctx.arc(198, 72, 2.5, 0, Math.PI * 2);
    ctx.fill();

    setFont(ctx, 15, 700);
    ctx.fillStyle = "#8b9891";
    ctx.fillText("ŞİMDİ DİNLİYOR", 214, 78);
}

function drawTrackDetails(ctx, trackName, artistName, albumName) {
    setFont(ctx, 50, 700);
    ctx.fillStyle = "#ffffff";
    const titleLines = wrapText(ctx, String(trackName), 650, 2);
    titleLines.forEach((line, index) => ctx.fillText(line, 54, 164 + index * 60));

    const detailStartY = titleLines.length === 1 ? 226 : 278;
    setFont(ctx, 27, 400);
    ctx.fillStyle = "#d5dcd8";
    ctx.fillText(ellipsizeText(ctx, String(artistName), 635), 56, detailStartY);

    setFont(ctx, 17, 400);
    ctx.fillStyle = "#7f8b85";
    const albumText = albumName === "Albüm bilgisi yok"
        ? albumName
        : `${albumName} albümünden`;
    ctx.fillText(ellipsizeText(ctx, albumText, 635), 57, detailStartY + 40);
}

function drawProgress(ctx, elapsed, duration) {
    const barX = 56;
    const barY = 409;
    const barWidth = 635;
    const barHeight = 7;
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    const safeElapsed = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
    const progress = safeDuration > 0 ? Math.min(safeElapsed / safeDuration, 1) : 0;

    roundedRect(ctx, barX, barY, barWidth, barHeight, barHeight / 2, "rgba(255, 255, 255, 0.16)");
    if (progress > 0) {
        roundedRect(ctx, barX, barY, Math.max(barHeight, barWidth * progress), barHeight, barHeight / 2, SPOTIFY_GREEN);
    }

    const knobX = barX + barWidth * progress;
    ctx.save();
    ctx.shadowColor = "rgba(30, 215, 96, 0.5)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(knobX, barY + barHeight / 2, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    setFont(ctx, 16, 700);
    ctx.fillStyle = "#9aa49f";
    ctx.fillText(formatTime(Math.min(safeElapsed, safeDuration || safeElapsed)), barX, 452);

    const durationText = formatTime(safeDuration);
    const durationWidth = ctx.measureText(durationText).width;
    ctx.fillText(durationText, barX + barWidth - durationWidth, 452);
}

function drawAlbumCover(ctx, albumImage) {
    const x = 780;
    const y = 40;
    const size = 440;
    const radius = 22;

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = 45;
    ctx.shadowOffsetY = 18;
    roundedRect(ctx, x, y, size, size, radius, "#101513");
    ctx.restore();

    ctx.save();
    roundedPath(ctx, x, y, size, size, radius);
    ctx.clip();
    drawImageCover(ctx, albumImage, x, y, size, size);

    const sheen = ctx.createLinearGradient(x, y, x + size, y + size);
    sheen.addColorStop(0, "rgba(255, 255, 255, 0.1)");
    sheen.addColorStop(0.42, "rgba(255, 255, 255, 0)");
    sheen.addColorStop(1, "rgba(0, 0, 0, 0.12)");
    ctx.fillStyle = sheen;
    ctx.fillRect(x, y, size, size);
    ctx.restore();

    ctx.save();
    roundedPath(ctx, x + 0.5, y + 0.5, size - 1, size - 1, radius - 0.5);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.13)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
}

function setFont(ctx, size, weight = 400) {
    ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
}

function formatTime(seconds) {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const remainder = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function wrapText(ctx, text, maxWidth, maxLines) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [""];

    const lines = [];
    let line = "";

    for (let index = 0; index < words.length; index += 1) {
        const candidate = line ? `${line} ${words[index]}` : words[index];
        if (ctx.measureText(candidate).width <= maxWidth || !line) {
            line = candidate;
            continue;
        }

        lines.push(line);
        line = words[index];
        if (lines.length === maxLines - 1) {
            const rest = [line, ...words.slice(index + 1)].join(" ");
            lines.push(ellipsizeText(ctx, rest, maxWidth));
            return lines;
        }
    }

    lines.push(ellipsizeText(ctx, line, maxWidth));
    return lines.slice(0, maxLines);
}

function ellipsizeText(ctx, value, maxWidth) {
    const text = String(value);
    if (ctx.measureText(text).width <= maxWidth) return text;

    const ellipsis = "…";
    let low = 0;
    let high = text.length;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (ctx.measureText(text.slice(0, middle) + ellipsis).width <= maxWidth) {
            low = middle;
        } else {
            high = middle - 1;
        }
    }
    return text.slice(0, low).trimEnd() + ellipsis;
}

function drawImageCover(ctx, image, x, y, width, height) {
    const scale = Math.max(width / image.width, height / image.height);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    const sourceX = (image.width - sourceWidth) / 2;
    const sourceY = (image.height - sourceHeight) / 2;
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function roundedRect(ctx, x, y, width, height, radius, color) {
    roundedPath(ctx, x, y, width, height, radius);
    ctx.fillStyle = color;
    ctx.fill();
}

function roundedPath(ctx, x, y, width, height, radius) {
    const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, safeRadius);
    ctx.closePath();
}