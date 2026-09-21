const { randomBytes, timingSafeEqual } = require('node:crypto');
const { AyarHatasi, kimlikDeseni } = require('./validation');

const SCOPES = ['identify', 'guilds'];
const MANAGE_GUILD = 32n;
const ADMINISTRATOR = 8n;
function canManageGuild(guild) {
  if (guild.owner === true) return true;
  try { return (BigInt(guild.permissions || '0') & (MANAGE_GUILD | ADMINISTRATOR)) !== 0n; }
  catch { return false; }
}
function safeEqual(a, b) {
  return typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
const save = req => new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));

function createDiscordOAuth(config, fetcher = globalThis.fetch) {
  const pending = new Map();
  const requests = new Map();
  async function api(route, options = {}) {
    let response;
    try { response = await fetcher(`https://discord.com/api/v10${route}`, { ...options, redirect: 'error', signal: AbortSignal.timeout(10_000) }); }
    catch { throw new AyarHatasi('Discord bağlantısı kurulamadı. Lütfen tekrar deneyin.', 503); }
    if (!response.ok) {
      if (response.status === 401) throw new AyarHatasi('Discord oturumunuz geçersiz. Yeniden giriş yapın.', 401);
      throw new AyarHatasi(response.status === 429 ? 'Discord istek sınırına ulaşıldı. Biraz sonra tekrar deneyin.' : 'Discord doğrulaması tamamlanamadı. Lütfen tekrar deneyin.', 503);
    }
    try { return await response.json(); }
    catch { throw new AyarHatasi('Discord yanıtı okunamadı. Lütfen tekrar deneyin.', 503); }
  }
  async function begin(req, res) {
    if (!config.enabled) return res.redirect('/?auth_error=unavailable');
    const now = Date.now();
    for (const [state, value] of pending) if (value.expiresAt <= now || value.sessionId === req.sessionID) pending.delete(state);
    if (pending.size >= 1000) pending.delete(pending.keys().next().value);
    const state = randomBytes(32).toString('hex');
    pending.set(state, { sessionId: req.sessionID, expiresAt: now + 10 * 60_000 });
    req.session.oauthState = state;
    await save(req);
    const url = new URL('https://discord.com/oauth2/authorize');
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', scope: SCOPES.join(' '), state }).toString();
    return res.redirect(url.toString());
  }
  async function callback(req, res) {
    if (!config.enabled) return res.redirect('/?auth_error=unavailable');
    const { state, code, error } = req.query;
    const attempt = typeof state === 'string' && pending.get(state);
    if (!attempt || attempt.sessionId !== req.sessionID || !safeEqual(state, req.session.oauthState)) return res.redirect('/?auth_error=state');
    pending.delete(state);
    delete req.session.oauthState;
    await save(req);
    if (attempt.expiresAt <= Date.now()) return res.redirect('/?auth_error=expired');
    if (error) return res.redirect('/?auth_error=denied');
    if (typeof code !== 'string' || !code || code.length > 2048) return res.redirect('/?auth_error=failed');
    let regenerated = false;
    try {
      const token = await api('/oauth2/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'authorization_code', code, redirect_uri: config.redirectUri }).toString(),
      });
      if (typeof token.access_token !== 'string' || token.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(token.expires_in) || token.expires_in <= 0 || !SCOPES.every(scope => String(token.scope || '').split(' ').includes(scope))) throw new Error('Invalid OAuth response');
      const profile = await api('/users/@me', { headers: { Authorization: `Bearer ${token.access_token}` } });
      if (!kimlikDeseni.test(profile.id) || typeof profile.username !== 'string') throw new Error('Invalid Discord identity');
      const avatar = typeof profile.avatar === 'string' && /^[a-zA-Z0-9_]+$/.test(profile.avatar) ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=128` : null;
      await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
      regenerated = true;
      req.session.authenticated = true;
      req.session.authMethod = 'discord';
      req.session.startedAt = Date.now();
      req.session.csrf = randomBytes(32).toString('hex');
      req.session.user = { id: profile.id, username: profile.username, displayName: profile.global_name || profile.username, avatarUrl: avatar };
      req.session.discord = { accessToken: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
      await save(req);
      return res.redirect('/');
    } catch {
      if (regenerated) await new Promise(resolve => req.session.destroy(resolve));
      return res.redirect('/?auth_error=failed');
    }
  }
  async function guilds(session) {
    const credentials = session.discord;
    if (!credentials || credentials.expiresAt <= Date.now()) throw new AyarHatasi('Discord oturumunuz doldu. Yeniden giriş yapın.', 401);
    if (requests.has(credentials.accessToken)) return requests.get(credentials.accessToken);
    const work = (async () => {
      const guilds = [];
      let after = '';
      for (let page = 0; page < 10; page++) {
        const result = await api(`/users/@me/guilds?limit=200${after ? `&after=${after}` : ''}`, { headers: { Authorization: `Bearer ${credentials.accessToken}` } });
        if (!Array.isArray(result) || result.some(g => !kimlikDeseni.test(g.id))) throw new AyarHatasi('Discord sunucu listesi doğrulanamadı.', 503);
        guilds.push(...result);
        if (result.length < 200) return guilds.filter(canManageGuild);
        const next = result.at(-1).id;
        if (next === after) break;
        after = next;
      }
      throw new AyarHatasi('Discord sunucu listesi tamamlanamadı. Lütfen tekrar deneyin.', 503);
    })();
    requests.set(credentials.accessToken, work);
    try { return await work; }
    finally { requests.delete(credentials.accessToken); }
  }
  return { begin, callback, guilds, close() { pending.clear(); requests.clear(); } };
}

module.exports = { createDiscordOAuth, canManageGuild, SCOPES };
