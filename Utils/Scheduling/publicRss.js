'use strict';
const dns = require('node:dns').promises;
const https = require('node:https');
const net = require('node:net');
const Parser = require('rss-parser');

function publicAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 2)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }

  const normalized = address.toLowerCase();
  return net.isIPv6(address) && /^[23][0-9a-f]{3}:/.test(normalized)
    && !/^2002:/.test(normalized) && !/^2001:(?:0:|db8:|10:|20:)/.test(normalized)
    && !/^3fff:/.test(normalized);
}
function publicUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Geçerli bir HTTPS RSS adresi girin.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('RSS kaynağı standart HTTPS adresi olmalı.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || (!host.includes('.') && !net.isIP(host)) || (net.isIP(host) && !publicAddress(host))) throw new Error('Yerel veya özel ağ adresleri RSS kaynağı olarak kullanılamaz.');
  return url;
}
async function resolvePublic(raw) {
  const url = publicUrl(raw);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new Error('RSS kaynağı yalnızca genel internet adreslerine çözümlenebilir.');
  return { url, address: addresses[0] };
}
async function fetchPublicText(raw, redirects = 0) {
  if (redirects > 3) throw new Error('RSS kaynağı çok fazla yönlendirme yaptı.');
  const { url, address } = await resolvePublic(raw);
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      lookup: (_host, options, callback) => options?.all ? callback(null, [address]) : callback(null, address.address, address.family),
      agent: false, timeout: 15000, headers: { 'User-Agent': 'ArviS-RSS/1.0', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        try { resolve(fetchPublicText(new URL(response.headers.location, url).href, redirects + 1)); } catch (error) { reject(error); }
        return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`RSS kaynağı HTTP ${response.statusCode} döndürdü.`)); return; }
      const chunks = []; let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > 2 * 1024 * 1024) { response.destroy(new Error('RSS kaynağı 2 MB sınırını aşıyor.')); } else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('timeout', () => req.destroy(new Error('RSS kaynağı zaman aşımına uğradı.')));
    req.on('error', reject);
  });
}
async function fetchPublicFeed(url) { return new Parser().parseString(await fetchPublicText(url)); }
module.exports = { publicAddress, publicUrl, resolvePublic, fetchPublicText, fetchPublicFeed };