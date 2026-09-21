const { AuditLogEvent, ContainerBuilder, Events, MessageFlags, PermissionsBitField, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder, escapeMarkdown } = require("discord.js");
const path = require("path");
const { readJson } = require("../../Utils/Core/fileDB");

const DB_PATH = path.join(process.cwd(), "Database", "Güvenlik ve Moderasyon", "auditLog.json");
const MAX_CHANGE_LINES = 8;
const MAX_CHANGE_VALUE_LENGTH = 240;
const MAX_CHANGE_BLOCK_LENGTH = 2_800;

const ACTION_LABELS = Object.freeze({
  GuildUpdate: "Sunucu ayarları güncellendi",
  ChannelCreate: "Kanal oluşturuldu",
  ChannelUpdate: "Kanal güncellendi",
  ChannelDelete: "Kanal silindi",
  ChannelOverwriteCreate: "Kanal izni oluşturuldu",
  ChannelOverwriteUpdate: "Kanal izni güncellendi",
  ChannelOverwriteDelete: "Kanal izni silindi",
  MemberKick: "Üye sunucudan atıldı",
  MemberPrune: "İnaktif üyeler temizlendi",
  MemberBanAdd: "Üye yasaklandı",
  MemberBanRemove: "Üyenin yasağı kaldırıldı",
  MemberUpdate: "Üye bilgileri güncellendi",
  MemberRoleUpdate: "Üye rolleri güncellendi",
  MemberMove: "Üye ses kanalında taşındı",
  MemberDisconnect: "Üyenin ses bağlantısı kesildi",
  BotAdd: "Bot sunucuya eklendi",
  RoleCreate: "Rol oluşturuldu",
  RoleUpdate: "Rol güncellendi",
  RoleDelete: "Rol silindi",
  InviteCreate: "Davet oluşturuldu",
  InviteUpdate: "Davet güncellendi",
  InviteDelete: "Davet silindi",
  WebhookCreate: "Webhook oluşturuldu",
  WebhookUpdate: "Webhook güncellendi",
  WebhookDelete: "Webhook silindi",
  EmojiCreate: "Emoji oluşturuldu",
  EmojiUpdate: "Emoji güncellendi",
  EmojiDelete: "Emoji silindi",
  MessageDelete: "Mesaj silindi",
  MessageBulkDelete: "Mesajlar toplu silindi",
  MessagePin: "Mesaj sabitlendi",
  MessageUnpin: "Mesajın sabiti kaldırıldı",
  IntegrationCreate: "Entegrasyon oluşturuldu",
  IntegrationUpdate: "Entegrasyon güncellendi",
  IntegrationDelete: "Entegrasyon silindi",
  StageInstanceCreate: "Sahne oturumu başlatıldı",
  StageInstanceUpdate: "Sahne oturumu güncellendi",
  StageInstanceDelete: "Sahne oturumu sonlandırıldı",
  StickerCreate: "Çıkartma oluşturuldu",
  StickerUpdate: "Çıkartma güncellendi",
  StickerDelete: "Çıkartma silindi",
  GuildScheduledEventCreate: "Planlanmış etkinlik oluşturuldu",
  GuildScheduledEventUpdate: "Planlanmış etkinlik güncellendi",
  GuildScheduledEventDelete: "Planlanmış etkinlik silindi",
  ThreadCreate: "Alt kanal oluşturuldu",
  ThreadUpdate: "Alt kanal güncellendi",
  ThreadDelete: "Alt kanal silindi",
  ApplicationCommandPermissionUpdate: "Uygulama komutu izinleri güncellendi",
  SoundboardSoundCreate: "Soundboard sesi oluşturuldu",
  SoundboardSoundUpdate: "Soundboard sesi güncellendi",
  SoundboardSoundDelete: "Soundboard sesi silindi",
  AutoModerationRuleCreate: "Otomatik moderasyon kuralı oluşturuldu",
  AutoModerationRuleUpdate: "Otomatik moderasyon kuralı güncellendi",
  AutoModerationRuleDelete: "Otomatik moderasyon kuralı silindi",
  AutoModerationBlockMessage: "Otomatik moderasyon mesajı engelledi",
  AutoModerationFlagToChannel: "Otomatik moderasyon içerik işaretledi",
  AutoModerationUserCommunicationDisabled: "Otomatik moderasyon üyeyi susturdu",
  AutoModerationQuarantineUser: "Otomatik moderasyon üyeyi karantinaya aldı",
  CreatorMonetizationRequestCreated: "İçerik üretici para kazanma talebi oluşturuldu",
  CreatorMonetizationTermsAccepted: "İçerik üretici para kazanma koşulları kabul edildi",
  OnboardingPromptCreate: "Karşılama sorusu oluşturuldu",
  OnboardingPromptUpdate: "Karşılama sorusu güncellendi",
  OnboardingPromptDelete: "Karşılama sorusu silindi",
  OnboardingCreate: "Karşılama sistemi oluşturuldu",
  OnboardingUpdate: "Karşılama sistemi güncellendi",
  HomeSettingsCreate: "Sunucu ana sayfası oluşturuldu",
  HomeSettingsUpdate: "Sunucu ana sayfası güncellendi",
  VoiceChannelStatusCreate: "Ses kanalı durumu oluşturuldu",
  VoiceChannelStatusDelete: "Ses kanalı durumu silindi",
});

