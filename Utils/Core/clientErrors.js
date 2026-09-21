const INSTALLED = Symbol('clientErrorHandler');

function installClientErrorHandler(client, logger = console) {
  if (client[INSTALLED]) return;
  client[INSTALLED] = true;

  client.on('error', error => {
    if ([10062, 40060].includes(Number(error?.code))) {
      logger.warn(`⚠️ [DISCORD] Etkileşim süresi doldu veya daha önce yanıtlandı (kod ${error.code}). Paneli yeniden açın.`);
      return;
    }
    logger.error('🔴 [DISCORD] Olay işlenemedi:', error?.stack || error?.message || 'Bilinmeyen hata.');
  });
}

module.exports = { installClientErrorHandler };
