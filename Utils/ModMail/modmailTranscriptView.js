const DATE_OPTIONS = { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'long', year: 'numeric' };
const TIME_OPTIONS = { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
function date(value, options = DATE_OPTIONS) {
  return Number.isFinite(value) && value > 0 ? new Intl.DateTimeFormat('tr-TR', options).format(value) : 'Bilinmiyor';
}
function duration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds} sn`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa ${minutes % 60} dk`;
  return `${Math.floor(hours / 24)} gün ${hours % 24} sa`;
}
function identity(guild, id, record = {}) {
  const member = guild.members?.cache?.get(id);
  const user = member?.user || guild.client?.users?.cache?.get(id);
  return {
    id: String(id || ''),
    name: record.authorDisplayName || record.authorName || member?.displayName || user?.globalName || user?.username || (id ? `Kullanıcı ${id}` : 'Sistem'),
    username: record.authorName || user?.username || '',
    avatar: safeUrl(record.avatar || user?.displayAvatarURL?.({ extension: 'png', size: 128 })),
  };
}
function createViewModel(guild, session) {
  const messages = [...(session.messages || [])].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const team = new Map();
  for (const record of messages) {
    if (record.direction !== 'staff') continue;
    const previous = team.get(record.authorId) || { ...identity(guild, record.authorId, record), delivered: 0, failed: 0 };
    if (record.delivered) previous.delivered++;
    else previous.failed++;
    team.set(record.authorId, previous);
  }
  const memberRecord = messages.find(record => record.direction === 'member' && record.authorId === session.userId);
  const member = identity(guild, session.userId, memberRecord);
  const delivered = messages.filter(record => record.delivered);
  const memberMessages = delivered.filter(record => record.direction === 'member');
  const staffMessages = delivered.filter(record => record.direction === 'staff');
  const firstRequest = memberMessages[0];
  const firstReply = firstRequest && staffMessages.find(record => record.createdAt >= firstRequest.createdAt);
  const personFor = id => identity(guild, id, messages.findLast(record => record.authorId === id));
  return {
    guild, session, messages, team: [...team.values()], member,
    claimed: session.claimedBy ? personFor(session.claimedBy) : null,
    closer: personFor(session.closerId),
    stats: {
      delivered: delivered.length, member: memberMessages.length, staff: staffMessages.length,
      failed: messages.length - delivered.length,
      files: messages.reduce((total, record) => total + (record.attachments?.length || 0), 0),
      firstReply: firstReply ? duration(firstReply.createdAt - firstRequest.createdAt) : 'Yanıt yok',
      duration: duration(session.closedAt - session.openedAt),
    },
  };
}
function avatar(person, className = '') {
  const letters = [...person.name.trim()].slice(0, 2).join('').toLocaleUpperCase('tr-TR') || '?';
  return `<span class="avatar ${className}">${person.avatar
    ? `<img src="${escapeHtml(person.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : escapeHtml(letters)}</span>`;
}
function identityMarkup(person) {
  return `<strong>${escapeHtml(person.name)}</strong>${person.username && person.username !== person.name ? `<span class="username">@${escapeHtml(person.username)}</span>` : ''}<span class="user-id">${escapeHtml(person.id || 'Otomatik işlem')}</span>`;
}
function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return '';
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
}
function attachmentMarkup(file) {
  const url = safeUrl(file.url);
  const name = escapeHtml(file.name || 'Dosya');
  const link = url ? escapeHtml(url) : '';
  const type = String(file.contentType || '').toLowerCase();
  let media = '';
  if (url && ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(type)) {
    media = `<a href="${link}" target="_blank" rel="noopener noreferrer" class="image-link"><img class="attachment-image" src="${link}" alt="${name}" loading="lazy" referrerpolicy="no-referrer"></a>`;
  } else if (url && type.startsWith('video/')) {
    media = `<video controls preload="none" src="${link}" aria-label="${name}"></video>`;
  } else if (url && type.startsWith('audio/')) {
    media = `<audio controls preload="none" src="${link}" aria-label="${name}"></audio>`;
  }
  return `<figure class="attachment">${media}<figcaption><span class="file-icon" aria-hidden="true">↗</span><span class="file-info">${url
    ? `<a href="${link}" target="_blank" rel="noopener noreferrer">${name}</a>` : `<span>${name}</span>`}<small>${escapeHtml(formatBytes(file.size))}${url ? ' · Dosyayı aç' : ' · Bağlantı kullanılamıyor'}</small></span></figcaption></figure>`;
}
function messageMarkup(guild, record, number) {
  const staff = record.direction === 'staff';
  const person = identity(guild, record.authorId, record);
  const source = staff ? (record.source === 'dashboard' || String(record.id).startsWith('dashboard-') ? 'Dashboard' : 'Yetkili kanalı') : 'Özel mesaj';
  const delivery = record.delivered ? 'İletildi' : record.deliveredParts > 0 ? 'Kısmen iletildi' : 'İletilemedi';
  const content = record.content ? `<div class="message-content">${escapeHtml(record.content)}</div>` : '';
  return `<article class="message ${staff ? 'staff' : 'member'}" data-direction="${staff ? 'staff' : 'member'}" data-author-id="${escapeHtml(record.authorId)}">
    <div class="message-heading">${avatar(person)}<div class="message-author"><strong>${escapeHtml(person.name)}</strong><span class="role-tag">${staff ? 'YETKİLİ' : 'ÜYE'}</span></div><time>${date(record.createdAt, TIME_OPTIONS)}</time></div>
    <div class="message-bubble">${content}${(record.attachments || []).map(attachmentMarkup).join('')}${!content && !record.attachments?.length ? '<p class="empty-text">Metin veya dosya içeriği yok.</p>' : ''}</div>
    <div class="message-meta"><span class="author-details">${person.username ? `@${escapeHtml(person.username)} · ` : ''}${escapeHtml(person.id)}</span><span>${source}</span><span class="delivery ${record.delivered ? '' : 'failed'}">${record.delivered ? '✓ ' : '! '}${delivery}</span><span class="message-number">#${String(number).padStart(2, '0')}</span></div>
  </article>`;
}