const CHANGE_LABELS = Object.freeze({
  $add: "Eklenenler",
  $remove: "Kaldırılanlar",
  name: "Ad",
  description: "Açıklama",
  topic: "Kanal konusu",
  type: "Tür",
  nick: "Takma ad",
  roles: "Roller",
  permissions: "İzinler",
  permission_overwrites: "Kanal izinleri",
  allow: "Verilen izinler",
  deny: "Reddedilen izinler",
  color: "Renk",
  colors: "Rol renkleri",
  hoist: "Ayrı gösterim",
  mentionable: "Bahsedilebilir",
  position: "Konum",
  bitrate: "Bit hızı",
  user_limit: "Kullanıcı sınırı",
  rate_limit_per_user: "Yavaş mod",
  nsfw: "NSFW",
  rtc_region: "Ses bölgesi",
  video_quality_mode: "Video kalitesi",
  default_auto_archive_duration: "Varsayılan arşiv süresi",
  auto_archive_duration: "Arşiv süresi",
  archived: "Arşiv durumu",
  locked: "Kilit durumu",
  invitable: "Davet edilebilir",
  channel_id: "Kanal",
  afk_channel_id: "AFK kanalı",
  afk_timeout: "AFK zaman aşımı",
  system_channel_id: "Sistem kanalı",
  rules_channel_id: "Kurallar kanalı",
  public_updates_channel_id: "Topluluk güncellemeleri kanalı",
  owner_id: "Sunucu sahibi",
  verification_level: "Doğrulama seviyesi",
  explicit_content_filter: "İçerik filtresi",
  default_message_notifications: "Varsayılan bildirimler",
  preferred_locale: "Tercih edilen dil",
  premium_progress_bar_enabled: "Takviye ilerleme çubuğu",
  vanity_url_code: "Özel davet bağlantısı",
  widget_enabled: "Sunucu bileşeni",
  widget_channel_id: "Bileşen kanalı",
  icon_hash: "Simge",
  avatar_hash: "Avatar",
  banner_hash: "Afiş",
  splash_hash: "Davet arka planı",
  discovery_splash_hash: "Keşif arka planı",
  code: "Davet kodu",
  max_uses: "Azami kullanım",
  uses: "Kullanım sayısı",
  max_age: "Geçerlilik süresi",
  temporary: "Geçici üyelik",
  enabled: "Etkinlik durumu",
  available: "Kullanılabilirlik",
  reason: "Gerekçe",
  status: "Durum",
  privacy_level: "Gizlilik seviyesi",
  scheduled_start_time: "Başlangıç zamanı",
  scheduled_end_time: "Bitiş zamanı",
  trigger_type: "Tetikleyici türü",
  event_type: "Olay türü",
  actions: "Uygulanacak işlemler",
  exempt_roles: "Muaf roller",
  exempt_channels: "Muaf kanallar",
  tags: "Etiketler",
});

