const fs = require("fs");
const path = require("path");
const { renderLoadPanel } = require("../../Utils/Core/terminalUI");

function listenerSnapshot(...emitters) {
  const snapshot = new Map();

  for (let emitterIndex = 0; emitterIndex < emitters.length; emitterIndex++) {
    const emitter = emitters[emitterIndex];
    if (!emitter || typeof emitter.eventNames !== "function" || typeof emitter.listenerCount !== "function") {
      continue;
    }

    for (const eventName of emitter.eventNames()) {
      snapshot.set(`${emitterIndex}:${String(eventName)}`, emitter.listenerCount(eventName));
    }
  }

  return snapshot;
}

function hasNewListeners(before, ...emitters) {
  for (let emitterIndex = 0; emitterIndex < emitters.length; emitterIndex++) {
    const emitter = emitters[emitterIndex];
    if (!emitter || typeof emitter.eventNames !== "function" || typeof emitter.listenerCount !== "function") {
      continue;
    }

    for (const eventName of emitter.eventNames()) {
      const key = `${emitterIndex}:${String(eventName)}`;
      if (emitter.listenerCount(eventName) > (before.get(key) || 0)) return true;
    }
  }

  return false;
}

function loadEvents(client) {
  const startedAt = Date.now();
  const eventsDir = path.join(__dirname, "../../Events");
  const groups = [];
  const counts = { loaded: 0, skipped: 0, ignored: 0, failed: 0 };

  if (!fs.existsSync(eventsDir)) {
    console.log(renderLoadPanel({
      title: "◆ EVENT LOADER",
      groups,
      counts: { loaded: 0, skipped: 0, ignored: 0, failed: 1 },
      durationMs: Date.now() - startedAt,
      footer: "EVENTS KLASÖRÜ BULUNAMADI · KONTROL İPTAL EDİLDİ",
      footerStatus: "failed",
      total: 0,
    }));
    return { ...counts, failed: 1, total: 0, groups };
  }

  const folders = fs.readdirSync(eventsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));

  for (const folder of folders) {
    const folderPath = path.join(eventsDir, folder.name);
    const files = fs.readdirSync(folderPath)
      .filter((file) => file.endsWith(".js"))
      .sort((a, b) => a.localeCompare(b, "tr"));
    const items = [];

    for (const file of files) {
      const filePath = path.join(folderPath, file);

      try {
        const listenersBeforeRequire = listenerSnapshot(client, client.rest);
        const event = require(filePath);

        if (event?.eventLoaderIgnore === true) {
          items.push({ name: file, status: "ignored", detail: "Yardımcı modül" });
          counts.ignored++;
          continue;
        }

        if (event?.name && typeof event.execute === "function") {
          const emitter = event.rest ? client.rest : client;
          const method = event.once ? "once" : "on";
          emitter[method](event.name, (...args) => event.execute(...args, client));
        } else if (typeof event === "function") {
          event(client);
        } else if (!hasNewListeners(listenersBeforeRequire, client, client.rest)) {
          items.push({ name: file, status: "skipped", detail: "Geçersiz event yapısı" });
          counts.skipped++;
          continue;
        }

        items.push({ name: file, status: "loaded" });
        counts.loaded++;
      } catch (error) {
        items.push({ name: file, status: "failed", detail: "Hata" });
        counts.failed++;
        console.error(`🔴 [EVENT] ${file} yüklenirken hata oluştu:`, error);
      }
    }

    if (items.length > 0) {
      groups.push({ name: folder.name, label: folder.name.toUpperCase(), items });
    }
  }

  const total = counts.loaded + counts.skipped + counts.ignored + counts.failed;
  const errorSummary = counts.failed > 0
    ? `${counts.failed} HATALI EVENT BULUNDU`
    : "HATALI EVENT BULUNAMADI";

  console.log(renderLoadPanel({
    title: "◆ EVENT LOADER",
    groups,
    counts,
    durationMs: Date.now() - startedAt,
    footer: `KONTROL TAMAMLANDI · ${counts.loaded} EVENT DOĞRULANDI · ${errorSummary}`,
    footerStatus: counts.failed > 0 ? "warning" : "success",
    total,
  }));

  return { ...counts, total, groups };
}

module.exports = { loadEvents };
