const { getEnv, getRequiredEnv } = require('../Utils/Core/env');

const CALLBACK_PATH = '/auth/discord/callback';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const OAUTH_KEYS = ['DISCORD_OAUTH_CLIENT_ID', 'DISCORD_OAUTH_CLIENT_SECRET', 'DISCORD_OAUTH_REDIRECT_URI'];

function readValue(key) {
  return String(getEnv(key, '')).trim();
}

function parseUrl(value, key, publicMode, originOnly = false) {
  let parsed;
  if (!/^https?:\/\//i.test(value) || value.includes('\\')) {
    throw new Error(`${key} http:// veya https:// ile başlayan tam bir URL olmalı.`);
  }
  try { parsed = new URL(value); } catch { throw new Error(`${key} geçerli, tam bir URL olmalı.`); }
  if (parsed.username || parsed.password || /[\s@?#]/.test(value)) {
    throw new Error(`${key} kullanıcı bilgisi, boşluk, sorgu veya bağlantı parçası içermemeli.`);
  }
  const loopback = LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback && !publicMode)) {
    throw new Error(`${key} HTTPS kullanmalı, HTTP yalnızca local modda localhost, 127.0.0.1 veya [::1] için kullanılabilir.`);
  }
  if (originOnly && (!/^https?:\/\/[^/]+\/?$/i.test(value) || parsed.pathname !== '/')) {
    throw new Error(`${key} yalnızca alan adı kökünü içermeli (ÖRNEK: https://alkan.web.tr).`);
  }
  return parsed;
}

function readAuthConfig() {
  const mode = readValue('DASHBOARD_MODE') || 'local';
  if (!['local', 'public'].includes(mode)) throw new Error('DASHBOARD_MODE yalnızca local veya public olabilir.');
  const publicMode = mode === 'public';
  const oauthValues = OAUTH_KEYS.map(readValue);
  if (publicMode || oauthValues.some(Boolean)) {
    for (const key of OAUTH_KEYS) {
      if (!readValue(key)) {
        if (!getEnv(key)) getRequiredEnv(key);
        throw new Error(`${key} Settings/.env dosyasında boş bırakılamaz.`);
      }
    }
  }
  const [clientId, clientSecret, redirectUri] = oauthValues;
  const enabled = oauthValues.every(Boolean);
  if (enabled && !/^\d{17,20}$/.test(clientId)) {
    throw new Error('DISCORD_OAUTH_CLIENT_ID 17–20 basamaklı Discord uygulama kimliği olmalı.');
  }
  const configuredPublicUrl = readValue('DASHBOARD_PUBLIC_URL');
  if (publicMode && !configuredPublicUrl) {
    if (!getEnv('DASHBOARD_PUBLIC_URL')) getRequiredEnv('DASHBOARD_PUBLIC_URL');
    throw new Error('DASHBOARD_PUBLIC_URL Settings/.env dosyasında boş bırakılamaz.');
  }
  const publicUrl = configuredPublicUrl ? parseUrl(configuredPublicUrl, 'DASHBOARD_PUBLIC_URL', publicMode, true).origin : '';
  if (enabled) {
    const redirect = parseUrl(redirectUri, 'DISCORD_OAUTH_REDIRECT_URI', publicMode);
    if (redirect.pathname !== CALLBACK_PATH) {
      throw new Error(`DISCORD_OAUTH_REDIRECT_URI yolu ${CALLBACK_PATH} olmalı.`);
    }
    if (publicMode && redirectUri !== `${publicUrl}${CALLBACK_PATH}`) {
      throw new Error(`DISCORD_OAUTH_REDIRECT_URI, DASHBOARD_PUBLIC_URL ve ${CALLBACK_PATH} yolunun birleşimiyle birebir aynı olmalı.`);
    }
  }
  if (publicMode) {
    if (getEnv('DASHBOARD_HTTPS', 'false') !== 'true') throw new Error('Public dashboard için DASHBOARD_HTTPS=true olmalı.');
    if (getEnv('DASHBOARD_TRUST_PROXY', 'false') !== 'true') throw new Error('Public dashboard için DASHBOARD_TRUST_PROXY=true olmalı.');
    if (!['localhost', '127.0.0.1', '::1'].includes(readValue('DASHBOARD_HOST') || '127.0.0.1')) {
      throw new Error('Public dashboard için DASHBOARD_HOST=127.0.0.1, localhost veya ::1 olmalı; HTTPS ters vekil aynı makinede çalışmalı.');
    }
  }
  return { mode, oauth: { enabled, clientId, clientSecret, redirectUri }, publicUrl };
}

module.exports = { readAuthConfig };
