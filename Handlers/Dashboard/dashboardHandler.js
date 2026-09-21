const fs = require('node:fs');
const path = require('node:path');
const { getEnv } = require('../../Utils/Core/env');
const { renderLoadPanel } = require('../../Utils/Core/terminalUI');

const dashboardFiles = [
  { name: 'SERVER', folder: '', files: ['server.js', 'registry.js', 'sessionStore.js', 'validation.js', 'authConfig.js', 'discordOAuth.js', 'guildAccess.js'] },
  { name: 'STORES', folder: 'stores', files: ['atomik.js', 'durumRol.js', 'ghostPing.js', 'girisCikis.js', 'otoPublish.js', 'otoThread.js'] },
  { name: 'PUBLIC', folder: 'public', files: ['app.js', 'favicon.svg', 'index.html', 'style.css'] },
  { name: 'SCRIPTS', folder: 'scripts', files: ['password.js'] },
];

function dashboardLoadGroups(server, startupError) {
  return dashboardFiles.map(({ name, folder, files }) => ({
    name,
    items: files.map(file => {
      const filePath = path.join(__dirname, '../../Dashboard', folder, file);
      const item = { name: file, status: 'skipped', detail: 'Başlatma tamamlanmadı' };

      try {
        if (!fs.statSync(filePath).isFile()) throw new Error('NOT_A_FILE');
        fs.accessSync(filePath, fs.constants.R_OK);
      } catch (error) {
        return { ...item, status: 'failed', detail: error.code === 'ENOENT' ? 'Dosya bulunamadı' : 'Dosya okunamadı' };
      }

      if (folder === 'scripts') return { ...item, status: 'ignored', detail: 'Manuel yardımcı araç' };
      if (file === 'server.js' && startupError) return { ...item, status: 'failed', detail: 'Başlatma hatası' };
      if (folder === 'public') return server ? { name: file, status: 'loaded' } : item;
      if (require.cache[filePath]?.loaded) return { name: file, status: 'loaded' };
      return { ...item, detail: server ? 'Kullanılmayan modül' : item.detail };
    }),
  }));
}

async function loadDashboard(client) {
  if (getEnv('DASHBOARD_ENABLED', 'false') !== 'true') return null;

  const startedAt = Date.now();
  let server;
  let startupError;
  try {
    server = await require('../../Dashboard/server').startDashboard(client);
  } catch (error) {
    startupError = error;
  }

  const groups = dashboardLoadGroups(server, startupError);
  const counts = { loaded: 0, skipped: 0, ignored: 0, failed: 0 };
  for (const group of groups) {
    for (const item of group.items) counts[item.status]++;
  }

  let footer = 'DASHBOARD BAŞLATILAMADI · HATA KAYDINI KONTROL EDİN';
  if (server) {
    const host = getEnv('DASHBOARD_HOST', '127.0.0.1');
    const urlHost = host.includes(':') ? `[${host}]` : host;
    const protocol = getEnv('DASHBOARD_HTTPS', 'false') === 'true' ? 'https' : 'http';
    const url = getEnv('DASHBOARD_PUBLIC_URL', '') || `${protocol}://${urlHost}:${server.address().port}`;
    footer = `DASHBOARD ÇEVRİMİÇİ · ${url} · ${counts.failed > 0 ? `${counts.failed} HATALI DOSYA BULUNDU` : 'HATALI DOSYA BULUNAMADI'}`;
  }

  console.log(renderLoadPanel({
    title: '◆ DASHBOARD LOADER',
    groups,
    counts,
    durationMs: Date.now() - startedAt,
    footer,
    footerStatus: startupError ? 'failed' : counts.failed > 0 ? 'warning' : 'success',
  }));

  if (startupError) throw startupError;
  return server;
}

module.exports = { loadDashboard };
