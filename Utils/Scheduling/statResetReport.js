const { ContainerBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } = require("discord.js");

const PERIODS = Object.freeze({
  daily: {
    suffix: "1d",
    title: "🌇 Günlük Veriler Sıfırlandı",
    label: "Günlük",
    schedule: "Her gün 00.00 · Türkiye saati (Europe/Istanbul)",
    color: 0x57f287,
  },
  weekly: {
    suffix: "7d",
    title: "📅 Haftalık Veriler Sıfırlandı",
    label: "Haftalık",
    schedule: "Her pazar 00.00 · Türkiye saati (Europe/Istanbul)",
    color: 0x5865f2,
  },
});

function getPeriod(period) {
  if (!Object.hasOwn(PERIODS, period)) throw new RangeError("Geçersiz sıfırlama dönemi.");
  return PERIODS[period];
}

function normalizeCount(value) {
  const count = typeof value === "number" || typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function collectPeriodStats(data, period, reset) {
  const { suffix } = getPeriod(period);
  const messagePrefix = `msg_${suffix}_`;
  const voicePrefix = `voice_${suffix}_`;
  const users = new Set();
  const summary = { messageRecords: 0, voiceRecords: 0, totalMessages: 0, totalVoiceSeconds: 0, affectedUsers: 0 };

  for (const key of Object.keys(data)) {
    if (key.startsWith(messagePrefix)) {
      summary.messageRecords++;
      summary.totalMessages += normalizeCount(data[key]);
      users.add(key.slice(messagePrefix.length));
    } else if (key.startsWith(voicePrefix)) {
      summary.voiceRecords++;
      summary.totalVoiceSeconds += normalizeCount(data[key]);
      users.add(key.slice(voicePrefix.length));
    } else {
      continue;
    }
    if (reset) delete data[key];
  }

  summary.affectedUsers = users.size;
  return summary;
}

function summarizePeriodStats(data, period) {
  return collectPeriodStats(data, period, false);
}

function resetPeriodStats(data, period) {
  return collectPeriodStats(data, period, true);
}

function formatDuration(seconds) {
  let remaining = normalizeCount(seconds);
  const parts = [];
  for (const [size, label] of [[86400, "gün"], [3600, "saat"], [60, "dakika"], [1, "saniye"]]) {
    const amount = Math.floor(remaining / size);
    if (amount) parts.push(`${amount.toLocaleString("tr-TR")} ${label}`);
    remaining %= size;
  }
  return parts.join(" ") || "0 saniye";
}

function buildStatResetPayload({ period, summary, preview = false }) {
  const config = getPeriod(period);
  const recordCount = summary.messageRecords + summary.voiceRecords;
  const number = value => value.toLocaleString("tr-TR");
  const separator = () => new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true);
  const container = new ContainerBuilder()
    .setAccentColor(config.color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      preview ? `## ${period === 'daily' ? '🌇' : '📅'} ${config.label} Veri Sıfırlama Özeti` : `## ${config.title}`,
      preview
        ? (recordCount ? `${config.label} mesaj ve ses istatistiklerinin güncel özeti.` : "Bu döneme ait kayıtlı mesaj veya ses verisi bulunmuyor.")
        : recordCount
        ? `${config.label} mesaj ve ses istatistikleri yeni dönem için temizlendi.`
        : "Kontrol tamamlandı, bu döneme ait sıfırlanacak mesaj veya ses kaydı bulunamadı.",
    ].join("\n")))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      preview ? "### 📊 Mesaj ve Ses Verileri" : "### 🧹 Sıfırlanan Veriler",
      `**💬 ${config.label} mesajlar:** ${number(summary.messageRecords)} kayıt > ${number(summary.totalMessages)} mesaj`,
      `**🔊 ${config.label} ses süreleri:** ${number(summary.voiceRecords)} kayıt > ${formatDuration(summary.totalVoiceSeconds)}`,
    ].join("\n")))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      preview ? "### 📋 Kayıt Özeti" : "### 📋 İşlem Özeti",
      `**${preview ? 'Toplam kayıt' : 'Silinen kayıt'}:** ${number(recordCount)}`,
      `**${preview ? 'Kayıtlı kullanıcı' : 'Etkilenen kullanıcı'}:** ${number(summary.affectedUsers)}`,
      `**Sıfırlama kapsamı:** \`/stat\` komutundaki ${config.label.toLocaleLowerCase("tr-TR")} mesaj sayısı ve ses süresi alanları.`,
    ].join("\n")))

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

module.exports = { summarizePeriodStats, resetPeriodStats, buildStatResetPayload };