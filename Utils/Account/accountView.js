"use strict";
const {
  ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags,
  SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder,
  ThumbnailBuilder, escapeMarkdown,
} = require("discord.js");
const emojiler = require("../Emojis/emojiler");
const { formatAccountDate } = require("./accountTime");
const text = value => escapeMarkdown(String(value ?? "").replace(/[\r\n\t]/g, " ").slice(0, 150));
const code = value => `\`${String(value).replace(/[`\r\n]/g, "'")}\``;
const icon = (aliases, fallback) => aliases.map(alias => emojiler.getEmojiString(alias)).find(Boolean) || fallback;
const time = value => code(formatAccountDate(value) || "Bilinmiyor");

function divider(container) {
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
}
function addSection(container, content, thumbnailURL) {
  const display = new TextDisplayBuilder().setContent(content);
  if (thumbnailURL) container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(display)
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailURL)));
  else container.addTextDisplayComponents(display);
}
function addImage(container, title, url) {
  if (!url) return;
  if (title) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(title));
  const item = new MediaGalleryItemBuilder().setURL(url);
  container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(item));
}
function badgeLine(user, badges) {
  if (!user.flags) return code("Bilgi alınamadı");
  return badges.length ? badges.map(badge => badge.emoji || `${badge.fallback || "🏅"} ${text(badge.label)}`).join(" ") : code("Yok");
}
function buildUserInformation({ user, member, badges, primaryGuild }) {
  const lines = [
    `## ${icon(["user", "uye"], "👤")} Kullanıcı Bilgileri`,
    `🆔 **ID:** ${code(user.id)}`,
    `＠ **Etiket:** <@${user.id}> (${code(user.username)})`,
    `🪪 **Görünen Ad:** ${text(user.globalName || user.username)}`,
  ];
  if (user.discriminator && !["0", "0000"].includes(user.discriminator)) lines.push(`＃ **Eski Kullanıcı Adı:** ${text(`${user.username}#${user.discriminator}`)}`);
  lines.push(
    `🗓️ **Hesap Oluşturulma Tarihi:** ${time(user.createdTimestamp)}`,
    `🏅 **Rozetler:** ${badgeLine(user, badges)}`,
    `🛡️ **Sunucu Etiketi:** ${primaryGuild ? `${primaryGuild.emoji || "🛡️"} ${text(primaryGuild.tag)}` : code("Yok")}`,
  );
  if (member?.premiumSinceTimestamp) lines.push(`💎 **Takviye Başlangıcı:** ${time(member.premiumSinceTimestamp)} (bu sunucuda)`);
  if (Number.isInteger(user.accentColor)) lines.push(`🎨 **Vurgu Rengi:** ${code(`#${user.accentColor.toString(16).padStart(6, "0")}`)}`);
  return lines.join("\n");
}
function formatMessages(messages) {
  const count = value => Number.isFinite(value) ? code(value) : code("Bilinmiyor");
  if (!messages?.available) return "✉️ **Mesajlar:** `Kayıt yok`";
  return `✉️ **Mesajlar:** ${count(messages.total)} (bu ay: ${count(messages.month)} | bu hafta: ${count(messages.week)} | bugün: ${count(messages.today)})`;
}
function buildMembershipInformation({ member, membership }) {
  const roles = membership.roles || [];
  const invite = membership.joinMethod;
  const method = invite?.type === "invite" ? `🔗 ${code("Davet")}${invite.inviterId ? ` (<@${invite.inviterId}>)` : ""}` : code("Bilinmiyor");
  const lines = [
    `## ${icon(["home", "server"], "🏠")} Sunucu Üyeliği`,
    `♙ **Takma Ad:** ${text(member.nickname || member.displayName || member.user.username)}`,
    `🛡️ **Roller:** ${roles.length} (En yüksek: ${roles[0] ? `<@&${roles[0].id}>` : code("Yok")})`,
    `🗓️ **Katılım Tarihi:** ${time(membership.joinedTimestamp)}`,
    `📌 **Katılım Sırası:** ${membership.joinPosition ?? code("Bilinmiyor")}`,
    `➜ **Katılım Yöntemi:** ${method}`,
    formatMessages(membership.messages),
  ];
  if (membership.messages?.partial) lines.push(membership.messages.trackedSince
    ? `-# Mesaj kaydı başlangıcı: ${time(membership.messages.trackedSince)} · Önceki dönemler eksik olabilir.`
    : "-# Mesaj toplamı mevcut kanal kayıtlarıyla sınırlı, geçmiş veriler bulunmuyor.");
  return lines.join("\n");
}
function buildPresenceInformation(presence, lastSeenAt) {
  const deviceIcons = { desktop: icon(["desktop", "computer"], "🖥️"), mobile: icon(["mobile", "phone"], "📱"), web: icon(["web", "browser"], "🌐") };
  const devices = Object.entries(presence?.clientStatus || {}).filter(([key, status]) => deviceIcons[key] && ["online", "idle", "dnd"].includes(status)).map(([key]) => deviceIcons[key]);
  const lastSeenTime = Number.isFinite(lastSeenAt) && lastSeenAt > 0 ? `<t:${Math.floor(lastSeenAt / 1000)}:f>` : code("Bilinmiyor");
  const lastSeen = ["online", "idle", "dnd"].includes(presence?.status) ? code("Şu anda çevrim içi") : lastSeenTime;
  return `## ${icon(["presence"], "🌐")} Durum Bilgileri\n**📱 Cihazlar:** ${devices.length ? devices.join(" ") : code("Aktif cihaz bilgisi yok")}\n🕒 **Son Görülme Zamanı:** ${lastSeen}`;
}
function buildAccountPayload({ user, member, membership, badges = [], primaryGuild, presence, lastSeenAt, images, cardName, cardAttachment }) {
  const container = new ContainerBuilder();
  addSection(container, buildUserInformation({ user, member, badges, primaryGuild }), images.avatarURL);
  if (images.avatarDecorationURL) addSection(container, "✨ **Avatar Efekti**", images.avatarDecorationURL);
  addImage(container, "🖼️ **Banner**", images.bannerURL);
  if (member && membership) {
    divider(container);
    addSection(container, buildMembershipInformation({ member, membership }), images.memberAvatarURL);
    addImage(container, "🖼️ **Sunucu Profili Bannerı**", images.memberBannerURL);
  }
  divider(container);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(buildPresenceInformation(presence, lastSeenAt)));
  if (presence && cardName && cardAttachment) {
    divider(container);
    addImage(container, null, `attachment://${cardName}`);
  }
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] }, files: cardAttachment ? [cardAttachment] : [] };
}
function buildNoticePayload(title, description) {
  return { components: [new ContainerBuilder().setAccentColor(0xed4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}\n${description}`))], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}
module.exports = { buildAccountPayload, buildNoticePayload, buildUserInformation, buildMembershipInformation, buildPresenceInformation };
