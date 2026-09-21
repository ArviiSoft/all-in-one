/* exported profilHarfleri */

'use strict';
const kok = document.getElementById('root');
const durum = { csrf: '', username: '', user: null, authMethod: '', auth: { mode: null, discordEnabled: false }, profile: null, profileDraft: null, bot: { name: 'Bot', avatarUrl: null }, registry: [], guilds: [], guildId: '', entities: {}, overview: null, moduleStatuses: {}, overviewError: '', route: 'overview', drafts: new Map(), navigation: 0 };
const yollar = {
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  home: '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  server: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01M12 6.5h5M12 17.5h5"/>',
  shield: '<path d="m12 3 8 3v6c0 4-5 8-8 9-3-1-8-5-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  voice: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
  chart: '<path d="M4 4v16h17M8 15l4-5 4 2 5-7"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7Z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.9M16 3a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  game: '<path d="M6 7h12c3 0 5 11 2 12-2 1-4-3-5-3H9c-1 0-3 4-5 3C1 18 3 7 6 7ZM6 10v5M3.5 12.5h5M15 11h.01M18 14h.01"/>',
  settings: '<path d="M12 8v.01M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  backup: '<path d="M3 8V3h5M3 8a9 9 0 1 1-.2 8M12 7v5l3 2"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3L7.5 14 3 9.6l6.2-.9Z"/>',
  message: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8Z"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-2L20 8M4 16l2.3 3A7 7 0 0 0 18 17"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="m3 3 18 18M10.6 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.1 4.2M6.2 6.2A19 19 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.8-1.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M10 12h11m-4-4 4 4-4 4"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  resize: '<path d="M14 3h7v7M21 3l-7 7M10 21H3v-7M3 21l7-7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  broadcast: '<path d="m4 10 13-5v14L4 14Zm3 5 1 6h3l-1-5M20 8v8M4 10H2v4h2"/>',
  thread: '<path d="M5 3v12a4 4 0 0 0 4 4h11M5 7h15M16 3l4 4-4 4M16 15l4 4-4 4"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1 3 4 3 4-3 4-3M8 9h.01M16 9h.01"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  pin: '<path d="m8 3 8 0-1 7 4 4v2H5v-2l4-4ZM12 16v6"/>',
  tag: '<path d="M3 3h8l10 10-8 8L3 11Z"/><circle cx="7.5" cy="7.5" r="1"/>',
  door: '<path d="M5 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5V3Z"/><path d="M5 12h14m-4-4 4 4-4 4"/>',
  trendUp: '<path d="M4 17 10 11l4 4 6-8M15 7h5v5"/>',
  mask: '<path d="M4 6c2-2 5-3 8-3s6 1 8 3v5c0 5-4 9-8 9s-8-4-8-9Z"/><path d="M8 11h.01M16 11h.01M8 15c2 1 6 1 8 0"/>',
  ghost: '<path d="M5 20V10a7 7 0 0 1 14 0v10l-3-2-4 2-4-2-3 2Z"/><path d="M9 10h.01M15 10h.01"/>',
  video: '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3Z"/>',
  quote: '<path d="M9 11H5a3 3 0 0 1 0-6h5v8a6 6 0 0 1-6 6M19 11h-4a3 3 0 0 1 0-6h5v8a6 6 0 0 1-6 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 18h3"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
  gavel: '<path d="m14 5 5 5M12 7l5 5M4 20l9-9M3 21h8M16 3l5 5-3 3-5-5Z"/>',
  personDown: '<circle cx="12" cy="7" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2M12 12v8m-3-3 3 3 3-3"/>',
  userEdit: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-2a7 7 0 0 1 12-4.9M15 16l5-5 2 2-5 5-3 1Z"/>',
  userPlus: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0M19 8v6M16 11h6"/>',
  userMinus: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0M16 11h6"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 5 5 5 9s-5 4-5 9M17 3c0 5-5 5-5 9s5 4 5 9"/>',
  broom: '<path d="m14 4 6 6M12 6l6 6M3 21l7-7M9 12l3 3-5 5H3v-4Z"/>',
  turtle: '<path d="M7 16a5 5 0 1 1 10 0c0 2-2 4-5 4s-5-2-5-4Z"/><path d="M7 16H3v-3M17 16h4v-3M9 12V9M15 12V9M12 20v2"/>',
  bomb: '<circle cx="11" cy="14" r="7"/><path d="m16 9 3-3M17 4l3 3M11 7V4"/>',
  warning: '<path d="m12 3 10 18H2Z"/><path d="M12 9v5M12 17h.01"/>',
  zodiac: '<circle cx="12" cy="12" r="9"/><path d="M7 8v8M17 8v8M7 12h10M10 8h4"/>',
  palette: '<path d="M12 3a9 9 0 0 0 0 18h1a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h4a5 5 0 0 0 5-5c0-3-4-5-9-5Z"/><circle cx="7" cy="10" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
  route: '<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8 7h5a5 5 0 0 1 5 5v3"/>',
  hashTag: '<path d="m10 3-2 18M16 3l-2 18M4 9h17M3 15h17"/>',
  reaction: '<circle cx="12" cy="12" r="9"/><path d="M8 10h.01M16 10h.01M8 14c1 2 7 2 8 0"/><path d="M19 4v4M17 6h4"/>',
  headset: '<path d="M4 13v-1a8 8 0 0 1 16 0v1M4 13h3v6H5a1 1 0 0 1-1-1ZM20 13h-3v6h2a1 1 0 0 0 1-1ZM17 19c-1 2-3 2-5 2"/>',
  sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  trap: '<path d="m4 7 8-4 8 4-2 13H6Z"/><path d="M8 10h8M9 14h6M10 18h4"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M8 9h8M8 13h8M8 17h5"/>',
  rocket: '<path d="M14 4c3-2 6-2 6-2s0 3-2 6l-6 6-4-4Z"/><path d="m8 10-4 1 3 3M13 15l-1 5-3-3M6 18l-3 3"/><circle cx="16" cy="6" r="1"/>',
  youtube: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="m10 9 5 3-5 3Z"/>',
  rss: '<path d="M5 19h.01M5 13a6 6 0 0 1 6 6M5 7a12 12 0 0 1 12 12"/><circle cx="5" cy="19" r="2"/>',
  cake: '<path d="M4 12h16v8H4Z"/><path d="M4 16h16M8 12V7M12 12V5M16 12V7M7 7c0-2 2-2 2 0M11 5c0-2 2-2 2 0M15 7c0-2 2-2 2 0"/>',
  sort: '<path d="M5 5h14M5 12h10M5 19h6"/><path d="m17 15 3 3-3 3"/>',
  incognito: '<path d="m3 11 2-6h14l2 6M5 11h14v3a3 3 0 0 1-6 0v-1H11v1a3 3 0 0 1-6 0Z"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a3 3 0 0 0-3-2H4Z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a3 3 0 0 1 3-2h6Z"/>',
  sparkle: '<path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5ZM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7Z"/>',
  gift: '<path d="M3 10h18v11H3Z"/><path d="M12 10v11M2 10h20v4H2Z"/><path d="M12 10H7a2 2 0 1 1 2-2c0 2 3 2 3 2ZM12 10h5a2 2 0 1 0-2-2c0 2-3 2-3 2Z"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 6H3v2a4 4 0 0 0 4 4M17 6h4v2a4 4 0 0 1-4 4M12 14v5M8 21h8"/>',
  poll: '<path d="M5 20V10M12 20V4M19 20v-7"/><path d="M3 20h18"/>',
  capsule: '<path d="m4 14 10-10a4 4 0 0 1 6 6L10 20a4 4 0 0 1-6-6Z"/><path d="m7 11 6 6"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="16" r="1"/><circle cx="12" cy="12" r="1"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/><path d="M19 5v4"/>',
  speaker: '<path d="M4 10h4l5-4v12l-5-4H4Z"/><path d="M17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
  terminal: '<path d="m4 6 6 6-6 6M12 18h8"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1.2 1-1.7 1.4-1.7 3.2M12 17h.01"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  fileCheck: '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h4M9 15l2 2 4-4"/>',
  archive: '<path d="M4 7h16v14H4Z"/><path d="M3 3h18v4H3ZM9 12h6"/>',
};
const ikon = isim => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${yollar[isim] || yollar.settings}</svg>`;
const kacir = deger => String(deger ?? '').replace(/[&<>"']/g, k => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[k]));
const kopya = deger => JSON.parse(JSON.stringify(deger));
const sayi = deger => Number(deger || 0).toLocaleString('tr-TR');
const profilTercihleri = new Map();
const hesapAnahtari = () => durum.authMethod === 'discord' && durum.user?.id ? `discord:${durum.user.id}` : durum.username;
const hesapEtiketi = () => durum.authMethod === 'discord' ? 'Discord hesabı' : 'Yönetici hesabı';
const menuOlcegi = deger => typeof deger === 'number' && Number.isFinite(deger) ? Math.min(1.4, Math.max(.8, deger)) : 1;
function profilTercihiniOku() {
  let tercih = profilTercihleri.get(hesapAnahtari());
  if (!tercih) {
    try { tercih = JSON.parse(localStorage.getItem(`dashboard-profile:${hesapAnahtari()}`)); } catch { }
  }
  durum.profile = {
    displayName: typeof tercih?.displayName === 'string' && tercih.displayName.trim() ? tercih.displayName.trim().slice(0, 50) : durum.user?.displayName || durum.username,
    dockScale: menuOlcegi(tercih?.dockScale),
  };
  durum.profileDraft = null;
}
function profilTercihiniKaydet() {
  profilTercihleri.set(hesapAnahtari(), { ...durum.profile });
  try { localStorage.setItem(`dashboard-profile:${hesapAnahtari()}`, JSON.stringify(durum.profile)); return true; }
  catch { return false; }
}
const profilAdi = () => durum.profile?.displayName || durum.username;
const profilHarfleri = () => [...profilAdi()].slice(0, 2).join('').toLocaleUpperCase('tr-TR');
function profilKimliginiUygula() {
  document.querySelectorAll('[data-profile-name]').forEach(el => { el.textContent = profilAdi(); el.title = profilAdi(); });
  document.querySelectorAll('[data-profile-avatar]').forEach(el => { el.innerHTML = profilAvatarIcerigi(); });
  avatarEditorGuncelle();
}
function menuOlceginiUygula(deger) {
  const olcek = menuOlcegi(deger);
  durum.profile.dockScale = olcek;
  document.documentElement.style.setProperty('--dock-scale', String(olcek));
  const yuzde = String(Math.round(olcek * 100));
  const tutamac = document.getElementById('dock-resize');
  if (tutamac) { tutamac.setAttribute('aria-valuenow', yuzde); tutamac.setAttribute('aria-valuetext', `%${yuzde}`); }
  const ayar = document.getElementById('dock-size');
  if (ayar) ayar.value = yuzde;
  const sonuc = document.getElementById('dock-size-value');
  if (sonuc) sonuc.value = `%${yuzde}`;
}
function menuBoyutunuKaydet() {
  const kalici = profilTercihiniKaydet();
  const sonuc = document.getElementById('profile-preference-status');
  if (sonuc) sonuc.textContent = kalici ? 'Menü boyutu kaydedildi.' : 'Tarayıcı kayda izin vermedi. Boyut bu oturumda geçerli.';
  else if (!kalici) bildir('Tarayıcı kayda izin vermedi. Menü boyutu bu oturumda geçerli.', true);
}
function menuBoyutlandirmayiBagla() {
  const tutamac = document.getElementById('dock-resize');
  const menu = document.querySelector('.bottom-dock');
  let surukleme = null;
  const bitir = (olay, iptal = false) => {
    if (!surukleme || (olay?.pointerId !== undefined && olay.pointerId !== surukleme.pointerId)) return;
    const onceki = surukleme; surukleme = null;
    if (iptal) menuOlceginiUygula(onceki.olcek);
    else menuBoyutunuKaydet();
    menu.classList.remove('is-resizing');
    document.documentElement.classList.remove('dock-resizing');
    if (tutamac.hasPointerCapture(onceki.pointerId)) tutamac.releasePointerCapture(onceki.pointerId);
  };
  tutamac.addEventListener('pointerdown', olay => {
    if (!olay.isPrimary || olay.button !== 0 || surukleme) return;
    olay.preventDefault();
    surukleme = { x: olay.clientX, y: olay.clientY, olcek: durum.profile.dockScale, pointerId: olay.pointerId };
    tutamac.setPointerCapture(olay.pointerId); tutamac.focus({ preventScroll: true });
    menu.classList.add('is-resizing'); document.documentElement.classList.add('dock-resizing');
  });
  tutamac.addEventListener('pointermove', olay => {
    if (!surukleme || olay.pointerId !== surukleme.pointerId) return;
    const x = surukleme.x - olay.clientX; const y = surukleme.y - olay.clientY;
    const degisim = Math.abs(x) >= Math.abs(y) ? x : y;
    menuOlceginiUygula(surukleme.olcek + degisim / 300);
  });
  tutamac.addEventListener('pointerup', olay => bitir(olay));
  tutamac.addEventListener('pointercancel', olay => bitir(olay, true));
  tutamac.addEventListener('lostpointercapture', olay => bitir(olay, true));
  tutamac.addEventListener('keydown', olay => {
    if (olay.key === 'Escape' && surukleme) { olay.preventDefault(); bitir(null, true); return; }
    const yon = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[olay.key];
    if (!yon && !['Home', 'End'].includes(olay.key)) return;
    olay.preventDefault();
    menuOlceginiUygula(olay.key === 'Home' ? .8 : olay.key === 'End' ? 1.4 : durum.profile.dockScale + yon * .05);
    menuBoyutunuKaydet();
  });
  tutamac.addEventListener('dblclick', () => { menuOlceginiUygula(1); menuBoyutunuKaydet(); });
  menuOlceginiUygula(durum.profile.dockScale);
}
function menuGorunumunuBagla() {
  const menu = document.getElementById('bottom-dock');
  const avatar = document.getElementById('dock-toggle');
  const gorunumuDegistir = kucuk => {
    menu.classList.toggle('is-minimized', kucuk);
    avatar.setAttribute('aria-label', kucuk ? 'Alt menüyü genişlet' : 'Profili aç');
    if (kucuk) {
      avatar.setAttribute('aria-expanded', 'false');
      avatar.setAttribute('aria-controls', 'bottom-dock');
    } else {
      avatar.removeAttribute('aria-expanded');
      avatar.removeAttribute('aria-controls');
    }
    avatar.focus({ preventScroll: true });
  };
  document.getElementById('dock-minimize').addEventListener('click', () => gorunumuDegistir(true));
  avatar.addEventListener('click', () => menu.classList.contains('is-minimized') ? gorunumuDegistir(false) : git('profile'));
}
const grafikTurleri = [
  ['donut', 'Halka'],
  ['pie', 'Pasta'],
  ['bar', 'Çubuk'],
  ['line', 'Çizgi'],
  ['radar', 'Radar'],
  ['horizontal-bar', 'Yatay çubuk'],
  ['polar', 'Kutupsal'],
];
const grafikRenkleri = ['var(--accent)', 'var(--chart-bots)', 'var(--chart-offline)'];
const grafikEtiketleri = ['Çevrimiçi', 'Botlar', 'Çevrimdışı'];
const grafikTercihleri = new Map();
function grafikTercihi(guildId) {
  if (grafikTercihleri.has(guildId)) return grafikTercihleri.get(guildId);
  try {
    const secim = localStorage.getItem(`member-chart:${guildId}`);
    if (secim === 'area') { grafikTercihiniKaydet(guildId, 'radar'); return 'radar'; }
    return grafikTurleri.some(([id]) => id === secim) ? secim : grafikTurleri[0][0];
  } catch { return grafikTurleri[0][0]; }
}
function grafikTercihiniKaydet(guildId, secim) {
  if (!grafikTurleri.some(([id]) => id === secim)) return;
  grafikTercihleri.set(guildId, secim);
  try { localStorage.setItem(`member-chart:${guildId}`, secim); grafikTercihleri.delete(guildId); } catch { }
}
function kutupsalNokta(merkez, yaricap, aci) {
  const radyan = (aci - 90) * Math.PI / 180;
  return { x: merkez + yaricap * Math.cos(radyan), y: merkez + yaricap * Math.sin(radyan) };
}
function grafikSvg(tur, degerler) {
  const toplam = degerler.reduce((a, b) => a + b, 0);
  if (!toplam) return '<div class="chart-empty">Önbellekte üye verisi yok</div>';
  if (tur === 'donut') {
    const cevre = 2 * Math.PI * 50;
    let ofset = 0;
    const halkalar = degerler.map((deger, i) => {
      if (!deger) return '';
      const uzunluk = (deger / toplam) * cevre; const sonuc = `<circle data-member-segment="${i}" cx="60" cy="60" r="50" stroke="${grafikRenkleri[i]}" stroke-dasharray="${uzunluk} ${cevre - uzunluk}" stroke-dashoffset="${-ofset}"/>`;
      ofset += uzunluk; return sonuc;
    }).join('');
    return `<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="chart-track" cx="60" cy="60" r="50"/><g transform="rotate(-90 60 60)">${halkalar}</g></svg>`;
  }
  if (tur === 'pie') {
    let aci = 0;
    const dilimler = degerler.map((deger, i) => {
      const sonraki = aci + deger / toplam * 360; const bas = kutupsalNokta(60, 52, aci); const son = kutupsalNokta(60, 52, sonraki);
      const yol = deger <= 0 ? '' : deger >= toplam ? `<circle data-member-segment="${i}" cx="60" cy="60" r="52" fill="${grafikRenkleri[i]}"/>` : `<path data-member-segment="${i}" d="M60 60L${bas.x.toFixed(2)} ${bas.y.toFixed(2)}A52 52 0 ${sonraki - aci > 180 ? 1 : 0} 1 ${son.x.toFixed(2)} ${son.y.toFixed(2)}Z" fill="${grafikRenkleri[i]}"/>`;
      aci = sonraki; return yol;
    }).join('');
    return `<svg viewBox="0 0 120 120" aria-hidden="true" class="chart-pie">${dilimler}</svg>`;
  }
  const enYuksek = Math.max(...degerler, 1);
  if (tur === 'polar') {
    const izgara = [.25, .5, .75, 1].map(oran => `<circle class="chart-polar-grid" cx="60" cy="60" r="${52 * oran}"/>`).join('');
    const dilimler = degerler.map((deger, i) => {
      if (!deger) return '';
      const yaricap = 52 * Math.sqrt(deger / enYuksek);
      const bas = kutupsalNokta(60, yaricap, i * 120); const son = kutupsalNokta(60, yaricap, (i + 1) * 120);
      return `<path data-member-segment="${i}" class="chart-polar-sector" d="M60 60L${bas.x.toFixed(2)} ${bas.y.toFixed(2)}A${yaricap.toFixed(2)} ${yaricap.toFixed(2)} 0 0 1 ${son.x.toFixed(2)} ${son.y.toFixed(2)}Z" fill="${grafikRenkleri[i]}"/>`;
    }).join('');
    return `<svg viewBox="0 0 120 120" aria-hidden="true" class="chart-polar">${izgara}${dilimler}</svg>`;
  }
  if (tur === 'horizontal-bar') {
    const cubuklar = degerler.map((deger, i) => {
      const y = 20 + i * 54;
      return `<text x="16" y="${y}">${grafikEtiketleri[i]}</text><text class="chart-value" x="228" y="${y}" text-anchor="end">${sayi(deger)}</text><rect class="chart-bar-track" x="16" y="${y + 9}" width="212" height="16" rx="4"/><rect class="chart-bar" x="16" y="${y + 9}" width="${deger / enYuksek * 212}" height="16" rx="4" fill="${grafikRenkleri[i]}"/>`;
    }).join('');
    return `<svg viewBox="0 0 244 170" aria-hidden="true" class="chart-cartesian">${cubuklar}</svg>`;
  }
  if (tur === 'radar') {
    const nokta = (i, oran) => { const p = kutupsalNokta(100, 60 * oran, i * 120); return { x: p.x + 22, y: p.y }; };
    const noktalar = oranlar => oranlar.map((oran, i) => { const p = nokta(i, oran); return `${p.x.toFixed(2)},${p.y.toFixed(2)}`; }).join(' ');
    const izgara = [.25, .5, .75, 1].map(oran => `<polygon class="chart-radar-grid" points="${noktalar(degerler.map(() => oran))}"/>`).join('');
    const eksenler = degerler.map((_, i) => { const p = nokta(i, 1); return `<line class="chart-axis" x1="122" y1="100" x2="${p.x}" y2="${p.y}"/>`; }).join('');
    const konumlar = [{ x: 122, y: 16 }, { x: 205, y: 153 }, { x: 39, y: 153 }];
    const etiketler = degerler.map((deger, i) => { const p = konumlar[i]; return `<text x="${p.x}" y="${p.y}" text-anchor="middle">${grafikEtiketleri[i]}</text><text class="chart-value" x="${p.x}" y="${p.y + 15}" text-anchor="middle">${sayi(deger)}</text>`; }).join('');
    const isaretler = degerler.map((deger, i) => { const p = nokta(i, deger / enYuksek); return `<circle class="chart-point" cx="${p.x}" cy="${p.y}" r="4" fill="${grafikRenkleri[i]}"/>`; }).join('');
    return `<svg viewBox="0 0 244 184" aria-hidden="true" class="chart-radar">${izgara}${eksenler}<polygon class="chart-radar-shape" points="${noktalar(degerler.map(deger => deger / enYuksek))}"/>${isaretler}${etiketler}</svg>`;
  }
  const taban = 132; const grafikYuksekligi = 105;
  const xler = degerler.map((_, i) => 44 + i * 78);
  const yler = degerler.map(deger => taban - (deger / enYuksek) * grafikYuksekligi);
  const etiketler = degerler.map((_, i) => `<text x="${xler[i]}" y="157" text-anchor="middle">${grafikEtiketleri[i]}</text>`).join('');
  const tabanCizgisi = '<line class="chart-axis" x1="16" y1="132" x2="228" y2="132"/>';
  if (tur === 'bar') {
    const cubuklar = degerler.map((deger, i) => { const yukseklik = (deger / enYuksek) * grafikYuksekligi; return `<rect class="chart-bar" x="${xler[i] - 17}" y="${taban - yukseklik}" width="34" height="${yukseklik}" rx="5" fill="${grafikRenkleri[i]}"/><text class="chart-value" x="${xler[i]}" y="${taban - yukseklik - 8}" text-anchor="middle">${sayi(deger)}</text>`; }).join('');
    return `<svg viewBox="0 0 244 170" aria-hidden="true" class="chart-cartesian">${tabanCizgisi}${cubuklar}${etiketler}</svg>`;
  }
  const noktalar = yler.map((y, i) => `${xler[i]},${y.toFixed(2)}`).join(' ');
  const noktalarSvg = degerler.map((deger, i) => `<circle class="chart-point" cx="${xler[i]}" cy="${yler[i]}" r="4" fill="${grafikRenkleri[i]}"/><text class="chart-value" x="${xler[i]}" y="${yler[i] - 10}" text-anchor="middle">${sayi(deger)}</text>`).join('');
  return `<svg viewBox="0 0 244 170" aria-hidden="true" class="chart-cartesian">${tabanCizgisi}<polyline class="chart-line" points="${noktalar}"/>${noktalarSvg}${etiketler}</svg>`;
}
function grafikGorunumu(tur, degerler, toplamUye) {
  const ad = grafikTurleri.find(([id]) => id === tur)?.[1] || grafikTurleri[0][1];
  const toplam = degerler.reduce((a, b) => a + b, 0);
  const merkez = tur === 'donut' && toplam ? `<div class="donut-center"><strong>${sayi(toplam)}</strong><span>önbellekteki üye</span></div>` : '';
  const aciklama = toplam ? degerler.map((deger, i) => `${grafikEtiketleri[i]}: ${sayi(deger)}`).join(', ') : 'Önbellekte üye verisi yok';
  const bilgi = toplam && ['donut', 'pie', 'polar'].includes(tur) ? '<div class="chart-tooltip" role="tooltip" hidden></div>' : '';
  return `<div class="member-chart member-chart-${kacir(tur)}" data-member-chart role="img" aria-label="${kacir(ad)} görünümünde önbellekteki üye dağılımı. ${kacir(aciklama)}. Sunucuda toplam ${sayi(toplamUye)} üye." aria-describedby="member-chart-note">${grafikSvg(tur, degerler)}${merkez}${bilgi}</div>`;
}
function grafikBilgisiniBagla(degerler) {
  const grafik = document.querySelector('[data-member-chart]');
  const bilgi = grafik?.querySelector('.chart-tooltip');
  if (!bilgi) return;
  const toplam = degerler.reduce((a, b) => a + b, 0);
  const gizle = () => { bilgi.hidden = true; };
  const goster = olay => {
    const dilim = olay.target.closest('[data-member-segment]');
    if (!dilim) { gizle(); return; }
    const i = Number(dilim.dataset.memberSegment);
    if (bilgi.dataset.segment !== String(i)) {
      const oran = (degerler[i] / toplam * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
      bilgi.innerHTML = `<span class="chart-tooltip-label">${kacir(grafikEtiketleri[i])}</span><div class="chart-tooltip-values"><strong>${sayi(degerler[i])} üye</strong><span>%${oran}</span></div>`;
      bilgi.style.setProperty('--tooltip-color', grafikRenkleri[i]);
      bilgi.dataset.segment = String(i);
    }
    bilgi.hidden = false;
    const sinir = grafik.getBoundingClientRect();
    const x = olay.clientX - sinir.left; const y = olay.clientY - sinir.top;
    const genislik = bilgi.offsetWidth; const yukseklik = bilgi.offsetHeight;
    const sol = x + genislik + 12 <= sinir.width - 8 ? x + 12 : x - genislik - 12;
    const ust = y + yukseklik + 12 <= sinir.height - 8 ? y + 12 : y - yukseklik - 12;
    bilgi.style.left = `${Math.max(8, Math.min(sol, sinir.width - genislik - 8))}px`;
    bilgi.style.top = `${Math.max(8, Math.min(ust, sinir.height - yukseklik - 8))}px`;
  };
  grafik.addEventListener('pointerover', goster);
  grafik.addEventListener('pointermove', goster);
  grafik.addEventListener('pointerleave', gizle);
  grafik.addEventListener('pointercancel', gizle);
}
function botKimliginiUygula(bot) {
  durum.bot = { name: bot?.name || 'Bot', avatarUrl: bot?.avatarUrl || null };
  document.title = `${durum.bot.name}`;
  document.querySelector('meta[name="description"]').content = `${durum.bot.name} için sunucu yönetim paneli.`;
  const favicon = document.getElementById('bot-favicon');
  favicon.href = durum.bot.avatarUrl || '/favicon.svg';
  if (durum.bot.avatarUrl) favicon.removeAttribute('type');
  else favicon.type = 'image/svg+xml';
}
const marka = () => `<div class="brand"><span class="brand-mark" aria-hidden="true">${kacir([...durum.bot.name][0].toLocaleUpperCase('tr-TR'))}${durum.bot.avatarUrl ? `<img class="brand-avatar" src="${kacir(durum.bot.avatarUrl)}" alt="" width="40" height="40">` : ''}</span><div class="brand-copy"><div class="brand-name" title="${kacir(durum.bot.name)}">${kacir(durum.bot.name)}</div><div class="brand-caption">YÖNETİM MERKEZİ</div></div></div>`;
function sunucuAdasi() {
  const sunucu = durum.guilds.find(g => g.id === durum.guildId);
  return `<div class="island-anchor"><div class="dynamic-island" id="server-island">
    <button type="button" class="island-trigger" id="island-toggle" aria-label="Sunucu seç: ${kacir(sunucu?.name || 'Sunucu bulunamadı')}" aria-haspopup="listbox" aria-expanded="false" aria-controls="island-guilds" ${sunucu ? '' : 'disabled'}>
      <span class="brand-mark island-avatar" aria-hidden="true">${kacir([...durum.bot.name][0].toLocaleUpperCase('tr-TR'))}${durum.bot.avatarUrl ? `<img class="brand-avatar" src="${kacir(durum.bot.avatarUrl)}" alt="" width="40" height="40">` : ''}</span>
      <span class="island-divider" aria-hidden="true"></span><span class="island-copy"><span class="island-bot-name">${kacir(durum.bot.name)}</span><span class="island-guild-name" id="island-guild-name" title="${kacir(sunucu?.name || '')}">${kacir(sunucu?.name || 'Sunucu bulunamadı')}</span></span>
      <span class="island-chevron" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg></span>
    </button>
    <div class="island-menu-shell" id="island-menu-shell" inert><div class="island-menu">
      <div class="island-menu-heading"><span>SUNUCULARINIZ</span><span>${sayi(durum.guilds.length)}</span></div>
      <div class="island-guilds" id="island-guilds" role="listbox" aria-label="Sunucularınız">${durum.guilds.map(g => `<button type="button" class="island-option" role="option" aria-selected="${g.id === durum.guildId}" data-guild-id="${kacir(g.id)}" tabindex="-1"><span class="island-server-icon" aria-hidden="true">${ikon('server')}</span><span class="island-option-name">${kacir(g.name)}</span><span class="island-selected" aria-hidden="true">${ikon('check')}</span></button>`).join('')}</div>
    </div></div>
    <select id="guild" aria-label="Sunucu seç" hidden>${durum.guilds.map(g => `<option value="${kacir(g.id)}" ${g.id === durum.guildId ? 'selected' : ''}>${kacir(g.name)}</option>`).join('')}</select>
  </div><button type="button" class="island-minimize" id="island-minimize" aria-label="Paneli küçült" title="Paneli küçült" aria-controls="server-island"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>`;
}
function sunucuAdasiniBagla() {
  const ada = document.getElementById('server-island');
  const cerceve = ada.parentElement;
  const kucult = document.getElementById('island-minimize');
  const dugme = document.getElementById('island-toggle');
  const menu = document.getElementById('island-menu-shell');
  const liste = document.getElementById('island-guilds');
  const secim = document.getElementById('guild');
  const secenekler = [...ada.querySelectorAll('[data-guild-id]')];
  const kucukMu = () => cerceve.classList.contains('is-minimized');
  const acikMi = () => dugme.getAttribute('aria-expanded') === 'true';
  const kapat = (odakla = false) => {
    if (odakla) dugme.focus({ preventScroll: true });
    dugme.setAttribute('aria-expanded', 'false'); ada.classList.remove('is-open'); menu.inert = true;
  };
  const ac = (index = secenekler.findIndex(el => el.dataset.guildId === durum.guildId)) => {
    if (kucukMu() || !secenekler.length) return;
    dugme.setAttribute('aria-expanded', 'true'); ada.classList.add('is-open'); menu.inert = false;
    const secenek = secenekler[Math.max(0, index)];
    secenek.focus({ preventScroll: true });
    liste.scrollTop = secenek.offsetTop - liste.offsetTop;
  };
  const gorunumuDegistir = kucuk => {
    kapat();
    cerceve.classList.toggle('is-minimized', kucuk);
    kucult.hidden = kucuk;
    dugme.disabled = !kucuk && !secenekler.length;
    dugme.setAttribute('aria-label', kucuk ? 'Paneli genişlet' : `Sunucu seç: ${document.getElementById('island-guild-name').textContent}`);
    if (kucuk) {
      dugme.removeAttribute('aria-haspopup');
      dugme.removeAttribute('aria-controls');
    } else {
      dugme.setAttribute('aria-haspopup', 'listbox');
      dugme.setAttribute('aria-controls', 'island-guilds');
    }
    (dugme.disabled ? kucult : dugme).focus({ preventScroll: true });
  };
  kucult.addEventListener('click', () => gorunumuDegistir(true));
  dugme.addEventListener('click', () => kucukMu() ? gorunumuDegistir(false) : acikMi() ? kapat() : ac());
  ada.addEventListener('keydown', olay => {
    if (kucukMu()) return;
    if (olay.key === 'Escape' && acikMi()) { olay.preventDefault(); kapat(true); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(olay.key)) return;
    olay.preventDefault();
    if (!acikMi()) { ac(olay.key === 'ArrowUp' || olay.key === 'End' ? secenekler.length - 1 : undefined); return; }
    const index = secenekler.indexOf(document.activeElement);
    const sonraki = olay.key === 'Home' ? 0 : olay.key === 'End' ? secenekler.length - 1 : (index + (olay.key === 'ArrowDown' ? 1 : -1) + secenekler.length) % secenekler.length;
    secenekler[sonraki]?.focus({ preventScroll: true });
    secenekler[sonraki]?.scrollIntoView({ block: 'nearest' });
  });
  secenekler.forEach(el => el.addEventListener('click', () => {
    kapat(true);
    if (secim.value === el.dataset.guildId) return;
    secim.value = el.dataset.guildId; secim.dispatchEvent(new Event('change', { bubbles: true }));
  }));
  secim.addEventListener('change', () => {
    const sunucu = durum.guilds.find(g => g.id === secim.value);
    const ad = sunucu?.name || 'Sunucu bulunamadı';
    document.getElementById('island-guild-name').textContent = ad;
    document.getElementById('island-guild-name').title = ad;
    dugme.setAttribute('aria-label', kucukMu() ? 'Paneli genişlet' : `Sunucu seç: ${ad}`);
    secenekler.forEach(el => el.setAttribute('aria-selected', String(el.dataset.guildId === secim.value)));
    kapat();
  });
  ada.addEventListener('focusout', olay => { if (!ada.contains(olay.relatedTarget)) kapat(); });
  ada.closest('.layout').addEventListener('pointerdown', olay => {
    if (acikMi() && !ada.contains(olay.target)) kapat(ada.contains(document.activeElement));
  });
}
kok.addEventListener('error', olay => {
  if (olay.target.matches?.('.brand-avatar, .user-avatar-image')) olay.target.remove();
}, true);
const kategoriler = [['Sunucu Yönetimi', 'server'], ['Güvenlik ve Moderasyon', 'shield'], ['Ses Sistemleri', 'voice'], ['Seviye', 'chart'], ['Boost', 'bolt'], ['Abonelik', 'users'], ['Bildirimler', 'bell'], ['Üye Verileri', 'heart'], ['Eğlence ve Etkileşim', 'game'], ['Sistem', 'settings'], ['Yedek', 'backup'], ['Genel Ayarlar', 'settings']];
const yanPanelGruplari = [['Yönetim', [0, 1, 2]], ['Topluluk', [3, 4, 5, 6, 7, 8]], ['Altyapı', [9, 10]]];
const yanPanelTercihleri = new Map();
const yanPanelTercihAnahtari = () => `dashboard-sidebar:${hesapAnahtari()}:${durum.guildId}`;
function yanPanelTercihi() {
  const anahtar = yanPanelTercihAnahtari();
  if (!yanPanelTercihleri.has(anahtar)) {
    let veri;
    try { veri = JSON.parse(localStorage.getItem(anahtar)); } catch { }
    yanPanelTercihleri.set(anahtar, {
      kapali: Array.isArray(veri?.kapali) ? veri.kapali.filter(i => Number.isInteger(i) && yanPanelGruplari[i]) : [],
      son: Array.isArray(veri?.son) ? [...new Set(veri.son)].filter(id => durum.registry.some(m => m.id === id)).slice(0, 3) : [],
      sonKucuk: veri?.sonKucuk === true,
    });
  }
  return yanPanelTercihleri.get(anahtar);
}
function yanPanelTercihiniKaydet() {
  try { localStorage.setItem(yanPanelTercihAnahtari(), JSON.stringify(yanPanelTercihi())); } catch { }
}
function yanPanel() {
  return `<div class="nav-scroll">
    <header class="sidebar-heading"><div class="sidebar-module-mark" aria-hidden="true"><svg viewBox="0 0 72 72" fill="none" focusable="false"><path class="module-mark-base" d="m12 43 22-13a4 4 0 0 1 4 0l22 13a2 2 0 0 1 0 4L38 60a4 4 0 0 1-4 0L12 47a2 2 0 0 1 0-4Z"/><path class="module-mark-middle" d="m12 33 22-13a4 4 0 0 1 4 0l22 13a2 2 0 0 1 0 4L38 50a4 4 0 0 1-4 0L12 37a2 2 0 0 1 0-4Z"/><path class="module-mark-top" d="m12 23 22-13a4 4 0 0 1 4 0l22 13a2 2 0 0 1 0 4L38 40a4 4 0 0 1-4 0L12 27a2 2 0 0 1 0-4Z"/><path class="module-mark-seams" d="m24 17 24 16m-24 0 24-16"/><path class="module-mark-edge" d="m12 27 22 13a4 4 0 0 0 4 0l22-13"/></svg></div><span class="sidebar-eyebrow">MODÜL ALANI</span><h2>Modüller<span>.</span></h2><p>Tüm sistemler, tek yörüngede.</p></header>
    <div class="sidebar-search-wrap">${ikon('search')}<input id="sidebar-search" type="search" placeholder="Modül bul…" aria-label="Modüllerde hızlı ara" aria-controls="sidebar-results" autocomplete="off" spellcheck="false"><kbd aria-hidden="true">/</kbd></div>
    <nav id="sidebar-navigation" aria-label="Sunucu ayarları">${yanPanelGruplari.map(([ad, indexler], grup) => `<details class="sidebar-group" data-sidebar-group="${grup}" ${yanPanelTercihi().kapali.includes(grup) ? '' : 'open'}><summary class="sidebar-group-title"><span>${kacir(ad)}</span><svg class="icon sidebar-group-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></summary><div class="sidebar-group-links">${indexler.map(index => {
      const [ad, simge] = kategoriler[index]; const toplam = durum.registry.filter(m => m.category === ad).length;
      return `<button type="button" class="nav-link" data-route="category:${index}"><span class="nav-icon">${ikon(simge)}</span><span class="nav-copy">${kacir(ad)}</span><span class="nav-count" aria-label="${toplam} modül">${String(toplam).padStart(2, '0')}</span></button>`;
    }).join('')}</div></details>`).join('')}</nav>
    <section id="sidebar-results" class="sidebar-results" aria-label="Modül arama sonuçları" hidden><p id="sidebar-search-count" role="status"></p><div id="sidebar-search-list"></div></section>
    <section class="sidebar-recents" aria-labelledby="sidebar-recents-title"><div class="sidebar-recents-head"><h3><button type="button" id="sidebar-recents-toggle" aria-expanded="true" aria-controls="sidebar-recent-list" aria-label="Son kullanılanları küçült" title="Son kullanılanları küçült"><span class="sidebar-recents-icon" aria-hidden="true">${ikon('clock')}</span><span id="sidebar-recents-title">Son kullanılanlar</span><svg class="icon sidebar-recents-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button></h3><button type="button" id="sidebar-recents-clear" title="Bu sunucudaki modül geçmişini temizle">Temizle</button></div><div id="sidebar-recent-list"></div></section>
    <div class="sidebar-footer-note"><span>${ikon('grid')} ${sayi(durum.registry.length)} modül</span></div>
  </div>`;
}
function sonModulleriGoster() {
  const liste = document.getElementById('sidebar-recent-list'); if (!liste) return;
  const kucuk = yanPanelTercihi().sonKucuk;
  const dugme = document.getElementById('sidebar-recents-toggle');
  liste.closest('.sidebar-recents').classList.toggle('is-minimized', kucuk);
  liste.hidden = kucuk;
  dugme.setAttribute('aria-expanded', String(!kucuk));
  dugme.setAttribute('aria-label', kucuk ? 'Son kullanılanları genişlet' : 'Son kullanılanları küçült');
  dugme.title = dugme.getAttribute('aria-label');
  document.getElementById('sidebar-recents-clear').hidden = kucuk;
  const moduller = yanPanelTercihi().son.map(id => durum.registry.find(m => m.id === id)).filter(Boolean);
  liste.innerHTML = moduller.length ? moduller.map(m => `<button type="button" class="sidebar-recent-item" data-recent-module="${kacir(m.id)}" title="${kacir(m.label)}">${ikon(modulIkon(m))}<span>${kacir(m.label)}</span>${ikon('arrow')}</button>`).join('') : '<p class="sidebar-recents-empty"><strong>Kaldığın yere kolayca dön.</strong>Açtığın son 3 modül burada görünür.</p>';
  document.getElementById('sidebar-recents-clear').disabled = !moduller.length;
}
function yanPanelGruplariniUygula() {
  const kapali = yanPanelTercihi().kapali;
  document.querySelectorAll('[data-sidebar-group]').forEach(el => { el.open = !kapali.includes(Number(el.dataset.sidebarGroup)); });
}
function yanPanelGruplariniKaydet() {
  yanPanelTercihi().kapali = [...document.querySelectorAll('[data-sidebar-group]')].filter(grup => !grup.open).map(grup => Number(grup.dataset.sidebarGroup));
  yanPanelTercihiniKaydet();
}
function yanPanelGezinmesiniBagla() {
  document.querySelectorAll('[data-sidebar-group]').forEach(el => el.querySelector('summary').addEventListener('click', olay => {
    olay.preventDefault(); el.open = !el.open; yanPanelGruplariniKaydet();
  }));
  document.getElementById('sidebar-recent-list').addEventListener('click', olay => {
    const dugme = olay.target.closest('[data-recent-module]'); if (dugme) {
      const arama = document.getElementById('sidebar-search'); arama.value = ''; arama.dispatchEvent(new Event('input'));
      git(dugme.dataset.recentModule);
    }
  });
  document.getElementById('sidebar-recents-clear').addEventListener('click', () => {
    yanPanelTercihi().son = []; yanPanelTercihiniKaydet(); sonModulleriGoster();
  });
  document.getElementById('sidebar-recents-toggle').addEventListener('click', () => {
    yanPanelTercihi().sonKucuk = !yanPanelTercihi().sonKucuk;
    yanPanelTercihiniKaydet(); sonModulleriGoster();
  });
  sonModulleriGoster();
}
const aramaMetni = metin => String(metin).toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
function yanPanelAramasiniBagla() {
  const arama = document.getElementById('sidebar-search');
  const guncelle = () => {
    const sorgu = aramaMetni(arama.value.trim());
    document.getElementById('sidebar-navigation').hidden = !!sorgu;
    document.getElementById('sidebar-results').hidden = !sorgu;
    if (!sorgu) return;
    const sonuclar = durum.registry.filter(m => aramaMetni(`${m.label} ${m.category} ${m.command || ''} ${m.description}`).includes(sorgu));
    document.getElementById('sidebar-search-count').textContent = `${sayi(sonuclar.length)} modül bulundu`;
    document.getElementById('sidebar-search-list').innerHTML = sonuclar.length ? sonuclar.map(m => `<button type="button" class="sidebar-result" data-sidebar-module="${kacir(m.id)}"><span class="nav-icon">${ikon(modulIkon(m))}</span><span><strong>${kacir(m.label)}</strong><small>${kacir(m.category)}</small></span>${ikon('arrow')}</button>`).join('') : '<p class="sidebar-search-empty">Başka bir modül adı veya kategori deneyin.</p>';
  };
  arama.addEventListener('input', guncelle);
  arama.addEventListener('keydown', olay => {
    if (olay.key === 'Escape' && arama.value) { olay.preventDefault(); olay.stopPropagation(); arama.value = ''; guncelle(); }
    if (olay.key === 'Enter' && arama.value.trim()) { olay.preventDefault(); document.querySelector('[data-sidebar-module]')?.click(); }
  });
  document.getElementById('sidebar-results').addEventListener('click', olay => {
    const dugme = olay.target.closest('[data-sidebar-module]'); if (!dugme) return;
    arama.value = ''; guncelle(); git(dugme.dataset.sidebarModule);
  });
}
document.addEventListener('keydown', olay => {
  const panel = document.getElementById('sidebar'); if (!panel || document.querySelector('dialog[open]')) return;
  if (olay.key === '/' && !olay.ctrlKey && !olay.metaKey && !olay.altKey && !olay.target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) {
    olay.preventDefault();
    if (matchMedia('(max-width:650px)').matches) { panel.classList.add('open'); document.getElementById('mobile-menu').setAttribute('aria-expanded', 'true'); }
    document.getElementById('sidebar-search').focus();
  }
  if (olay.key === 'Escape' && panel.classList.contains('open')) {
    panel.classList.remove('open'); document.getElementById('mobile-menu').setAttribute('aria-expanded', 'false'); document.getElementById('mobile-menu').focus();
  }
});
const modulIkon = modul => ({
  starboard: 'star', 'giris-cikis': 'door', seviye: 'trendUp', itiraf: 'mask', 'oto-publish': 'broadcast', 'ghost-ping': 'ghost',
  'durum-rol': 'tag', 'oto-thread': 'thread', 'sureli-mesaj': 'clock', 'mesaja-emoji': 'smile', 'medya-görsel': 'image', 'medya-video': 'video',
  'alinti-rol': 'quote', 'yedek-plani': 'calendar', automod: 'shield', ban: 'ban', forceban: 'gavel', kick: 'personDown', 'nickname-degistir': 'userEdit',
  'rol-ver': 'userPlus', 'rol-al': 'userMinus', 'toplu-rol': 'users', timeout: 'hourglass', temizle: 'broom', yavasmod: 'turtle', 'kanal-kilitle': 'lock',
  nuke: 'bomb', uyari: 'warning', 'aktif-uye': 'chart', burc: 'zodiac', 'emoji-ekle': 'palette', sticky: 'pin', yonlendirme: 'route', 'clan-tag': 'hashTag',
  'emoji-rol': 'reaction', destek: 'headset', 'ses-panelleri': 'sliders', honeypot: 'trap', audit: 'clipboard', boost: 'rocket', youtube: 'youtube', haber: 'rss',
  'dogum-gunu': 'cake', 'eski-yeni': 'sort', anonim: 'incognito', ani: 'book', iltifat: 'sparkle', oyunlar: 'game', cekilis: 'gift', 'oy-yarismasi': 'trophy',
  'oylama-baslat': 'poll', 'zaman-kapsulu': 'capsule', 'random-medya': 'dice', 'temp-voice': 'mic', 'ses-kanali': 'speaker', 'bot-log': 'terminal',
  yardim: 'help', abonelik: 'card', 'yetkili-basvuru': 'fileCheck', yedek: 'archive', genel: 'settings',
}[modul.id] || kategoriler.find(k => k[0] === modul.category)?.[1] || 'settings');
const modulTonu = modul => ({ 'Güvenlik ve Moderasyon': 'rose', 'Ses Sistemleri': 'sky', Seviye: 'amber', Boost: 'rose', Abonelik: 'mint', Bildirimler: 'amber', 'Üye Verileri': 'mint', 'Eğlence ve Etkileşim': 'sky', Sistem: 'slate', Yedek: 'mint', 'Genel Ayarlar': 'slate' }[modul.category] || 'accent');
function modulMotifi(simge) {
  return `<span class="module-motif" aria-hidden="true">${modulKartIkonu(simge)}</span>`;
}
const etiket = () => '<span class="badge ready">Bağlı</span>';
function sistemEtiketi(id) {
  const aktif = durum.moduleStatuses[id];
  const sinif = aktif === true ? 'system-active' : aktif === false ? 'system-inactive' : 'system-unknown';
  const metin = aktif === true ? 'Sistem Aktif' : aktif === false ? 'Sistem Pasif' : aktif === null ? 'Durum alınamadı' : 'Kontrol ediliyor';
  return `<span class="badge system-status ${sinif}" data-system-status="${kacir(id)}">${metin}</span>`;
}
async function modulDurumlariniYukle() {
  const guildId = durum.guildId; const navigation = durum.navigation;
  let statuses;
  try { statuses = await api(`/guilds/${guildId}/module-statuses`); }
  catch { statuses = Object.fromEntries(durum.registry.map(m => [m.id, null])); }
  if (guildId !== durum.guildId || navigation !== durum.navigation) return;
  durum.moduleStatuses = statuses;
  document.querySelectorAll('[data-system-status]').forEach(el => { el.outerHTML = sistemEtiketi(el.dataset.systemStatus); });
  document.getElementById('module-filter')?.dispatchEvent(new Event('change'));
}
function bildir(mesaj, hata = false) {
  const alan = document.getElementById('toast'); alan.textContent = mesaj; alan.className = `toast${hata ? ' error' : ''}`; alan.hidden = false;
  clearTimeout(bildir.timer); bildir.timer = setTimeout(() => { alan.hidden = true; }, 5500);
}
async function api(yol, method = 'GET', body) {
  const yanit = await fetch(`/api${yol}`, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': durum.csrf }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const veri = await yanit.json().catch(() => ({ error: 'Sunucudan yanıt alınamadı.' }));
  if (!yanit.ok) { const hata = new Error(veri.error || 'İşlem tamamlanamadı.'); hata.status = yanit.status; throw hata; }
  return veri;
}
const temaDugmesi = (ekSinif = '') => `<button type="button" class="icon-button theme-trigger ${ekSinif}" data-theme-open aria-label="Tema ve görünüm ayarları" aria-haspopup="dialog" aria-controls="theme-dialog" title="Tema ve görünüm"><span class="theme-symbol" aria-hidden="true"></span></button>`;
const discordLogosu = () => '<svg class="discord-logo" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.3 4.4a19.8 19.8 0 0 0-4.9-1.5l-.6 1.3a18.3 18.3 0 0 0-5.6 0l-.6-1.3a19.5 19.5 0 0 0-4.9 1.5C.6 9 .1 13.5.4 17.9a19.8 19.8 0 0 0 6 3l1.2-2a12.8 12.8 0 0 1-1.9-.9l.5-.4a14.1 14.1 0 0 0 11.6 0l.5.4-1.9.9 1.2 2a19.8 19.8 0 0 0 6-3c.4-5.1-.8-9.6-3.3-13.5ZM8.2 15.2c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Zm7.6 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Z"/></svg>';
function discordGirisDugmesi(ekSinif = '') {
  const icerik = `${discordLogosu()}<span>Discord ile giriş yap</span>`;
  return durum.auth.discordEnabled
    ? `<a class="btn discord-login ${ekSinif}" href="/auth/discord">${icerik}</a>`
    : `<button class="btn discord-login ${ekSinif}" type="button" disabled aria-describedby="discord-configuration">${icerik}</button>`;
}
function oturumuUygula(oturum) {
  durum.csrf = oturum.csrf;
  durum.username = oturum.username || '';
  durum.user = oturum.user || null;
  durum.authMethod = oturum.authMethod || (oturum.authenticated ? 'local' : '');
  if (oturum.auth) durum.auth = oturum.auth;
  botKimliginiUygula(oturum.bot);
}
function oauthHatasiniOku() {
  const adres = new URL(location.href);
  if (!adres.searchParams.has('auth_error')) return '';
  const kod = adres.searchParams.get('auth_error');
  adres.searchParams.delete('auth_error');
  history.replaceState(null, '', adres.pathname + adres.search + adres.hash);
  const mesajlar = {
    denied: 'Discord ile giriş izni verilmedi. Devam etmek için yeniden giriş yapın ve erişime izin verin.',
    state: 'Giriş isteği doğrulanamadı. Bu sayfadan Discord ile girişi yeniden başlatın.',
    expired: 'Discord giriş isteğinin süresi doldu. Lütfen yeniden giriş yapın.',
    failed: 'Discord ile giriş tamamlanamadı. Lütfen tekrar deneyin.',
    unavailable: 'Discord ile giriş şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.',
  };
  return mesajlar[kod] || mesajlar.failed;
}
function girisGoster(mesaj = '') {
  avatarOturumunuSifirla();
  const yerelGiris = durum.auth.mode === 'local';
  const yapilandirmaMesaji = durum.auth.configurationError || 'Discord ile giriş henüz yapılandırılmadı.';
  kok.innerHTML = `<main class="login" id="main" tabindex="-1">
    <header class="login-header">
      ${marka()}
      <div class="login-header-actions">${temaDugmesi('login-theme-trigger')}${discordGirisDugmesi('discord-login-header')}</div>
    </header>
    <div class="login-content">
      <section class="login-story" aria-labelledby="login-title">
        <div class="eyebrow"><span class="login-heading-line" aria-hidden="true"></span> SUNUCUNUZ, SİZİN KONTROLÜNÜZDE</div>
        <h1 id="login-title">Topluluğunuza<br> odaklanın.<span>Gerisini ${kacir(durum.bot.name)}<br> halleder.</span></h1>
        <p>Sunucunuzun ayarları, otomasyonları ve güvenliği.<br>Hepsi tek bir yerde.</p>
        <div class="login-features" aria-label="Yönetim merkezi özellikleri">
          <span>${ikon('shield')} Güvenlik</span>
          <span>${ikon('bolt')} Otomasyon</span>
          <span>${ikon('users')} Topluluk</span>
        </div>
      </section>
      <section class="login-form-wrap" aria-labelledby="login-form-title">
        <form class="login-form">
          <div class="login-form-heading">
            <div><div class="eyebrow">TEKRAR HOŞ GELDİNİZ</div><h2 id="login-form-title">Kontrol sizde.</h2></div>
            <span class="login-form-symbol" aria-hidden="true">${ikon('grid')}</span>
          </div>
          <p>${yerelGiris ? 'Sunucunuzu yönetmek için hesabınıza giriş yapın.' : 'Yetkili olduğunuz sunucuları yönetmek için Discord hesabınızla giriş yapın.'}</p>
          <div id="login-error" class="form-error" role="alert" ${mesaj ? '' : 'hidden'}>${kacir(mesaj)}</div>
          ${!durum.auth.discordEnabled ? `<div id="discord-configuration" class="login-configuration" role="status">${ikon('info')}<span>${kacir(yapilandirmaMesaji)}${yerelGiris ? ' Yerel hesabınızla giriş yapabilirsiniz.' : ''}</span></div>` : ''}
          ${yerelGiris ? `<div class="field"><label for="username">Kullanıcı adı</label><div class="login-input">${ikon('profile')}<input id="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Kullanıcı adınız" required maxlength="100"></div></div>
          <div class="field"><label for="password">Parola</label><div class="login-input login-password">${ikon('lock')}<input id="password" name="password" type="password" autocomplete="current-password" placeholder="Parolanız" required><button class="login-password-toggle" type="button" aria-label="Parolayı göster" aria-pressed="false" aria-controls="password">${ikon('eye')}</button></div></div>
          <button class="btn primary" type="submit">Giriş yap ${ikon('arrow')}</button>` : `<div class="login-discord-permissions">${ikon('shield')}<p>Yalnızca profiliniz ve sunucu listeniz istenir. ${kacir(durum.bot.name)} bulunan sunucularda <strong>Sunucuyu Yönet</strong> veya <strong>Yönetici</strong> yetkinizle ayarları düzenleyebilirsiniz.</p></div>${discordGirisDugmesi()}`}
          <div class="login-foot">${ikon('lock')} Yalnızca yetkilendirilmiş erişim</div>
        </form>
      </section>
    </div>
  </main>`;
  document.querySelector('.login-password-toggle')?.addEventListener('click', olay => {
    const parola = document.getElementById('password');
    const goster = parola.type === 'password';
    parola.type = goster ? 'text' : 'password';
    olay.currentTarget.setAttribute('aria-pressed', String(goster));
    olay.currentTarget.setAttribute('aria-label', goster ? 'Parolayı gizle' : 'Parolayı göster');
    olay.currentTarget.innerHTML = ikon(goster ? 'eyeOff' : 'eye');
  });
  document.querySelector('.login-form').addEventListener('submit', async olay => {
    olay.preventDefault();
    if (!yerelGiris) return;
    const dugme = olay.target.querySelector('button[type="submit"]'); dugme.disabled = true; dugme.textContent = 'Giriş yapılıyor…';
    try {
      const oturum = await api('/login', 'POST', { username: document.getElementById('username').value, password: document.getElementById('password').value });
      document.getElementById('password').value = ''; oturumuUygula(oturum); await uygulamayiAc();
    } catch (hata) {
      const alan = document.getElementById('login-error');
      if (alan) { alan.textContent = hata.message; alan.hidden = false; }
      if (hata.status === 403) { const oturum = await api('/session'); durum.csrf = oturum.csrf; }
    } finally { dugme.disabled = false; dugme.innerHTML = `Giriş yap ${ikon('arrow')}`; }
  });
}
async function uygulamayiAc() {
  profilTercihiniOku();
  avatarOturumunuSifirla();
  [durum.registry, durum.guilds] = await Promise.all([api('/registry'), api('/guilds'), avatarYukle()]);
  durum.guildId = durum.guilds.find(g => g.id === durum.guildId)?.id || durum.guilds[0]?.id || '';
  kabukGoster();
  if (durum.route === 'profile' || !durum.guildId) return rotaGoster();
  await sunucuYukle();
}
function kabukGoster() {
  const genelAyarlarIndex = kategoriler.findIndex(([kategori]) => kategori === 'Genel Ayarlar');
  kok.innerHTML = `<div class="layout">
    <aside class="sidebar" id="sidebar">
      ${yanPanel()}
    </aside>
    <div class="content-shell"><header class="topbar"><div class="topbar-leading"><button class="icon-button mobile-toggle" id="mobile-menu" aria-label="Menüyü aç veya kapat" aria-expanded="false" aria-controls="sidebar">${ikon('menu')}</button><div class="breadcrumbs"><span>Yönetim merkezi</span><span class="divider">/</span><span id="breadcrumb">Genel bakış</span></div></div>${sunucuAdasi()}<div class="topbar-actions">${temaDugmesi()}</div></header><main class="main" id="main" tabindex="-1"></main></div>
    <nav class="bottom-dock" id="bottom-dock" aria-label="Ana gezinme">
      <button type="button" class="dock-user" id="dock-toggle" aria-label="Profili aç"><span class="avatar" data-profile-avatar aria-hidden="true">${profilAvatarIcerigi()}</span><span class="user-info"><strong data-profile-name title="${kacir(profilAdi())}">${kacir(profilAdi())}</strong><span>${hesapEtiketi()}</span></span></button>
      <button type="button" class="dock-link" data-route="overview">${ikon('home')}<span>Genel Bakış</span></button>
      <button type="button" class="dock-link" data-route="modules">${ikon('grid')}<span>Tüm Modüller</span></button>
      <button type="button" class="dock-link" data-route="category:${genelAyarlarIndex}">${ikon('settings')}<span>Genel Ayarlar</span></button>
      <button type="button" class="dock-link" data-route="profile">${ikon('profile')}<span>Profil</span></button>
      <span class="dock-resize" id="dock-resize" tabindex="0" role="slider" aria-label="Alt menü boyutu" aria-valuemin="80" aria-valuemax="140" aria-valuenow="100" aria-valuetext="%100" aria-controls="bottom-dock" aria-describedby="dock-resize-help" title="Boyutlandırmak için sürükleyin · Sıfırlamak için çift tıklayın">${ikon('resize')}</span>
      <span class="sr-only" id="dock-resize-help">Sol üst köşeyi dışarı sürükleyerek büyütün, içeri sürükleyerek küçültün. Ok tuşlarını da kullanabilirsiniz. Çift tıklama varsayılan boyuta döndürür.</span>
      <button type="button" class="dock-minimize" id="dock-minimize" aria-label="Alt menüyü küçült" title="Alt menüyü küçült" aria-controls="bottom-dock"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    </nav>
  </div>`;
  document.querySelectorAll('[data-route]').forEach(dugme => dugme.addEventListener('click', () => git(dugme.dataset.route)));
  sunucuAdasiniBagla();
  yanPanelAramasiniBagla();
  yanPanelGezinmesiniBagla();
  document.getElementById('guild').addEventListener('change', async olay => {
    durum.guildId = olay.target.value; durum.navigation++; durum.entities = {}; durum.overview = null; durum.moduleStatuses = {}; durum.overviewError = '';
    yanPanelGruplariniUygula(); sonModulleriGoster();
    if (durum.route !== 'profile') await sunucuYukle();
  });
  document.getElementById('mobile-menu').addEventListener('click', () => {
    const acik = document.getElementById('sidebar').classList.toggle('open'); document.getElementById('mobile-menu').setAttribute('aria-expanded', String(acik));
  });
  document.getElementById('main').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open'); document.getElementById('mobile-menu').setAttribute('aria-expanded', 'false');
  });
  menuBoyutlandirmayiBagla();
  menuGorunumunuBagla();
}
async function sunucuYukle() {
  const surum = ++durum.navigation; const guildId = durum.guildId;
  document.getElementById('main').innerHTML = '<div class="empty">Sunucu bilgileri yükleniyor…</div>';
  try {
    const [entities, overview] = await Promise.all([api(`/guilds/${guildId}/entities`), api(`/guilds/${guildId}/overview`)]);
    if (surum !== durum.navigation) return;
    durum.entities = entities; durum.overview = overview; durum.overviewError = '';
    await rotaGoster();
  } catch (hata) {
    if (surum !== durum.navigation) return;
    durum.overviewError = hata.status === 401 ? 'Oturum süresi doldu' : 'Bağlantı kesildi';
    hataGoster(hata);
  }
}
function git(rota) { durum.route = rota; location.hash = encodeURIComponent(rota); rotaGoster(); }
function rotaAdi() {
  if (durum.route === 'overview') return 'Genel bakış';
  if (durum.route === 'modules') return 'Tüm modüller';
  if (durum.route === 'profile') return 'Profil';
  if (durum.route.startsWith('category:')) return kategoriler[Number(durum.route.split(':')[1])]?.[0] || 'Modüller';
  return durum.registry.find(m => m.id === durum.route)?.label || 'Genel bakış';
}
function baslik(ust, baslikMetni, aciklama, aksiyon = '') { return `<div class="page-head"><div><div class="eyebrow">${kacir(ust)}</div><h1>${kacir(baslikMetni)}</h1><p>${kacir(aciklama)}</p></div>${aksiyon}</div>`; }
function altbilgi() { return `<footer class="footer"><span>${kacir(durum.bot.name)} · v${kacir(durum.overview?.version || '—')}</span></footer>`; }
function kart(modul) {
  const simge = modulIkon(modul);
  return `<button type="button" class="module-card" data-tone="${modulTonu(modul)}" data-module="${kacir(modul.id)}" aria-label="${kacir(modul.label)} modülünü aç">
    <span class="module-top"><span class="module-icon">${modulKartIkonu(simge)}</span><span class="module-category-label">${kacir(modul.category)}</span>${modulMotifi(simge)}</span>
    <h3>${kacir(modul.label)}</h3><p>${kacir(modul.description)}</p>
    <span class="module-bottom"><span class="module-badges">${etiket(modul.status)}${sistemEtiketi(modul.id)}</span><span class="module-open" aria-hidden="true">${ikon('arrow')}</span></span>
  </button>`;
}
function kartlariBagla() { document.querySelectorAll('[data-module]').forEach(el => el.addEventListener('click', () => git(el.dataset.module))); }
async function rotaGoster() {
  const automod = durum.registry.find(m => m.id === 'automod');
  if (automod?.sections.some(section => durum.route === `automod-${section.id}` || (section.id === 'raid' && durum.route === 'raid'))) {
    durum.route = 'automod'; history.replaceState(null, '', '#automod');
  }
  const istek = ++durum.navigation;
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('mobile-menu')?.setAttribute('aria-expanded', 'false');
  document.getElementById('breadcrumb').textContent = rotaAdi();
  const modul = durum.registry.find(m => m.id === durum.route);
  document.querySelectorAll('[data-route]').forEach(el => {
    const aktif = el.dataset.route === durum.route || (modul && el.dataset.route === `category:${kategoriler.findIndex(k => k[0] === modul.category)}`);
    el.classList.toggle('active', !!aktif); if (aktif) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
  const aktifGrup = document.querySelector('.sidebar .nav-link.active')?.closest('details');
  if (aktifGrup && !aktifGrup.open) { aktifGrup.open = true; yanPanelGruplariniKaydet(); }
  if (durum.route === 'profile') { profilGoster(); window.scrollTo(0, 0); document.getElementById('main').focus({ preventScroll: true }); return; }
  if (!durum.guildId) {
    document.getElementById('main').innerHTML = `<div class="empty">${durum.authMethod === 'discord' ? 'Yönetebileceğiniz bir sunucu bulunamadı. Botun bulunduğu bir sunucuda sunucu sahibi olmanız veya Sunucuyu Yönet / Yönetici yetkisine sahip olmanız gerekir. Yetkileriniz güncellendikten sonra sayfayı yenileyin.' : 'Botun bağlı olduğu sunucu bulunamadı. Bot bir sunucuya katıldıktan sonra sayfayı yenileyin.'}</div>`;
    return;
  }
  if (!durum.overview) return sunucuYukle();
  if (durum.route === 'overview' || (!modul && !durum.route.startsWith('category:') && durum.route !== 'modules')) { genelBakis(); return modulDurumlariniYukle(); }
  if (!modul) { katalogGoster(); return modulDurumlariniYukle(); }
  const anahtar = `${durum.guildId}:${modul.id}`;
  if (!durum.drafts.has(anahtar)) {
    document.getElementById('main').innerHTML = '<div class="empty">Güncel ayarlar yükleniyor…</div>';
    try {
      const veri = await api(`/guilds/${durum.guildId}/settings/${encodeURIComponent(modul.id)}`);
      durum.drafts.set(anahtar, { ...veri, original: kopya(veri.values), error: '', saving: false });
    } catch (hata) { if (istek === durum.navigation) hataGoster(hata); return; }
  }
  if (istek === durum.navigation) {
    formGoster(modul, anahtar);
    const tercih = yanPanelTercihi(); tercih.son = [modul.id, ...tercih.son.filter(id => id !== modul.id)].slice(0, 3);
    yanPanelTercihiniKaydet(); sonModulleriGoster();
  }
}
function profilGoster() {
  const ad = durum.profileDraft ?? profilAdi();
  document.getElementById('main').innerHTML = `${baslik('HESABINIZ', 'Profil', 'Profilinizi ve panel tercihlerinizi tek yerden yönetin.')}
    <div class="profile-grid">
      <section class="panel profile-summary" aria-labelledby="profile-summary-title">
        <span class="avatar profile-avatar" data-profile-avatar aria-hidden="true">${profilAvatarIcerigi()}</span>
        <h2 id="profile-summary-title" data-profile-name>${kacir(profilAdi())}</h2>
        <span class="badge">${hesapEtiketi()}</span>
        <div class="profile-account"><span>Giriş yapılan hesap</span><strong>${kacir(durum.username)}</strong></div>
        <p>Görünüm ve profil tercihlerinizi size uygun şekilde düzenleyin.</p>
      </section>
      <div class="profile-sections">
        ${avatarPaneli()}
        <section class="panel profile-panel" aria-labelledby="profile-details-title">
          <div class="profile-section-heading"><span class="module-icon">${ikon('profile')}</span><div><h2 id="profile-details-title">Profil bilgileri</h2><p>Alt menüde görünecek adınızı belirleyin.</p></div></div>
          <form id="profile-form">
            <div class="field"><label for="profile-name">Görünen ad</label><input id="profile-name" name="displayName" autocomplete="nickname" maxlength="50" required value="${kacir(ad)}" aria-describedby="profile-name-hint"><p class="field-hint" id="profile-name-hint">Bu ad giriş bilgilerinizi değiştirmez. Tercihiniz bu tarayıcıda hatırlanır.</p></div>
            <div class="profile-form-footer"><p class="small muted" id="profile-save-status" role="status"></p><button type="submit" class="btn primary">${ikon('check')} Profili kaydet</button></div>
          </form>
        </section>
        <section class="panel profile-panel" aria-labelledby="profile-preferences-title">
          <div class="profile-section-heading"><span class="module-icon">${ikon('settings')}</span><div><h2 id="profile-preferences-title">Panel tercihleri</h2><p>Görünümü ve gezinme menüsünü kişiselleştirin.</p></div></div>
          <div class="profile-preference-row"><div><h3>Tema ve renk</h3><p>Açık veya koyu görünümü ve favori renginizi seçin.</p></div><button type="button" class="btn" data-theme-open aria-haspopup="dialog" aria-controls="theme-dialog">${ikon('settings')} Temayı düzenle</button></div>
          <div class="profile-size-setting"><div class="profile-preference-row"><div><label for="dock-size">Alt menü boyutu</label><p>Menünün sol üst köşesini sürükleyerek de ayarlayabilirsiniz.</p></div><output id="dock-size-value" for="dock-size">%${Math.round(durum.profile.dockScale * 100)}</output></div><input type="range" id="dock-size" min="80" max="140" step="1" value="${Math.round(durum.profile.dockScale * 100)}"><div class="profile-size-labels"><span>Küçük</span><button type="button" class="text-button" id="dock-size-reset">Varsayılan boyut</button><span>Büyük</span></div></div>
          <p class="small muted profile-preference-status" id="profile-preference-status" role="status">Menü boyutu bu tarayıcıda otomatik kaydedilir.</p>
        </section>
        <section class="panel profile-panel profile-session" aria-labelledby="profile-session-title"><div class="profile-preference-row"><div><h2 id="profile-session-title">Oturum</h2><p>Bu tarayıcıdaki oturumunuzu sonlandırın.</p></div><button type="button" class="btn danger" id="logout">${ikon('logout')} Çıkış yap</button></div></section>
      </div>
    </div>${altbilgi()}`;
  avatarAyarlariniBagla();
  const adAlani = document.getElementById('profile-name');
  adAlani.addEventListener('input', () => { durum.profileDraft = adAlani.value; adAlani.setCustomValidity(''); document.getElementById('profile-save-status').textContent = 'Kaydedilmemiş değişiklikler var.'; });
  document.getElementById('profile-form').addEventListener('submit', olay => {
    olay.preventDefault(); const yeniAd = adAlani.value.trim();
    if (!yeniAd) { adAlani.setCustomValidity('Lütfen görünen adınızı girin.'); adAlani.reportValidity(); return; }
    durum.profile.displayName = yeniAd; durum.profileDraft = null; adAlani.value = yeniAd;
    const kalici = profilTercihiniKaydet(); profilKimliginiUygula();
    document.getElementById('profile-save-status').textContent = kalici ? 'Profil kaydedildi.' : 'Tarayıcı kayda izin vermedi. Profil bu oturumda geçerli.';
  });
  document.getElementById('dock-size').addEventListener('input', olay => menuOlceginiUygula(Number(olay.target.value) / 100));
  document.getElementById('dock-size').addEventListener('change', menuBoyutunuKaydet);
  document.getElementById('dock-size-reset').addEventListener('click', () => { menuOlceginiUygula(1); menuBoyutunuKaydet(); });
  document.getElementById('logout').addEventListener('click', async olay => {
    const dugme = olay.currentTarget; dugme.disabled = true;
    try {
      await api('/logout', 'POST', {}); durum.drafts.clear(); durum.profileDraft = null; durum.navigation++; durum.username = ''; durum.route = 'overview';
      history.replaceState(null, '', location.pathname + location.search); await baslat();
    } catch (hata) { bildir(hata.message, true); }
    finally { dugme.disabled = false; }
  });
}
function botDurumu(v) {
  const eski = !!durum.overviewError;
  const aktif = v.online && !eski;
  const zaman = new Date(v.collectedAt);
  const sonVeri = Number.isNaN(zaman.getTime()) ? '—' : zaman.toLocaleTimeString('tr-TR');
  return `<section class="panel health-panel${aktif ? ' is-online' : ''}">
    <div class="panel-header health-header">
      <div class="health-title"><span class="health-orb${aktif ? ' is-online' : ''}" aria-hidden="true"><span></span></span><div><h2>Botun Durumu</h2></div></div>
      <span class="badge ${aktif ? 'ready' : 'pending'} health-badge"><span class="health-badge-dot${aktif ? ' is-online' : ''}" aria-hidden="true"></span>${eski ? 'Veri alınamadı' : aktif ? 'Çevrimiçi' : 'Bekleniyor'}</span>
    </div>
    <div class="health-overview"><div class="health-overview-copy"><span>ÇALIŞMA DURUMU</span><strong>${eski ? 'Durum doğrulanamıyor' : aktif ? 'Sistem aktif' : 'Bağlantı bekleniyor'}</strong><small>${eski ? 'Son alınan veriler gösteriliyor' : aktif ? 'Discord bağlantısı hazır' : 'Discord bağlantısı henüz hazır değil'}</small></div><div class="health-signal" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div></div>
    <div class="health-list">
      <div class="health-row"><div class="health-row-label"><span class="health-icon">${ikon('clock')}</span><span>Çalışma süresi</span></div><strong>${kacir(v.uptime)}</strong></div>
      <div class="health-row"><div class="health-row-label"><span class="health-icon">${ikon('settings')}</span><span>Yüklü komut</span></div><strong>${sayi(v.commandCount)} <em>komut</em></strong></div>
      <div class="health-row"><div class="health-row-label"><span class="health-icon">${ikon('chart')}</span><span>Bellek kullanımı</span></div><strong>${kacir(v.memory)}</strong></div>
    </div>
    <div class="health-footer"><span class="health-live${aktif ? '' : ' offline'}">${eski ? 'VERİ GÜNCEL DEĞİL' : aktif ? '30 SN’DE BİR' : 'BAĞLANTI BEKLENİYOR'}</span><span class="health-code">Son veri: ${kacir(sonVeri)}</span></div>
  </section>`;
}
function toplulugaBakis(v, grafikTuru, dagilim) {
  const toplam = dagilim.reduce((a, b) => a + b, 0);
  const yuzde = deger => `%${deger.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
  const kapsam = Math.min(100, Math.max(0, Number(v.members.coverage) || 0));
  const cubuk = (oran, sinif) => `<svg class="${sinif}" viewBox="0 0 100 3" preserveAspectRatio="none" aria-hidden="true"><rect class="member-meter-track" width="100" height="3" rx="1.5"/><rect class="member-meter-fill" width="${oran}" height="3" rx="1.5"/></svg>`;
  const satirlar = [['Çevrimiçi', 'chart', 'online'], ['Botlar', 'server', 'bots'], ['Çevrimdışı', 'clock', 'offline']].map(([ad, simge, sinif], i) => {
    const oran = toplam ? dagilim[i] / toplam * 100 : 0;
    return `<div class="legend-row member-metric member-metric-${sinif}"><span class="member-metric-icon">${ikon(simge)}</span><div class="member-metric-copy"><span>${ad}</span>${cubuk(oran, 'member-meter')}</div><div class="member-metric-value"><strong>${sayi(dagilim[i])}</strong><small>${toplam ? yuzde(oran) : '—'}</small></div></div>`;
  }).join('');
  return `<section class="panel member-panel">
    <div class="panel-header member-header"><div class="member-title"><span class="member-emblem">${ikon('users')}</span><div><h2>Topluluğa Bakış</h2></div></div><label class="chart-select-wrap"><span class="sr-only">Grafik türü seç</span><select id="member-chart-select" class="chart-select" aria-label="Grafik türü seç">${grafikTurleri.map(([id, label]) => `<option value="${id}" ${id === grafikTuru ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
    <div class="member-body">${grafikGorunumu(grafikTuru, dagilim, v.memberCount)}<div class="member-legend">${satirlar}<div class="legend-row member-metric member-metric-voice"><span class="member-metric-icon">${ikon('voice')}</span><div class="member-metric-copy"><span>Sesli kanalda</span><small>Dağılımdan bağımsız</small></div><div class="member-metric-value"><strong>${sayi(v.voiceMembers)}</strong><small>kişi</small></div></div></div></div>
    <div class="member-footer"><div class="member-coverage"><span>${ikon('shield')} Üye önbelleği kapsamı</span><div>${cubuk(kapsam, 'member-coverage-meter')}<strong>${yuzde(kapsam)}</strong></div></div><p class="panel-footnote" id="member-chart-note">Grafik mevcut üye dağılımını gösterir, zaman içindeki değişimi göstermez. Sesli katılım dağılıma dahil değildir.</p></div>
  </section>`;
}
function genelBakis(canli = false) {
  const v = durum.overview; if (!v) return;
  const uyeler = v.members.statuses;
  const degerler = [uyeler.online + uyeler.idle + uyeler.dnd, v.members.bots, v.voiceMembers, uyeler.offline];
  const dagilim = [degerler[0], v.members.bots, uyeler.offline];
  const grafikTuru = grafikTercihi(durum.guildId);
  const aktif = v.online && !durum.overviewError;
  const onerilen = ['starboard', 'giris-cikis', 'automod', 'seviye', 'sureli-mesaj', 'itiraf'].map(id => durum.registry.find(m => m.id === id)).filter(Boolean);
  const icerik = `${baslik('SUNUCU VERİLERİ', 'Her şey kontrol altında.', `${v.name} sunucusunun genel durumuna göz atın.`, `<div class="head-buttons"><button class="btn ghost" id="refresh">${ikon('refresh')} Yenile</button><button class="btn primary" id="browse">Modülleri yönet ${ikon('arrow')}</button></div>`)}
    <div class="stats-grid">
      <article class="stat stat-members"><div class="stat-label"><span>Toplam üye</span><span class="stat-emblem">${ikon('users')}</span></div><div class="stat-value">${sayi(v.memberCount)}</div><div class="stat-note"><span class="stat-note-copy">${sayi(v.members.humans)} kişi <span>· ${sayi(v.members.bots)} bot önbellekte</span></span></div></article>
      <article class="stat stat-online${aktif ? ' is-live' : ' is-stale'}"><div class="stat-label"><span>Çevrimiçi üye</span><span class="stat-emblem">${ikon('chart')}</span></div><div class="stat-value">${sayi(degerler[0])}</div><div class="stat-note stat-status${aktif ? ' good' : ''}"><span class="stat-note-copy">${aktif ? 'Canlı Discord verileri' : 'Son alınan Discord verileri'}</span></div></article>
      <article class="stat stat-voice"><div class="stat-label"><span>Sesli kanallarda</span><span class="stat-emblem">${ikon('voice')}</span></div><div class="stat-value">${sayi(v.voiceMembers)}<span class="unit">kişi</span></div><div class="stat-note"><span class="stat-note-copy">${sayi(v.channels.voice)} ses kanalı mevcut</span></div></article>
      <article class="stat stat-gateway${aktif ? ' is-live' : ' is-stale'}"><div class="stat-label"><span>Gateway gecikmesi</span><span class="stat-emblem">${ikon('bolt')}</span></div><div class="stat-value">${!aktif || v.ping === null ? '—' : sayi(v.ping)}<span class="unit">ms</span></div><div class="stat-note stat-status${aktif ? ' good' : ''}"><span class="stat-note-copy">${durum.overviewError ? 'Veri güncellenemedi' : aktif ? 'Bağlantı açık' : 'Bağlantı bekleniyor'}</span></div></article>
    </div>
    <div class="overview-grid">
      ${toplulugaBakis(v, grafikTuru, dagilim)}
      ${botDurumu(v)}
    </div>
    <section class="modules-section"><div class="section-heading"><div><h2>Sunucunuzu şekillendirin</h2><p>Sık kullanılan modüllere hızlıca ulaşın.</p></div><button class="text-button" id="all-modules">Tüm modüller ${ikon('arrow')}</button></div><div class="module-grid">${onerilen.map(kart).join('')}</div></section>${altbilgi()}`;
  const main = document.getElementById('main');

  if (canli && main.querySelector('#member-chart-select')) {
    const taslak = document.createElement('template'); taslak.innerHTML = icerik;
    for (const secici of ['.stats-grid', '[data-member-chart]', '.member-legend', '.member-footer', '.health-panel', '.footer']) {
      main.querySelector(secici).replaceWith(taslak.content.querySelector(secici));
    }
  } else { main.innerHTML = icerik; kartlariBagla(); }
  grafikBilgisiniBagla(dagilim);
  document.getElementById('browse').onclick = () => git('modules');
  document.getElementById('all-modules').onclick = () => git('modules');
  if (document.getElementById('member-chart-select').value !== grafikTuru) document.getElementById('member-chart-select').value = grafikTuru;
  document.getElementById('member-chart-select').onchange = olay => {
    const secim = olay.currentTarget.value; grafikTercihiniKaydet(durum.guildId, secim);
    document.querySelector('[data-member-chart]').outerHTML = grafikGorunumu(secim, dagilim, v.memberCount);
    grafikBilgisiniBagla(dagilim);
  };
  document.getElementById('refresh').onclick = async olay => {
    olay.currentTarget.disabled = true;
    await sunucuYukle();
  };
}
function katalogGoster() {
  const kategori = durum.route.startsWith('category:') ? kategoriler[Number(durum.route.split(':')[1])]?.[0] : null;
  const temel = durum.registry.filter(m => !kategori || m.category === kategori);
  const aciklama = {
    'Sunucu Yönetimi': 'Karşılamadan otomasyona, sunucunuzun günlük akışını tasarlayın.',
    'Güvenlik ve Moderasyon': 'Kuralları belirleyin, topluluğunuz için güvenli bir alan oluşturun.',
    'Ses Sistemleri': 'Sesli odaları, kanalları ve sohbet deneyimini tek yerden düzenleyin.',
    Seviye: 'Katılımı görünür kılın, topluluğunuzun gelişimini ödüllendirin.',
    Boost: 'Sunucunuzu destekleyen üyelere özel bir deneyim hazırlayın.',
    Abonelik: 'Başvuruları, onayları ve abonelik rollerini düzenleyin.',
    Bildirimler: 'Topluluğunuzu doğru zamanda, doğru kanalda haberdar edin.',
    'Üye Verileri': 'Üye etkinliklerini ve topluluğunuzun hareketlerini takip edin.',
    'Eğlence ve Etkileşim': 'Sohbeti canlandırın, birlikte katılacağınız deneyimler oluşturun.',
    Sistem: 'Botunuzun çalışma biçimini ve görünümünü düzenleyin.',
    Yedek: 'Sunucunuzun düzenini ve verilerini güvenceye alın.',
    'Genel Ayarlar': 'Sunucunuzun temel tercihlerini tek yerden yönetin.',
  }[kategori] || 'Sunucunuza yön veren tüm araçlar. Keşfedin, özelleştirin ve yönetin.';
  document.getElementById('main').innerHTML = `<section class="module-catalog" data-tone="${modulTonu({ category: kategori })}">
    <header class="catalog-hero page-head"><div class="catalog-heading"><div class="eyebrow"><span class="eyebrow-line"></span> MODÜLLER</div><h1>${kacir(kategori || 'Tüm modüller')}<span class="heading-dot">.</span></h1><p>${kacir(aciklama)}</p><span class="catalog-context">${ikon(kategoriler.find(k => k[0] === kategori)?.[1] || 'grid')} ${kategori ? 'Ayarlar ve otomasyonlar' : `${kategoriler.filter(k => durum.registry.some(m => m.category === k[0])).length} kategoride tüm kontrol sizde`}</span></div>
    <div class="catalog-summary" aria-label="Modül durum özeti">${[['all', 'Toplam modül', 'grid'], ['active', 'Aktif sistem', 'bolt'], ['inactive', 'Pasif sistem', 'clock']].map(([id, ad, simge]) => `<button type="button" class="catalog-stat" data-status-filter="${id}" aria-pressed="${id === 'all'}"><span>${ikon(simge)} ${ad}</span><strong id="module-total-${id}">${id === 'all' ? sayi(temel.length) : '—'}</strong><span class="catalog-stat-hint">${id === 'all' ? 'Tümünü keşfet' : id === 'active' ? 'Çalışan sistemler' : 'Kurulum ve ayarlar'}</span></button>`).join('')}<p id="module-status-note" class="catalog-status-note" role="status"></p></div></header>
    <div class="catalog-tools"><div class="filterbar"><div class="search-wrap">${ikon('search')}<input id="module-search" type="search" aria-label="Modül ara" placeholder="Bir modül veya özellik arayın…" autocomplete="off"></div><select id="module-filter" aria-label="Sistem durumuna göre filtrele"><option value="all">Tüm sistemler</option><option value="active">Aktif sistemler</option><option value="inactive">Pasif sistemler</option></select></div><span class="small muted" id="module-count" role="status"></span></div>
    <div class="module-grid" id="module-list"></div></section>${altbilgi()}`;
  const filtrele = () => {
    const ara = aramaMetni(document.getElementById('module-search').value.trim()); const filtre = document.getElementById('module-filter').value;
    const liste = temel.filter(m => aramaMetni(`${m.label} ${m.category} ${m.command || ''} ${m.description} ${(m.sections || []).map(section => `${section.label} ${section.description}`).join(' ')}`).includes(ara) && (filtre === 'all' || durum.moduleStatuses[m.id] === (filtre === 'active')));
    document.getElementById('module-count').textContent = `${liste.length} / ${temel.length} modül`;
    const bilinen = temel.filter(m => typeof durum.moduleStatuses[m.id] === 'boolean');
    for (const [id, aktif] of [['active', true], ['inactive', false]]) document.getElementById(`module-total-${id}`).textContent = bilinen.length || !temel.length ? sayi(bilinen.filter(m => durum.moduleStatuses[m.id] === aktif).length) : '—';
    const bekleyen = temel.filter(m => durum.moduleStatuses[m.id] === undefined).length;
    document.getElementById('module-status-note').textContent = bekleyen ? 'Sistem durumları kontrol ediliyor…' : bilinen.length < temel.length ? `${temel.length - bilinen.length} modülün durumu alınamadı` : 'Seçili sunucunun sistem durumları';
    document.querySelectorAll('[data-status-filter]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.statusFilter === filtre)));
    document.getElementById('module-list').innerHTML = liste.length ? liste.map(kart).join('') : `<div class="catalog-empty">${ikon('search')}<h2>Eşleşen modül bulunamadı</h2><p>Farklı bir kelime deneyin veya filtreleri temizleyin.</p><button type="button" class="btn" id="clear-module-filters">Filtreleri temizle ${ikon('refresh')}</button></div>`;
    document.getElementById('clear-module-filters')?.addEventListener('click', () => { document.getElementById('module-search').value = ''; document.getElementById('module-filter').value = 'all'; filtrele(); document.getElementById('module-search').focus(); });
    kartlariBagla();
  };
  document.getElementById('module-search').oninput = filtrele; document.getElementById('module-filter').onchange = filtrele; filtrele();
  document.querySelectorAll('[data-status-filter]').forEach(el => el.onclick = () => { document.getElementById('module-filter').value = el.dataset.statusFilter; filtrele(); });
}
function farklar(taslak) { return Object.fromEntries(Object.entries(taslak.values).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(taslak.original[k]))); }
function varsayilan(alan) { return alan.default ?? (alan.nullable ? null : alan.type === 'boolean' ? false : ['array', 'list'].includes(alan.type) ? [] : alan.type === 'number' ? alan.min : ''); }
let alanSayaci = 0;
function alanOlustur(alan, deger, degistir) {
  const kutu = document.createElement('div'); kutu.className = `field${alan.multiline || ['array', 'list', 'boolean'].includes(alan.type) ? ' full' : ''}`;
  const id = `field-${++alanSayaci}`;
  if (alan.dynamicOptions) alan = { ...alan, type: 'select', options: [{ value: '', label: 'Listeden seçin…' }, ...(durum.drafts.get(`${durum.guildId}:${durum.route}`)?.options?.[alan.dynamicOptions] || [])] };
  if (alan.type === 'boolean') {
    kutu.className = 'toggle-row'; const label = document.createElement('label'); label.htmlFor = id; label.textContent = alan.label; const input = document.createElement('input'); input.id = id; input.type = 'checkbox'; input.checked = deger === true; input.onchange = () => degistir(input.checked); kutu.append(label, input); return kutu;
  }
  const label = document.createElement('label'); label.htmlFor = id; label.textContent = alan.label; kutu.append(label);
  if (['array', 'list'].includes(alan.type)) {
    kutu.classList.add('repeat-field'); let satirlar = kopya(deger || []); const icerik = document.createElement('div'); const ekle = document.createElement('button'); ekle.type = 'button'; ekle.className = 'btn ghost'; ekle.innerHTML = `${ikon('plus')} ${alan.type === 'list' ? 'Kural ekle' : 'Seçim ekle'}`;
    const ciz = () => {
      icerik.replaceChildren();
      if (!satirlar.length) { const empty = document.createElement('p'); empty.className = 'repeat-empty'; empty.textContent = alan.type === 'list' ? 'Henüz kural eklenmedi.' : 'Henüz seçim eklenmedi.'; icerik.append(empty); }
      satirlar.forEach((satir, i) => {
        const satirKutu = document.createElement('div'); satirKutu.className = alan.type === 'list' ? 'repeat-item' : 'array-item';
        const sil = document.createElement('button'); sil.type = 'button'; sil.className = 'btn ghost danger'; sil.textContent = 'Kaldır'; sil.setAttribute('aria-label', `${alan.label}: ${i + 1}. kaydı kaldır`); sil.onclick = () => { satirlar.splice(i, 1); degistir(kopya(satirlar)); ciz(); };
        if (alan.type === 'list') {
          const bas = document.createElement('div'); bas.className = 'repeat-item-head'; const sayac = document.createElement('span'); sayac.textContent = `${String(i + 1).padStart(2, '0')} / Kural`; bas.append(sayac, sil); const fields = document.createElement('div'); fields.className = 'fields';
          for (const alt of alan.fields) fields.append(alanOlustur(alt, satir[alt.key] ?? varsayilan(alt), v => { satirlar[i][alt.key] = v; degistir(kopya(satirlar)); })); satirKutu.append(bas, fields);
        } else satirKutu.append(alanOlustur(alan.item, satir, v => { satirlar[i] = v; degistir(kopya(satirlar)); }), sil);
        icerik.append(satirKutu);
      });
      ekle.disabled = satirlar.length >= alan.max;
    };
    ekle.onclick = () => { satirlar.push(alan.type === 'list' ? Object.fromEntries(alan.fields.map(a => [a.key, varsayilan(a)])) : varsayilan(alan.item)); degistir(kopya(satirlar)); ciz(); };
    ciz(); kutu.append(icerik, ekle);
    if (alan.hint) { const hint = document.createElement('p'); hint.className = 'field-hint'; hint.textContent = alan.hint; kutu.append(hint); }
    return kutu;
  }
  if (['channel', 'role', 'emoji'].includes(alan.type)) {
    const picker = document.createElement('div'); picker.className = 'picker'; const ust = document.createElement('div'); ust.className = 'picker-search'; const input = document.createElement('input'); input.id = id; input.autocomplete = 'off'; input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-controls', `${id}-list`); input.placeholder = 'Arayın ve listeden seçin…';
    const kaynak = alan.type === 'channel' ? (durum.entities.channels || []).filter(c => (alan.channelTypes || [0, 5]).includes(c.type)) : alan.type === 'role' ? durum.entities.roles || [] : (durum.entities.emojis || []).filter(e => !alan.unicodeOnly || !e.id.startsWith('<'));
    const ad = item => `${alan.type === 'channel' ? '# ' : alan.type === 'role' ? '@ ' : ''}${item.name}`;
    let secilen = deger; const secimAdi = () => kaynak.find(k => k.id === secilen) ? ad(kaynak.find(k => k.id === secilen)) : secilen ? 'Seçim artık kullanılamıyor' : '';
    input.value = secimAdi(); const secenekler = document.createElement('div'); secenekler.id = `${id}-list`; secenekler.className = 'picker-options'; secenekler.setAttribute('role', 'listbox'); secenekler.hidden = true;
    const kapat = () => { secenekler.hidden = true; input.setAttribute('aria-expanded', 'false'); input.value = secimAdi(); };
    const ac = (arama = '') => {
      secenekler.replaceChildren(); const uygun = kaynak.filter(k => k.name.toLocaleLowerCase('tr-TR').includes(arama.toLocaleLowerCase('tr-TR'))).slice(0, 100);
      uygun.forEach(item => { const dugme = document.createElement('button'); dugme.type = 'button'; dugme.className = 'picker-option'; dugme.setAttribute('role', 'option'); dugme.setAttribute('aria-selected', String(item.id === secilen)); dugme.textContent = ad(item); dugme.onclick = () => { secilen = item.id; degistir(item.id); input.focus(); kapat(); }; secenekler.append(dugme); });
      if (!uygun.length) { const bos = document.createElement('div'); bos.className = 'picker-empty'; bos.textContent = 'Uygun seçim bulunamadı.'; secenekler.append(bos); }
      secenekler.hidden = false; input.setAttribute('aria-expanded', 'true');
    };
    input.onfocus = () => { ac(); input.select(); }; input.oninput = () => ac(input.value);
    input.onkeydown = olay => { if (olay.key === 'Escape') kapat(); if (olay.key === 'ArrowDown') { olay.preventDefault(); if (secenekler.hidden) ac(); secenekler.querySelector('button')?.focus(); } if (olay.key === 'Enter') { olay.preventDefault(); if (secenekler.querySelectorAll('button').length === 1) secenekler.querySelector('button').click(); } };
    secenekler.onkeydown = olay => { const dugmeler = [...secenekler.querySelectorAll('button')]; const sira = dugmeler.indexOf(document.activeElement); if (olay.key === 'ArrowDown' || olay.key === 'ArrowUp') { olay.preventDefault(); dugmeler[(sira + (olay.key === 'ArrowDown' ? 1 : dugmeler.length - 1)) % dugmeler.length]?.focus(); } if (olay.key === 'Escape') { input.focus(); kapat(); } };
    picker.addEventListener('focusout', () => setTimeout(() => { if (!picker.contains(document.activeElement)) kapat(); }, 0));
    ust.append(input);
    if (alan.nullable) { const temizle = document.createElement('button'); temizle.type = 'button'; temizle.className = 'icon-button'; temizle.textContent = '×'; temizle.setAttribute('aria-label', `${alan.label} seçimini temizle`); temizle.onclick = () => { secilen = null; degistir(null); kapat(); }; ust.append(temizle); }
    picker.append(ust, secenekler); kutu.append(picker);
  } else {
    const input = document.createElement(alan.type === 'select' ? 'select' : alan.multiline ? 'textarea' : 'input'); input.id = id;
    if (alan.type === 'select') for (const option of alan.options) { const opt = document.createElement('option'); opt.value = option.value; opt.textContent = option.label; input.append(opt); }
    else if (alan.type === 'number') { input.type = 'number'; input.min = alan.min; input.max = alan.max; input.step = '1'; }
    else { if (!alan.multiline) input.type = 'text'; input.maxLength = alan.maxLength || 2000; }
    input.value = deger ?? ''; input.addEventListener('input', () => degistir(alan.type === 'number' ? (input.value === '' && alan.nullable ? null : Number(input.value)) : input.value === '' && alan.nullable ? null : input.value)); kutu.append(input);
  }
  if (alan.hint || alan.type === 'number') { const hint = document.createElement('p'); hint.className = 'field-hint'; hint.textContent = alan.hint || `${sayi(alan.min)}–${sayi(alan.max)}${alan.nullable ? ' · Boş bırakılabilir' : ''}`; kutu.append(hint); }
  return kutu;
}
function modulSayfasi(modul, taslak, guildId) {
  const kapsam = modul.scope === 'global' ? 'Bot genelinde · Tüm sunucular' : durum.guilds.find(g => g.id === guildId)?.name || 'Seçili sunucu';
  const bolumler = [...(modul.fields.length ? [{ target: 'settings-form', label: 'Genel ayarlar', icon: 'settings' }] : []), ...(modul.sections || []).map(s => ({ target: `section-${s.id}`, label: s.label, icon: modulIkon(modul) })), ...(modul.actions || []).map(a => ({ target: `module-action-${a.id}`, label: a.label, icon: 'bolt' }))];
  return `<section class="module-workspace" data-tone="${modulTonu(modul)}">
    <div class="module-backbar"><button type="button" class="text-button" id="back">${ikon('arrow')} Tüm modüller</button><span>${kacir(modul.category)}</span></div>
    <header class="module-hero page-head"><div class="module-hero-main"><span class="module-hero-icon">${ikon(modulIkon(modul))}</span><div class="module-hero-copy"><h1>${kacir(modul.label)}</h1><p>${kacir(modul.description)}</p></div></div><div class="module-badges">${etiket()}${sistemEtiketi(modul.id)}</div></header>
    <div class="form-layout"><div class="module-editor"><div class="module-settings-card"><form id="settings-form" class="panel settings-panel"><div class="form-intro"><div><h2>Modül ayarları</h2><p>${kacir(kapsam)}</p></div><span class="form-intro-caption">${ikon('settings')} Yapılandırma</span></div><div id="form-error" class="form-error" role="alert" ${taslak.error ? '' : 'hidden'}>${kacir(taslak.error)}</div><div class="fields" id="fields"></div></form><div class="form-actions"><span class="save-state" id="save-state" role="status"></span><div><button class="btn ghost" id="discard">Vazgeç</button><button class="btn primary" id="save" type="submit" form="settings-form">${ikon('check')} Kaydet</button></div></div></div></div>
    <aside class="module-sidebar">${bolumler.length ? `<nav class="module-section-nav" aria-label="Modül bölümleri"><h2>BU SAYFADA</h2>${bolumler.map((s, i) => `<button type="button" data-form-target="${kacir(s.target)}" ${i === 0 ? 'aria-current="location"' : ''}>${ikon(s.icon || 'shield')}<span>${kacir(s.label)}</span></button>`).join('')}</nav>` : ''}<div class="help-panel"><h3>${ikon('info')} Küçük bir not</h3><p>${kacir(modul.note || 'Değişiklikleriniz kaydettiğinizde uygulanır. Yalnızca düzenlediğiniz alanlar güncellenir.')}</p><details class="module-draft-note"><summary>Taslaklar nasıl saklanır?</summary><p>Sayfalar arasında geçiş yaptığınızda taslağınız bu sekmede korunur. Sayfayı yenilemeden önce değişikliklerinizi kaydedin.</p></details><button class="text-button" id="reload-values">${ikon('refresh')} Güncel değerleri yükle</button></div></aside></div></section>${altbilgi()}`;
}
function formGoster(modul, anahtar) {
  const taslak = durum.drafts.get(anahtar); const guildId = anahtar.split(':')[0];
  document.getElementById('main').innerHTML = modulSayfasi(modul, taslak, guildId);
  const yenile = () => { const adet = Object.keys(farklar(taslak)).length; document.getElementById('save-state').textContent = taslak.saving ? 'Ayarlar kaydediliyor…' : adet ? `${adet} alanda kaydedilmemiş değişiklik` : 'Tüm değişiklikler kaydedildi'; document.getElementById('save').disabled = !adet || taslak.saving; document.getElementById('discard').disabled = !adet || taslak.saving; document.querySelector('.form-actions').classList.toggle('is-dirty', adet > 0 || taslak.saving); };
  const alanlar = document.getElementById('fields');
  if (!modul.fields.length) {
    document.getElementById('settings-form').hidden = true;
    document.querySelector('.form-actions').hidden = true;
    document.querySelector('.module-settings-card').hidden = true;
  }
  const bolumler = new Map();
  for (const bolum of modul.sections || []) {
    const section = document.createElement('section'); section.className = 'settings-section'; section.dataset.section = bolum.id;
    const heading = document.createElement('h3'); heading.id = `section-${bolum.id}`; heading.textContent = bolum.label; heading.tabIndex = -1;
    const description = document.createElement('p'); description.className = 'section-description'; description.textContent = bolum.description;
    const fields = document.createElement('div'); fields.className = 'fields';
    section.setAttribute('aria-labelledby', heading.id); section.append(heading, description, fields); alanlar.append(section); bolumler.set(bolum.id, fields);
  }
  for (const alan of modul.fields) (bolumler.get(alan.section) || alanlar).append(alanOlustur(alan, taslak.values[alan.key], deger => { taslak.values[alan.key] = deger; yenile(); }));
  document.getElementById('back').onclick = () => git('modules');
  document.getElementById('discard').onclick = () => { taslak.values = kopya(taslak.original); taslak.error = ''; formGoster(modul, anahtar); };
  document.getElementById('reload-values').onclick = async () => {
    try { const veri = await api(`/guilds/${guildId}/settings/${encodeURIComponent(modul.id)}`); durum.drafts.set(anahtar, { ...veri, original: kopya(veri.values), error: '', saving: false }); if (`${durum.guildId}:${durum.route}` === anahtar) formGoster(modul, anahtar); }
    catch (hata) { bildir(hata.message, true); }
  };
  document.getElementById('settings-form').onsubmit = async olay => {
    olay.preventDefault(); if (taslak.saving) return; const changes = farklar(taslak); if (!Object.keys(changes).length) return; const gonderilen = kopya(taslak.values);
    taslak.saving = true; taslak.error = ''; document.getElementById('form-error').hidden = true; yenile();
    try {
      const veri = await api(`/guilds/${guildId}/settings/${encodeURIComponent(modul.id)}`, 'PATCH', { changes, revision: taslak.revision });
      for (const [k, v] of Object.entries(veri.values)) if (JSON.stringify(taslak.values[k]) === JSON.stringify(gonderilen[k])) taslak.values[k] = kopya(v);
      taslak.original = kopya(veri.values); taslak.revision = veri.revision; taslak.details = veri.details; taslak.options = veri.options; bildir(`${modul.label} ayarları kaydedildi.`);
    } catch (hata) { taslak.error = hata.message; bildir(hata.message, true); }
    finally { taslak.saving = false; if (`${durum.guildId}:${durum.route}` === anahtar) formGoster(modul, anahtar); }
  };
  islemleriGoster(modul, anahtar, yenile);
  yenile();
  document.querySelectorAll('[data-form-target]').forEach(button => button.onclick = () => {
    const target = document.getElementById(button.dataset.formTarget); if (!target) return;
    document.querySelectorAll('[data-form-target]').forEach(link => link.removeAttribute('aria-current'));
    button.setAttribute('aria-current', 'location');
    target.tabIndex = -1; target.focus({ preventScroll: true }); target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  });
  modulDurumlariniYukle();
}
function islemleriGoster(modul, anahtar, yenile) {
  const taslak = durum.drafts.get(anahtar); const guildId = anahtar.split(':')[0];
  const parent = document.querySelector('.module-editor');
  if (taslak.details?.length) {
    const section = document.createElement('section'); section.className = 'panel module-actions';
    const heading = document.createElement('h2'); heading.textContent = 'Mevcut kayıtlar'; section.append(heading);
    const list = document.createElement('ul');
    for (const detail of taslak.details) { const item = document.createElement('li'); item.textContent = typeof detail === 'string' ? detail : detail.label || detail.message; list.append(item); }
    section.append(list); parent.append(section);
  }
  const actions = modul.actions || [];
  const actionGroup = document.createElement('section'); actionGroup.className = 'panel module-action-group';
  if (actions.length) {
    actionGroup.innerHTML = `<div class="module-action-group-heading"><span class="module-action-symbol">${ikon('bolt')}</span><div><h2>${modul.fields.length ? 'Ek işlemler' : 'Modül işlemleri'}</h2><p>Bu işlemler kaydedilmiş ayarlarınızla çalışır.</p></div></div>`;
    parent.append(actionGroup);
  }
  for (const action of actions) {
    const form = document.createElement('form'); form.className = `module-actions${action.fields?.length ? '' : ' compact-action'}${action.danger ? ' danger-action' : ''}`; form.dataset.action = action.id; form.id = `module-action-${action.id}`;
    const heading = document.createElement('h3'); heading.textContent = action.label;
    const help = document.createElement('p'); help.className = 'field-hint'; help.textContent = action.description || 'Bu işlem kaydedilmiş ayarları kullanır.';
    const copy = document.createElement('div'); copy.className = 'module-action-copy'; copy.append(heading, help);
    const fields = document.createElement('div'); fields.className = 'fields';
    taslak.actionDrafts ||= {}; const input = taslak.actionDrafts[action.id] ||= Object.fromEntries((action.fields || []).map(f => [f.key, varsayilan(f)]));
    for (const field of action.fields || []) fields.append(alanOlustur(field, input[field.key], v => { input[field.key] = v; }));
    const button = document.createElement('button'); button.type = 'submit'; button.className = `btn ${action.danger ? 'danger' : action.fields?.length ? 'primary' : 'ghost'}`; button.textContent = action.label;
    const output = document.createElement('p'); output.className = 'action-result'; output.setAttribute('role', 'status');
    output.textContent = taslak.actionResults?.[action.id] || '';
    form.append(copy, fields, button, output); actionGroup.append(form);
    form.onsubmit = async event => {
      event.preventDefault(); if (taslak.saving) return;
      if (Object.keys(farklar(taslak)).length) { output.textContent = 'Önce ayar değişikliklerinizi kaydedin veya vazgeçin.'; return; }
      if (action.confirm && !window.confirm(action.confirm)) return;
      taslak.saving = true; parent.querySelectorAll('input,select,textarea,button').forEach(el => { el.disabled = true; }); output.textContent = 'İşlem sürüyor…'; yenile();
      try {
        const response = await api(`/guilds/${guildId}/settings/${encodeURIComponent(modul.id)}/actions/${encodeURIComponent(action.id)}`, 'POST', { input: kopya(input), revision: taslak.revision });
        for (const field of action.fields || []) if (field.resetAfterRun) input[field.key] = varsayilan(field);
        taslak.values = kopya(response.values); taslak.original = kopya(response.values); taslak.revision = response.revision;
        taslak.details = response.details; taslak.options = response.options;
        taslak.actionResults ||= {}; taslak.actionResults[action.id] = response.result?.message || 'İşlem tamamlandı.';
        const entities = await api(`/guilds/${guildId}/entities`); if (durum.guildId === guildId) durum.entities = entities;
        bildir(taslak.actionResults[action.id]);
      } catch (error) { taslak.actionResults ||= {}; taslak.actionResults[action.id] = error.message; bildir(error.message, true); }
      finally { taslak.saving = false; if (`${durum.guildId}:${durum.route}` === anahtar) formGoster(modul, anahtar); }
    };
  }
}
function hataGoster(hata) {
  const main = document.getElementById('main'); if (!main) return;
  main.innerHTML = `<div class="empty"><p>${kacir(hata.message)}</p><br><button class="btn" id="retry">${hata.status === 401 ? 'Yeniden giriş yap' : 'Tekrar dene'}</button></div>`;
  document.getElementById('retry').onclick = () => hata.status === 401 ? baslat() : sunucuYukle();
}
async function baslat() {
  const oauthHatasi = oauthHatasiniOku();
  try { const oturum = await api('/session'); oturumuUygula(oturum); if (!oturum.authenticated) return girisGoster(oauthHatasi); await uygulamayiAc(); }
  catch (hata) { girisGoster(hata.message); }
}
window.addEventListener('beforeunload', olay => { if (avatarDurumu.draft || avatarDurumu.loading || (durum.profileDraft !== null && durum.profileDraft.trim() !== profilAdi()) || [...durum.drafts.values()].some(d => Object.keys(farklar(d)).length)) { olay.preventDefault(); olay.returnValue = ''; } });
window.addEventListener('hashchange', () => { let rota; try { rota = decodeURIComponent(location.hash.slice(1)) || 'overview'; } catch { rota = 'overview'; } if (rota !== durum.route && durum.username) { durum.route = rota; rotaGoster(); } });
try { durum.route = decodeURIComponent(location.hash.slice(1)) || 'overview'; } catch { durum.route = 'overview'; }
setInterval(async () => {
  if (!durum.username || document.hidden || !durum.guildId) return;
  if (durum.route === 'modules' || durum.route.startsWith('category:')) { await modulDurumlariniYukle(); return; }
  if (durum.route !== 'overview') return;
  const guildId = durum.guildId; const navigation = durum.navigation;
  const gecerli = () => durum.guildId === guildId && durum.route === 'overview' && durum.navigation === navigation;
  try {
    const veri = await api(`/guilds/${guildId}/overview`);
    if (!gecerli()) return;
    durum.overview = veri; durum.overviewError = ''; genelBakis(true); await modulDurumlariniYukle();
  } catch (hata) {
    if (!gecerli()) return;
    durum.overviewError = hata.status === 401 ? 'Oturum süresi doldu' : 'Bağlantı kesildi';
    genelBakis(true);
  }
}, 30_000);
baslat();