const styles = `
:root{color-scheme:dark;--paper:#101218;--ink:#e6e9f0;--muted:#a0a9b9;--line:#2c3342;--purple:#b9a7ff;--purple-soft:#25203c;--teal:#7edac3;--surface:#191d27;--surface-raised:#202634;--purple-line:#493c6b;--teal-soft:#19332f;--teal-line:#30534a;--danger:#ffaaa1}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.6 'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased}a{color:inherit}button,input{font:inherit}::selection{background:#55467d;color:#fff}main{max-width:1360px;margin:auto;padding:0 48px 32px}
.masthead{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:27px 0;border-bottom:1px solid var(--line)}.brand{display:flex;align-items:center;gap:13px}.brand-symbol{width:39px;height:39px;display:grid;place-items:center;background:var(--surface-raised);color:var(--purple);border-radius:12px;font-size:22px}.brand-name{font-size:20px;font-weight:750;letter-spacing:-.6px;line-height:1.1}.eyebrow{font-size:10px;letter-spacing:2px;font-weight:700;text-transform:uppercase;color:var(--muted)}.brand .eyebrow{font-size:9px;letter-spacing:1.6px;margin-top:4px}.guild-name{max-width:380px;overflow-wrap:anywhere;text-align:right;font-weight:600;font-size:12px}.guild-name small{display:block;color:var(--muted);font-size:10px;font-weight:400;letter-spacing:1px}
.hero{padding:37px 0 30px;display:flex;align-items:flex-start;justify-content:space-between;gap:24px}.hero h1{font-size:clamp(29px,3.5vw,43px);letter-spacing:-1.8px;line-height:1.2;margin:10px 0 12px;font-weight:750}.hero p{margin:0;color:var(--muted);font-size:13px}.hero-right{text-align:right;padding-top:4px}.status{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--teal-line);border-radius:30px;padding:6px 12px;font-size:11px;color:var(--teal);font-weight:650;background:var(--teal-soft)}.status::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--teal)}.reference{margin-top:12px;color:var(--muted);font:11px/1.8 Consolas,monospace;overflow-wrap:anywhere}.reference b{display:block;color:var(--ink);font-weight:500}.metrics{background:var(--surface-raised);color:var(--ink);border:1px solid var(--line);border-radius:16px;display:grid;grid-template-columns:repeat(4,1fr);padding:25px 12px;margin-bottom:36px}.metric{padding:0 24px;border-right:1px solid var(--line)}.metric:last-child{border:0}.metric-label{display:block;color:#c1c4d0;font-size:11px}.metric-number{font-size:28px;letter-spacing:-.8px;line-height:1.5;font-weight:650}.metric-note{font-size:10px;color:#bfc2ce;margin-left:7px}.metric-number.accent{color:#cbc0ff}
.layout{display:grid;grid-template-columns:minmax(0,1fr) 292px;gap:38px;align-items:start}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding-bottom:15px;margin-bottom:23px}.section-heading h2{font-size:18px;letter-spacing:-.4px;margin:0}.section-heading span{font-size:11px;color:var(--muted)}.legend{display:flex;align-items:center;gap:15px}.legend i{display:inline-block;width:7px;height:7px;background:var(--teal);border-radius:50%;margin-right:4px}.legend .out{background:var(--purple)}.date-divider{display:flex;align-items:center;gap:13px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:1.2px;margin:23px 0}.date-divider::before,.date-divider::after{content:'';height:1px;flex:1;background:var(--line)}
.event{display:flex;gap:9px;justify-content:center;align-items:center;flex-wrap:wrap;text-align:center;font-size:11px;color:var(--muted);padding:8px 14px}.event-icon{width:20px;height:20px;display:grid;place-items:center;border:1px solid var(--line);border-radius:50%;font-size:11px}.event time{font-size:10px}.messages{padding-bottom:16px}.message{max-width:88%;margin:25px 0 31px}.message.staff{margin-left:auto}.message-heading{display:flex;align-items:center;gap:9px;margin-bottom:9px}.avatar{flex-shrink:0;width:32px;height:32px;border-radius:50%;display:inline-grid;place-items:center;overflow:hidden;background:var(--teal-soft);color:var(--teal);font-size:10px;font-weight:750;vertical-align:middle}.avatar img{width:100%;height:100%;object-fit:cover}.staff .avatar,.team-avatar{background:var(--purple-soft);color:var(--purple)}.message-author{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0}.message-author strong{font-size:12px;overflow-wrap:anywhere}.role-tag{font-size:8px;font-weight:750;letter-spacing:1px;color:var(--teal);background:var(--teal-soft);border-radius:4px;padding:2px 5px}.staff .role-tag{color:var(--purple);background:var(--purple-soft)}.message-heading time{margin-left:auto;flex-shrink:0;font-size:10px;font-variant-numeric:tabular-nums;color:var(--muted)}.message-bubble{background:var(--surface);border:1px solid var(--line);border-radius:3px 15px 15px 15px;padding:17px 19px;overflow:hidden;box-shadow:0 2px 2px #0000001a}.staff .message-bubble{background:var(--purple-soft);border-color:var(--purple-line);border-radius:15px 3px 15px 15px}.message-content{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8;font-size:13px}.message-meta{display:flex;gap:7px 11px;align-items:center;flex-wrap:wrap;padding:7px 2px 0;color:var(--muted);font-size:9px}.author-details{font-family:Consolas,monospace;overflow-wrap:anywhere}.message-number{margin-left:auto;color:var(--muted);font-variant-numeric:tabular-nums}.delivery{color:var(--teal)}.delivery.failed{color:var(--danger);font-weight:700}.empty-text{color:var(--muted);font-size:12px;margin:0}
.attachment{margin:12px 0 0;background:var(--paper);border:1px solid var(--line);border-radius:9px;overflow:hidden}.attachment:first-child{margin-top:0}.attachment-image{display:block;max-width:100%;max-height:320px;height:auto;object-fit:contain;margin:auto}.image-link{display:block;background:var(--paper)}.attachment video{display:block;width:100%;max-height:340px;background:var(--paper)}.attachment audio{width:100%;padding:8px}.attachment figcaption{display:flex;gap:10px;align-items:center;padding:11px 13px}.file-icon{display:grid;place-items:center;width:29px;height:33px;border:1px solid var(--line);border-radius:6px;font-size:18px;flex-shrink:0}.file-info{min-width:0}.file-info a,.file-info>span{font-size:11px;font-weight:600;overflow-wrap:anywhere;text-decoration:none}.file-info a:hover{text-decoration:underline}.file-info small{display:block;color:var(--muted);font-size:9px;margin-top:1px}
.sidebar{display:grid;gap:25px}.sidebar h2{font-size:10px;font-weight:750;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 15px}.case-card{border:1px solid var(--line);border-radius:14px;padding:21px;background:var(--surface)}.person{display:flex;gap:11px;align-items:center;min-width:0}.person .avatar{width:39px;height:39px;font-size:12px}.person>div{min-width:0;flex:1}.person strong{display:block;font-size:13px;overflow-wrap:anywhere;line-height:1.4}.username,.user-id{display:block;font-size:10px;color:var(--muted);overflow-wrap:anywhere}.user-id{font:9px/1.8 Consolas,monospace;margin-top:3px}.case-dates{margin:20px 0 0;padding-top:16px;border-top:1px solid var(--line);display:grid;gap:13px}.case-dates dt{color:var(--muted);font-size:10px}.case-dates dd{margin:2px 0 0;font-size:11px;font-weight:600}.case-dates dd small{display:block;font-weight:400;color:var(--muted)}.team-title{display:flex;justify-content:space-between;align-items:center}.team-title a{font-size:10px;color:var(--muted);text-decoration:none}.team-person{padding:13px 0;border-bottom:1px solid var(--line)}.team-person:last-child{border-bottom:0;padding-bottom:0}.reply-count{font:10px/1.6 'Segoe UI',sans-serif;color:var(--purple);font-weight:600}.staff-note{margin:15px 0 0;font-size:10px;color:var(--muted);line-height:1.7}.closure{background:var(--teal-soft);border:1px solid var(--teal-line);border-radius:14px;padding:20px}.closure h2{color:var(--teal)}.closure p{font-size:12px;margin:0 0 17px;white-space:pre-wrap;overflow-wrap:anywhere}.closure-label{font-size:9px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin:0 0 7px}.closure .person strong{font-size:11px}.closure .avatar{width:28px;height:28px;font-size:9px}.attachment-summary{display:flex;justify-content:space-between;gap:16px;font-size:11px;color:var(--muted);padding:0 2px}.attachment-summary b{color:var(--ink)}.footnote{margin-top:20px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:10px;display:flex;justify-content:space-between;gap:15px;flex-wrap:wrap}.page-note{background:var(--purple-soft);border-radius:8px;padding:10px 13px;color:var(--purple);font-size:11px;margin:0 0 18px}.empty-state{text-align:center;border:1px dashed var(--line);padding:36px 20px;border-radius:12px;color:var(--muted)}
@media(min-width:1200px){.sidebar{position:sticky;top:22px}}
@media(max-width:1000px){main{padding:0 28px 25px}.layout{gap:25px;grid-template-columns:minmax(0,1fr) 258px}.metric{padding:0 15px}.message{max-width:96%}.legend{gap:8px}}
@media(max-width:720px){main{padding:0 18px 24px}.masthead{padding:20px 0;gap:12px}.brand-name{font-size:18px}.guild-name{font-size:10px;max-width:45%}.guild-name small{font-size:8px}.hero{padding:26px 0 23px;gap:13px;flex-wrap:wrap}.hero h1{font-size:32px;letter-spacing:-1px}.hero-right{width:100%;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:12px}.reference{margin:0;text-align:right;font-size:9px}.metrics{grid-template-columns:repeat(2,1fr);gap:20px 0;padding:21px 6px;margin-bottom:28px;border-radius:13px}.metric:nth-child(2){border:0}.metric-number{font-size:25px}.metric-note{font-size:9px}.layout{display:flex;flex-direction:column;gap:25px}.conversation,.sidebar{width:100%}.sidebar{grid-template-columns:1fr}.message{max-width:96%}.message.staff{max-width:96%}.message-author{gap:5px}.message-author strong{font-size:11px}.message-content{font-size:12px}.message-bubble{padding:14px}.section-heading h2{font-size:17px}.legend{gap:10px}.section-heading span{font-size:10px}.message-meta{font-size:8px}.author-details{max-width:100%}.hero p{font-size:11px}.footnote{font-size:9px}.case-dates{grid-template-columns:1fr 1fr}}
@media print{:root{color-scheme:light;--paper:#fff;--ink:#252c36;--muted:#555f6d;--line:#d4d8df;--purple:#6454b2;--purple-soft:#eeebfa;--teal:#226e63;--surface:#fff;--surface-raised:#f1f2f5;--purple-line:#d8d1ee;--teal-soft:#e4eee8;--teal-line:#bcdacf;--danger:#a33d32}body{background:white;font-size:10pt}main{max-width:none;padding:0}.masthead{padding-top:0}.metrics{background:#eee;color:#222;break-inside:avoid}.metric-label,.metric-number.accent,.metric-note{color:#333}.layout{display:block}.sidebar{position:static;display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:25px}.message,.case-card,.closure,.team-person{break-inside:avoid}.message{max-width:88%}.message-bubble{box-shadow:none}.hero{padding:20px 0}.attachment-image{max-height:220px}.conversation{width:100%}.footnote{margin-top:25px}}
`;

