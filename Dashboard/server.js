const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { randomBytes, timingSafeEqual, createHash } = require('node:crypto');
const path = require('node:path');
const { getEnv, getRequiredEnv } = require('../Utils/Core/env');
const { OturumDeposu } = require('./sessionStore');
const { createProfileStore, normalizeAvatar } = require('./stores/profile');
const { AyarHatasi, kimlikDeseni, emojiListesi, yamaDogrula, gorunum } = require('./validation');
const { PermissionFlagsBits } = require('discord.js');
const { readAuthConfig } = require('./authConfig');
const { createDiscordOAuth } = require('./discordOAuth');
const { assertFieldAccess, assertFieldReadAccess, filterGuildEntities, assertActionAccess, assertModuleWriteAccess, assertModuleReadAccess, canViewChannel } = require('./guildAccess');

const belirtec = () => randomBytes(32).toString('hex');
const surum = veri => createHash('sha256').update(JSON.stringify(veri)).digest('hex');
function guvenliEsit(a, b) {
  return typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
function botKimligi(client) {
  return {
    name: client.user?.username || 'Bot',
    avatarUrl: client.user?.displayAvatarURL?.({ extension: 'png', size: 128, forceStatic: true }) || null,
  };
}
function ayarlariOku() {
  const auth = readAuthConfig();
  const ayarlar = {
    ...auth,
    username: auth.mode === 'local' ? getRequiredEnv('DASHBOARD_USERNAME') : undefined,
    passwordHash: auth.mode === 'local' ? getRequiredEnv('DASHBOARD_PASSWORD_HASH') : undefined,
    secret: getRequiredEnv('DASHBOARD_SESSION_SECRET'),
    host: getEnv('DASHBOARD_HOST', '127.0.0.1'),
    port: Number(getEnv('DASHBOARD_PORT', '3000')),
    https: getEnv('DASHBOARD_HTTPS', 'false') === 'true',
    proxy: getEnv('DASHBOARD_TRUST_PROXY', 'false') === 'true',
    allowedHosts: getEnv('DASHBOARD_ALLOWED_HOSTS', '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean),
  };
  if (auth.mode === 'local' && !/^\$2[aby]\$(1[0-5])\$[./A-Za-z0-9]{53}$/.test(ayarlar.passwordHash)) throw new Error('DASHBOARD_PASSWORD_HASH, dashboard:password ile üretilmiş geçerli bir bcrypt özeti olmalı.');
  if (ayarlar.secret.length < 32) throw new Error('DASHBOARD_SESSION_SECRET en az 32 karakter olmalı.');
  if (auth.mode === 'local' && (!ayarlar.username.trim() || ayarlar.username.length > 100)) throw new Error('DASHBOARD_USERNAME 1–100 karakter olmalı.');
  if (!Number.isInteger(ayarlar.port) || ayarlar.port < 1 || ayarlar.port > 65535) throw new Error('DASHBOARD_PORT 1–65535 arasında olmalı.');
  return ayarlar;
}

function createDashboard(client, ayarlar, enjekte = {}) {
  const app = express();
  const mode = ayarlar.mode || 'local';
  const oauthConfig = ayarlar.oauth || { enabled: false };
  const oauth = createDiscordOAuth(oauthConfig, enjekte.oauthFetch);
  const discordSession = req => req.session?.authMethod === 'discord';
  const username = req => discordSession(req) ? req.session.user.username : ayarlar.username;
  const profileKey = req => discordSession(req) ? `discord:${req.session.user.id}` : ayarlar.username;
  const sessionInfo = req => ({ authenticated: !!req.session.authenticated, csrf: req.session.csrf,
    username: req.session.authenticated ? username(req) : undefined,
    authMethod: req.session.authenticated ? req.session.authMethod || 'local' : undefined,
    user: req.session.authenticated && discordSession(req) ? req.session.user : undefined,
    auth: { mode, discordEnabled: !!oauthConfig.enabled, discordLoginUrl: '/auth/discord', configurationError: oauthConfig.enabled ? undefined : 'Discord ile giriş henüz yapılandırılmadı.' },
    bot: botKimligi(client),
  });
  const kayit = enjekte.registry || require('./registry').createRegistry(client);
  const visibleRegistry = req => discordSession(req) ? kayit.filter(m => m.scope !== 'global' && m.id !== 'aktif-uye').map(m => ({ ...m,
    details: m.id === 'uyari' ? undefined : m.details,
    actions: (m.actions || []).filter(a => !(m.id === 'yedek' && a.id === 'zip') && !(m.id === 'uyari' && a.id === 'import-legacy')),
  })) : kayit;
  const depo = new OturumDeposu();
  const profiles = enjekte.profiles || createProfileStore();
  const kuyruklar = new Map();
  const kilitler = new Map();
  app.disable('x-powered-by');
  if (ayarlar.proxy) app.set('trust proxy', 'loopback');
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'https://cdn.discordapp.com', 'https://media.discordapp.net', 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], formAction: ["'self'"], upgradeInsecureRequests: ayarlar.https ? [] : null } },
    strictTransportSecurity: ayarlar.https ? undefined : false,
    referrerPolicy: { policy: 'no-referrer' },
  }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (mode === 'public' && ayarlar.publicUrl && req.hostname.toLowerCase() !== new URL(ayarlar.publicUrl).hostname.toLowerCase()) return res.status(403).json({ error: 'İstek adresine izin verilmiyor.' });
    if (['127.0.0.1', 'localhost', '::1'].includes(ayarlar.host) && !['127.0.0.1', 'localhost', '[::1]', '::1', ...(ayarlar.publicUrl ? [new URL(ayarlar.publicUrl).hostname.toLowerCase()] : []), ...(ayarlar.allowedHosts || [])].includes(req.hostname.toLowerCase())) return res.status(403).json({ error: 'İstek adresine izin verilmiyor.' });
    if (ayarlar.https && !req.secure) return res.status(400).json({ error: 'Bu dashboard HTTPS bağlantısı gerektirir.' });
    next();
  });
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Çok fazla istek. Bir dakika sonra tekrar deneyin.' } }));
  const json = express.json({ limit: '256kb' });
  app.use((req, res, next) => req.method === 'PUT' && req.path === '/api/profile/avatar' ? next() : json(req, res, next));
  app.use(session({
    name: 'arvis.sid', secret: ayarlar.secret, store: depo, resave: false, saveUninitialized: false, rolling: true,
    cookie: { httpOnly: true, sameSite: oauthConfig.enabled ? 'lax' : 'strict', secure: !!ayarlar.https, maxAge: 30 * 60_000 },
  }));
  app.use((req, res, next) => {
    if (req.session.authenticated && (Date.now() - req.session.startedAt > 8 * 60 * 60_000 || (discordSession(req) && (!req.session.discord || req.session.discord.expiresAt <= Date.now())))) {
      return req.session.regenerate(error => {
        if (error) return next(error);
        if (req.path.startsWith('/api/') && req.path !== '/api/session') return res.status(401).json({ error: 'Oturum süreniz doldu. Yeniden giriş yapın.' });
        next();
      });
    }
    next();
  });
  app.use('/auth/discord', rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Çok fazla Discord giriş denemesi. 15 dakika sonra tekrar deneyin.' } }));
  app.get('/auth/discord', oauth.begin);
  app.get('/auth/discord/callback', oauth.callback);
  app.get('/api/session', (req, res) => {
    req.session.csrf ||= belirtec();
    res.json(sessionInfo(req));
  });
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !guvenliEsit(req.get('X-CSRF-Token'), req.session.csrf)) return res.status(403).json({ error: 'Güvenlik doğrulaması geçersiz. Sayfayı yenileyin.' });
    next();
  });
  app.post('/api/login', rateLimit({ windowMs: 15 * 60_000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.' } }), async (req, res) => {
    if (mode === 'public') return res.status(403).json({ error: 'Bu dashboard için Discord ile giriş yapın.' });
    const onceki = kilitler.get(req.ip);
    if (onceki?.until > Date.now()) return res.status(429).json({ error: 'Giriş geçici olarak kilitlendi. 15 dakika sonra tekrar deneyin.' });
    const { username, password } = req.body || {};
    const parolaUygun = typeof password === 'string' && Buffer.byteLength(password) <= 72;
    const dogruParola = await bcrypt.compare(parolaUygun ? password : '', ayarlar.passwordHash);
    if (!parolaUygun || !guvenliEsit(username, ayarlar.username) || !dogruParola) {
      const guncel = kilitler.get(req.ip);
      const sayi = guncel && Date.now() - guncel.time < 15 * 60_000 ? guncel.count + 1 : 1;
      if (kilitler.size >= 1000) kilitler.delete(kilitler.keys().next().value);
      kilitler.set(req.ip, { count: sayi, time: Date.now(), until: sayi >= 5 ? Date.now() + 15 * 60_000 : 0 });
      console.warn(`🔴 [DASHBOARD] Başarısız giriş denemesi (${req.ip}).`);
      return res.status(401).json({ error: 'Kullanıcı adı veya parola hatalı.' });
    }
    kilitler.delete(req.ip);
    await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.authenticated = true; req.session.startedAt = Date.now(); req.session.csrf = belirtec();
    req.session.authMethod = 'local';
    await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    res.json(sessionInfo(req));
  });
  app.use('/api', (req, res, next) => req.session.authenticated ? next() : res.status(401).json({ error: 'Bu işlem için giriş yapın.' }));
  app.post('/api/logout', (req, res) => req.session.destroy(() => { res.clearCookie('arvis.sid', { path: '/' }); res.json({ ok: true }); }));
  app.get('/api/profile/avatar', (req, res) => res.json(profiles.read(profileKey(req))));
  app.put('/api/profile/avatar', express.json({ limit: '400kb' }), async (req, res) => {
    if (!req.body || Array.isArray(req.body) || Object.keys(req.body).length !== 1 || !Object.hasOwn(req.body, 'avatar')) throw new AyarHatasi('Yalnızca avatar alanını gönderin.');
    const avatar = await normalizeAvatar(req.body.avatar);
    res.json(profiles.write(profileKey(req), avatar));
  });
  app.get('/api/registry', (req, res) => res.json(visibleRegistry(req).map(({ read, write, validate, details, options, ...tanim }) => ({ ...tanim, actions: (tanim.actions || []).map(({ run, ...action }) => action) }))));
  app.get('/api/guilds', async (req, res) => {
    const allowed = discordSession(req) ? new Set((await oauth.guilds(req.session)).map(g => g.id)) : null;
    res.json([...client.guilds.cache.values()].filter(g => !allowed || allowed.has(g.id)).map(g => ({ id: g.id, name: g.name, memberCount: g.memberCount, icon: g.iconURL?.({ size: 64 }) || null })));
  });
  const authorizeGuild = async req => {
    if (!discordSession(req)) return;
    if (!client.isReady()) throw new AyarHatasi('Discord bağlantısı bekleniyor. Lütfen tekrar deneyin.', 503);
    if (!client.guilds.cache.has(req.guild.id)) throw new AyarHatasi('Bot artık bu sunucuda değil.', 403);
    const allowed = await oauth.guilds(req.session);
    if (!allowed.some(g => g.id === req.guild.id)) throw new AyarHatasi('Bu sunucuyu yönetme yetkiniz yok. Sunucuyu Yönet veya Yönetici izni gerekir.', 403);
    try { req.member = await req.guild.members.fetch({ user: req.session.user.id, force: true }); }
    catch (error) { throw new AyarHatasi(error.code === 10007 ? 'Artık bu sunucunun üyesi değilsiniz.' : 'Sunucu üyeliği doğrulanamadı. Lütfen tekrar deneyin.', error.code === 10007 ? 403 : 503); }
    if (!req.member || (req.guild.ownerId !== req.session.user.id && !req.member.permissions?.has(PermissionFlagsBits.ManageGuild))) throw new AyarHatasi('Bu sunucuyu yönetme yetkiniz yok.', 403);
  };
  app.use('/api/guilds/:guildId', async (req, res, next) => {
    const guild = kimlikDeseni.test(req.params.guildId) && client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Sunucu bulunamadı veya bot bu sunucuda değil.' });
    if (!client.isReady() && !(req.method === 'GET' && req.path === '/overview')) return res.status(503).json({ error: 'Discord bağlantısı bekleniyor. Lütfen tekrar deneyin.' });
    req.guild = guild;
    await authorizeGuild(req);
    next();
  });
  app.get('/api/guilds/:guildId/entities', (req, res) => {
    const entities = req.member ? filterGuildEntities(req.guild, req.member) : { channels: [...req.guild.channels.cache.values()], roles: [...req.guild.roles.cache.values()] };
    res.json({
    channels: entities.channels.map(c => ({ id: c.id, name: c.name, type: c.type })).sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    roles: entities.roles.filter(r => r.id !== req.guild.id && !r.managed).map(r => ({ id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    emojis: emojiListesi(client, req.guild),
    });
  });
  app.get('/api/guilds/:guildId/overview', (req, res) => {
    const metrics = require('../Utils/Core/botMetrics').dashboardMetrics(client, req.guild);
    if (req.member && !canViewChannel(req.guild, req.member, req.guild.systemChannel)) metrics.systemChannel = null;
    res.json(metrics);
  });
  app.get('/api/guilds/:guildId/module-statuses', async (req, res) => res.json(await require('./moduleStatus').readModuleStatuses(visibleRegistry(req), req.guild, client)));
  const modulBul = req => {
    const modul = visibleRegistry(req).find(m => m.id === req.params.moduleId);
    if (!modul) throw new AyarHatasi('Ayar modülü bulunamadı.', 404);
    if (req.member) assertModuleReadAccess(modul.id, req.guild, req.member);
    if (!modul.read || !modul.write) throw new AyarHatasi('Modül bağlantısı kullanılamıyor.', 503);
    return modul;
  };
  const oku = async (modul, guild) => gorunum(modul, await modul.read(guild));
  const yanit = async (modul, guild, member) => {
    const values = await oku(modul, guild);
    if (member) assertFieldReadAccess(modul.fields, values, guild, member);
    return { values, revision: surum(values), details: await modul.details?.(guild, member), options: await modul.options?.(guild) };
  };
  app.get('/api/guilds/:guildId/settings/:moduleId', async (req, res) => {
    res.json(await yanit(modulBul(req), req.guild, req.member));
  });
  app.patch('/api/guilds/:guildId/settings/:moduleId', async (req, res) => {
    const modul = modulBul(req);
    const yama = yamaDogrula(modul, req.body?.changes, req.guild, client);
    const anahtar = modul.store;
    const onceki = kuyruklar.get(anahtar) || Promise.resolve();
    const islem = onceki.catch(() => {}).then(async () => {
      await authorizeGuild(req);
      const mevcut = await oku(modul, req.guild);
      if (!guvenliEsit(req.body?.revision, surum(mevcut))) throw new AyarHatasi('Ayarlar başka bir yerden değiştirildi. Güncel değerleri yükleyip tekrar deneyin.', 409);
      if (req.member) {
        assertModuleWriteAccess(modul.id, req.guild, req.member, { ...mevcut, ...req.body.changes });
        assertFieldAccess(modul.fields, mevcut, req.guild, req.member);
        assertFieldAccess(modul.fields, { ...mevcut, ...req.body.changes }, req.guild, req.member);
      }
      await modul.validate?.(yama, req.guild);
      await modul.write(req.guild, yama);
      await require('../Utils/Database/runtime').flushDatabase();
      return yanit(modul, req.guild, req.member);
    });
    kuyruklar.set(anahtar, islem);
    try { res.json(await islem); }
    finally { if (kuyruklar.get(anahtar) === islem) kuyruklar.delete(anahtar); }
  });
  app.post('/api/guilds/:guildId/settings/:moduleId/actions/:actionId', async (req, res) => {
    const modul = modulBul(req);
    const action = modul.actions?.find(a => a.id === req.params.actionId);
    if (!action) throw new AyarHatasi('İşlem bulunamadı.', 404);
    const fields = action.fields || [];
    const supplied = req.body?.input;
    if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied) || fields.some(f => !Object.hasOwn(supplied, f.key))) throw new AyarHatasi('İşlem alanları eksik.');
    const input = fields.length ? yamaDogrula({ fields }, supplied, req.guild, client) : {};
    if (!fields.length && Object.keys(supplied).length) throw new AyarHatasi('Bilinmeyen işlem alanı.');
    const anahtar = modul.store;
    const onceki = kuyruklar.get(anahtar) || Promise.resolve();
    const islem = onceki.catch(() => {}).then(async () => {
      await authorizeGuild(req);
      const mevcut = await oku(modul, req.guild);
      if (!guvenliEsit(req.body?.revision, surum(mevcut))) throw new AyarHatasi('Ayarlar değişti. Güncel değerleri yükleyip tekrar deneyin.', 409);
      if (req.member) {
        assertFieldAccess(modul.fields, mevcut, req.guild, req.member);
        assertFieldAccess(fields, input, req.guild, req.member);
        await assertActionAccess(modul.id, action.id, req.guild, req.member, input, mevcut);
      }
      const result = await action.run(req.guild, input, { username: username(req), userId: req.session.user?.id }, req.member);
      await require('../Utils/Database/runtime').flushDatabase();
      return { ...await yanit(modul, req.guild, req.member), result };
    });
    kuyruklar.set(anahtar, islem);
    try { res.json(await islem); }
    finally { if (kuyruklar.get(anahtar) === islem) kuyruklar.delete(anahtar); }
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'İşlem bulunamadı.' }));
  app.use(express.static(path.join(__dirname, 'public'), { etag: true, maxAge: 0 }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.status === 401 && discordSession(req)) req.session.destroy(() => {});
    const bilinen = err instanceof AyarHatasi || ['RaidProtectionConfigError', 'AutoModConfigError', 'RangeError', 'TypeError'].includes(err.name);
    const durum = err.status || (bilinen ? 400 : 500);
    if (durum >= 500 && durum !== 501) console.error('🔴 [DASHBOARD] İşlem tamamlanamadı. Depolama veya Discord bağlantısını kontrol edin.');
    res.status(durum >= 400 && durum <= 599 ? durum : 500).json({ error: bilinen ? err.message : durum === 413 ? 'İstek çok büyük.' : 'İşlem tamamlanamadı. Lütfen tekrar deneyin.' });
  });
  return { app, close: () => { depo.close(); oauth.close(); } };
}

async function startDashboard(client) {
  if (getEnv('DASHBOARD_ENABLED', 'false') !== 'true') return null;
  let ayarlar;
  try { ayarlar = ayarlariOku(); }
  catch (error) { console.error(`🔴 [DASHBOARD] ${error.message}`); throw error; }
  const dashboard = createDashboard(client, ayarlar);
  const server = await new Promise((resolve, reject) => {
    const sunucu = dashboard.app.listen(ayarlar.port, ayarlar.host, error => {
      if (error) reject(error);
      else resolve(sunucu);
    });
    sunucu.once('error', reject);
  }).catch(error => {
    dashboard.close();
    throw error;
  });
  server.on('close', dashboard.close);
  if (!['127.0.0.1', 'localhost', '::1'].includes(ayarlar.host)) console.warn('⚠️ [DASHBOARD] Yerel ağ dışı dinleme açık! TLS ters vekili ve ağ erişim sınırı kullanın.');
  console.log(`✔️ [DASHBOARD] Hazır: ${ayarlar.publicUrl || `${ayarlar.https ? 'https' : 'http'}://${ayarlar.host}:${ayarlar.port}`} (${ayarlar.mode})`);
  return server;
}
module.exports = { startDashboard, createDashboard, ayarlariOku };