function getAuditActionKey(action) {
  if (typeof action === "number" && typeof AuditLogEvent[action] === "string") {
    return AuditLogEvent[action];
  }
  if (typeof action === "string" && typeof AuditLogEvent[action] === "number") {
    return action;
  }

  const match = Object.entries(AuditLogEvent).find(([, value]) => value === action);
  return match?.[0] || String(action ?? "Unknown");
}

function splitPascalCase(value) {
  return String(value).replace(/([a-z])([A-Z])/g, "$1 $2");
}

function getActionPresentation(action) {
  const key = getAuditActionKey(action);
  const title = ACTION_LABELS[key] || splitPascalCase(key);

  if (/AutoModeration/.test(key)) {
    return { key, title, category: "Güvenlik", emoji: "🛡️", color: 0xed4245 };
  }
  if (/Member|Bot/.test(key)) {
    const dangerous = /Kick|BanAdd|Disconnect/.test(key);
    return { key, title, category: "Üye yönetimi", emoji: "👥", color: dangerous ? 0xed4245 : 0x5865f2 };
  }
  if (/Channel|Thread|Stage|VoiceChannelStatus/.test(key)) {
    return { key, title, category: "Kanal yönetimi", emoji: "#️⃣", color: /Delete/.test(key) ? 0xed4245 : 0x5865f2 };
  }
  if (/Role|ApplicationCommandPermission/.test(key)) {
    return { key, title, category: "Rol ve izinler", emoji: "🔐", color: /Delete/.test(key) ? 0xed4245 : 0x9b59b6 };
  }
  if (/Message/.test(key)) {
    return { key, title, category: "Mesaj yönetimi", emoji: "📝", color: /Delete/.test(key) ? 0xed4245 : 0xf0b232 };
  }
  if (/Invite/.test(key)) {
    return { key, title, category: "Davetler", emoji: "✉️", color: /Delete/.test(key) ? 0xed4245 : 0x3ba55d };
  }
  if (/Emoji|Sticker|Soundboard/.test(key)) {
    return { key, title, category: "Sunucu içerikleri", emoji: "✨", color: /Delete/.test(key) ? 0xed4245 : 0xeb459e };
  }
  if (/GuildScheduledEvent/.test(key)) {
    return { key, title, category: "Etkinlikler", emoji: "📅", color: /Delete/.test(key) ? 0xed4245 : 0x3ba55d };
  }
  if (/Delete/.test(key)) {
    return { key, title, category: "Sunucu yönetimi", emoji: "🗑️", color: 0xed4245 };
  }
  if (/Create|BanRemove/.test(key)) {
    return { key, title, category: "Sunucu yönetimi", emoji: "🛠️", color: 0x3ba55d };
  }

  return { key, title, category: "Sunucu yönetimi", emoji: "🛠️", color: 0x5865f2 };
}