function renderTranscriptPage(model, pageIndex = 0, pageSize = 250) {
  const { guild, session, messages, stats, member, team, claimed, closer } = model;
  const pageCount = Math.max(1, Math.ceil(messages.length / pageSize));
  const pageMessages = messages.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  let previousDate = '';
  const conversation = pageMessages.map((record, index) => {
    const currentDate = date(record.createdAt);
    const divider = currentDate !== previousDate ? `<div class="date-divider">${currentDate}</div>` : '';
    previousDate = currentDate;
    return divider + messageMarkup(guild, record, pageIndex * pageSize + index + 1);
  }).join('');
  const teamList = team.map(person => `<div class="team-person person">${avatar(person, 'team-avatar')}<div>${identityMarkup(person)}<span class="reply-count">${person.delivered} yanıt${person.failed ? ` · ${person.failed} iletilemeyen / kısmi` : ''}</span></div></div>`).join('');
  const pageLabel = pageCount > 1 ? `Bölüm ${pageIndex + 1} / ${pageCount}` : 'Tam görüşme';
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https:; media-src https:; base-uri 'none'; form-action 'none'">
<title>ModMail · ${escapeHtml(guild.name)} · ${escapeHtml(session.channelId)}</title><style>${styles}</style></head>
<body><main>
  <header class="masthead"><div class="brand"><span class="brand-symbol" aria-hidden="true">↗</span><div><div class="brand-name">ModMail<span style="color:var(--purple)">.</span></div><div class="eyebrow">Görüşme arşivi</div></div></div><div class="guild-name">${escapeHtml(guild.name)}<small>ÖZEL DESTEK GÖRÜŞMESİ</small></div></header>
  <section class="hero"><div><div class="eyebrow">${date(session.openedAt)}</div><h1>Destek, kayda geçti.</h1><p>${escapeHtml(member.name)} ile destek ekibi arasındaki görüşme.</p></div><div class="hero-right"><span class="status">Görüşme kapatıldı</span><div class="reference">GÖRÜŞME NUMARASI<b>${escapeHtml(session.channelId)}</b></div></div></section>
  <section class="metrics" aria-label="Görüşme özeti"><div class="metric"><span class="metric-label">İletilen mesaj</span><span class="metric-number">${stats.delivered}</span><span class="metric-note">${stats.member} üye · ${stats.staff} yetkili</span></div><div class="metric"><span class="metric-label">Yanıt veren yetkili</span><span class="metric-number accent">${team.filter(person => person.delivered > 0).length}</span><span class="metric-note">kişi</span></div><div class="metric"><span class="metric-label">İlk yanıt</span><span class="metric-number">${stats.firstReply}</span></div><div class="metric"><span class="metric-label">Görüşme süresi</span><span class="metric-number">${stats.duration}</span></div></section>
  <div class="layout"><section class="conversation" id="conversation"><div class="section-heading"><h2>Mesaj akışı</h2><div class="legend"><span><i></i>Üye</span><span><i class="out"></i>Yetkili</span></div></div>
  ${pageCount > 1 ? `<p class="page-note">${pageLabel} · Mesaj ${pageIndex * pageSize + 1}–${Math.min(messages.length, (pageIndex + 1) * pageSize)} / ${messages.length}. Özet tüm görüşmeyi kapsar.</p>` : ''}
  ${pageIndex === 0 ? `<div class="event"><span class="event-icon">+</span> Görüşme açıldı <time>${date(session.openedAt, TIME_OPTIONS)}</time></div>` : ''}
  <div class="messages">${conversation || '<div class="empty-state">Bu görüşmede kayıtlı mesaj bulunmuyor.</div>'}</div>
  ${pageIndex === pageCount - 1 ? `<div class="event"><span class="event-icon">✓</span> ${escapeHtml(closer.name)} görüşmeyi kapattı <time>${date(session.closedAt, TIME_OPTIONS)}</time></div>` : ''}</section>
  <aside class="sidebar"><section class="case-card"><h2>Görüşmenin sahibi</h2><div class="person">${avatar(member)}<div>${identityMarkup(member)}</div></div><dl class="case-dates"><div><dt>Açılış</dt><dd>${date(session.openedAt)}<small>${date(session.openedAt, TIME_OPTIONS)}</small></dd></div><div><dt>Kapanış</dt><dd>${date(session.closedAt)}<small>${date(session.closedAt, TIME_OPTIONS)}</small></dd></div><div><dt>Talebi üstlenen</dt><dd>${claimed ? `${escapeHtml(claimed.name)}<small>${escapeHtml(claimed.id)}</small>` : 'Üstlenilmedi'}</dd></div></dl></section>
  <section class="case-card" id="team"><div class="team-title"><h2>Yanıt veren ekip</h2><a href="#conversation">Mesajlara git ↗</a></div>${teamList || '<p class="empty-text">Henüz yetkili yanıtı yok.</p>'}<p class="staff-note">Her mesajda yanıtı yazan kişi ayrıca belirtilir. Aynı kişinin üye ve yetkili mesajları ayrı işaretlenir.</p></section>
  <section class="closure"><h2>Kapatma notu</h2><p>${escapeHtml(session.closeReason || 'Kapatma nedeni belirtilmedi.')}</p><div class="closure-label">Görüşmeyi kapatan</div><div class="person">${avatar(closer)}<div>${identityMarkup(closer)}</div></div></section>
  <div class="attachment-summary"><span><b>${stats.files}</b> dosya eki</span><span><b>${stats.failed}</b> iletilemeyen / kısmi mesaj</span></div></aside></div>
  <footer class="footnote"><span>ModMail · ${escapeHtml(guild.name)} · ${pageLabel}</span><span>Saat dilimi: İstanbul (UTC+3) · İç notlar bu kayda dahil değildir.</span></footer>
</main></body></html>`;
}

module.exports = { createViewModel, renderTranscriptPage, escapeHtml, safeUrl };