function truncate(value, maxLength = MAX_CHANGE_VALUE_LENGTH) {
  const text = String(value ?? "Yok").replace(/\s+/g, " ").trim() || "Yok";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function cleanInlineCode(value, maxLength = MAX_CHANGE_VALUE_LENGTH) {
  return truncate(value, maxLength).replace(/`/g, "'");
}

function formatPermissionBits(bitfield) {
  if (bitfield === null || bitfield === undefined) return "Yok";
  const raw = typeof bitfield === "object" && "bitfield" in bitfield
    ? bitfield.bitfield
    : bitfield;
  if (raw === 0 || raw === 0n || raw === "0") return "Yok";

  try {
    const permissions = new PermissionsBitField(raw).toArray();
    return permissions.length ? permissions.join(", ") : "Yok";
  } catch {
    return String(raw);
  }
}

function formatPermissionOverwrite(overwrite) {
  const kind = overwrite.type === 0 || overwrite.type === "0" ? "Rol" : "Üye";
  const name = overwrite.name || kind;
  return `${name} (${overwrite.id || "Bilinmiyor"}) · izin: ${formatPermissionBits(overwrite.allow)} · red: ${formatPermissionBits(overwrite.deny)}`;
}

function formatObjectValue(value, key, depth) {
  if (key === "permission_overwrites" || ("id" in value && "allow" in value && "deny" in value)) {
    return formatPermissionOverwrite(value);
  }
  if (value.id && value.tag) return `${value.tag} (${value.id})`;
  if (value.id && value.name) return `${value.name} (${value.id})`;
  if (value.id && Object.keys(value).length <= 2) return String(value.id);
  if (depth >= 2) return "Nesne";

  const entries = Object.entries(value)
    .filter(([, entryValue]) => typeof entryValue !== "function")
    .slice(0, 6)
    .map(([entryKey, entryValue]) => `${CHANGE_LABELS[entryKey] || entryKey}: ${formatAuditValue(entryValue, entryKey, depth + 1)}`);

  return entries.length ? entries.join(", ") : "Boş";
}

function formatAuditValue(value, key = "", depth = 0) {
  if (value === null || value === undefined) return "Yok";
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "string") return value || "Boş";
  if (typeof value === "number" || typeof value === "bigint") {
    if (key === "color") return `#${Number(value).toString(16).padStart(6, "0").toUpperCase()}`;
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    if (!value.length) return "Yok";
    const shownItems = value.slice(0, 5).map(item => formatAuditValue(item, key, depth + 1));
    const hiddenCount = value.length - shownItems.length;
    return `${shownItems.join("; ")}${hiddenCount > 0 ? `; +${hiddenCount} kayıt` : ""}`;
  }

  if (typeof value === "object") return formatObjectValue(value, key, depth);
  return String(value);
}

function formatChange(change) {
  const label = CHANGE_LABELS[change.key] || splitPascalCase(change.key || "Değişiklik");
  const hasOld = Object.prototype.hasOwnProperty.call(change, "old");
  const hasNew = Object.prototype.hasOwnProperty.call(change, "new");
  const oldValue = hasOld ? cleanInlineCode(formatAuditValue(change.old, change.key)) : "—";
  const newValue = hasNew ? cleanInlineCode(formatAuditValue(change.new, change.key)) : "—";

  if (change.key === "$add") return `- **${label}:** \`${newValue}\``;
  if (change.key === "$remove") return `- **${label}:** \`${hasNew ? newValue : oldValue}\``;
  return `- **${label}:** \`${oldValue}\` → \`${newValue}\``;
}

function formatChanges(changes) {
  if (!Array.isArray(changes) || changes.length === 0) {
    return "### Kayıt detayı\n> Discord bu işlem için ek bir değişiklik dökümü sağlamadı.";
  }

  const lines = [];
  for (const change of changes.slice(0, MAX_CHANGE_LINES)) {
    const line = formatChange(change);
    const candidate = [...lines, line].join("\n");
    if (candidate.length > MAX_CHANGE_BLOCK_LENGTH) break;
    lines.push(line);
  }

  const hiddenCount = changes.length - lines.length;
  if (hiddenCount > 0) lines.push(`-# +${hiddenCount} değişiklik daha gösterilmedi.`);
  return `### Değişiklikler · ${changes.length}\n${lines.join("\n")}`;
}

function entityName(entity) {
  if (!entity) return "Bilinmiyor";
  if (typeof entity === "string" || typeof entity === "number") {
    return escapeMarkdown(truncate(entity, 80));
  }
  const raw = entity.tag
    || entity.globalName
    || entity.displayName
    || entity.name
    || entity.username
    || entity.code
    || entity.id;
  return raw ? escapeMarkdown(truncate(raw, 80)) : "Bilinmiyor";
}

function formatExecutor(executor) {
  if (!executor) return "`Sistem veya bilinmeyen kullanıcı`";
  const id = executor.id ? ` · \`${executor.id}\`` : "";
  return `${executor.id ? `<@${executor.id}>` : `**${entityName(executor)}**`}${id}`;
}

function getTargetKind(actionKey, target) {
  if (target?.tag || target?.username) return "user";
  if (/^(Member|Bot|Message|AutoModeration)/.test(actionKey)) return "user";
  if (/^Role/.test(actionKey)) return "role";
  if (/^(Channel|Thread|VoiceChannelStatus)/.test(actionKey)) return "channel";
  return "plain";
}

function formatTarget(target, actionKey) {
  if (!target) return "`Hedef bilgisi yok`";
  const id = target.id || null;
  const kind = getTargetKind(actionKey, target);
  let display = `**${entityName(target)}**`;

  if (id && kind === "user") display = `<@${id}>`;
  if (id && kind === "role") display = `<@&${id}>`;
  if (id && kind === "channel") display = `<#${id}>`;
  return `${display}${id ? ` · \`${id}\`` : ""}`;
}

function formatExtra(extra) {
  if (!extra || typeof extra !== "object") return null;
  const details = [];
  const channelId = extra.channel?.id || extra.channelId;
  if (channelId) details.push(`Kanal: <#${channelId}>`);
  if (Number.isFinite(extra.count)) details.push(`Adet: **${extra.count}**`);
  if (extra.messageId) details.push(`Mesaj: \`${extra.messageId}\``);
  if (Number.isFinite(extra.membersRemoved)) details.push(`Temizlenen üye: **${extra.membersRemoved}**`);
  if (Number.isFinite(extra.deleteMemberDays)) details.push(`İnaktif gün: **${extra.deleteMemberDays}**`);
  return details.length ? details.join(" · ") : null;
}

function buildAuditLogPayload(entry) {
  const presentation = getActionPresentation(entry.action);
  const timestamp = Math.floor((entry.createdTimestamp || Date.now()) / 1000);
  const reason = entry.reason
    ? escapeMarkdown(truncate(entry.reason, 500))
    : "`Gerekçe belirtilmedi`";
  const extra = formatExtra(entry.extra);
  const summaryLines = [
    "### Olay özeti",
    "**İşlem Sorumlusu**",
    formatExecutor(entry.executor),
    "",
    "**Etkilenen Hedef**",
    formatTarget(entry.target, presentation.key),
    "",
    "**Gerekçe**",
    reason,
  ];
  if (extra) summaryLines.push("", "**Ek bilgiler**", extra);

  const headerContent = [
    `## ${presentation.emoji} ${presentation.title}`,
    `\`${presentation.category.toLocaleUpperCase("tr-TR")}\` · <t:${timestamp}:F>`,
  ].join("\n");
  const container = new ContainerBuilder().setAccentColor(presentation.color);
  const avatarUrl = entry.executor?.displayAvatarURL?.({ size: 128 });

  if (avatarUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerContent))
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(avatarUrl)
        )
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerContent));
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(summaryLines.join("\n"))
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(formatChanges(entry.changes))
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Kayıt kimliği: \`${entry.id || "bilinmiyor"}\``
      )
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  name: Events.GuildAuditLogEntryCreate,

  async execute(entry, guild) {
    const data = readJson(DB_PATH, {});
    const config = data && typeof data === "object" && !Array.isArray(data)
      ? data[guild.id]
      : null;
    if (!config?.enabled || !config.channelId) return;
    if (Array.isArray(config.eventTypes) && config.eventTypes.length
      && !config.eventTypes.includes(getAuditActionKey(entry.action))) return;

    const channel = await guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel || typeof channel.send !== "function") return;

    await channel.send(buildAuditLogPayload(entry)).catch(error => {
      console.error("🔴 [AUDIT LOG] Kayıt mesajı gönderilemedi:", error);
    });
  },

  buildAuditLogPayload,
  getAuditActionKey,
  ACTION_LABELS,
};