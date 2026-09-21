const fs = require("fs");
const path = require("path");
const { SlashCommandBuilder } = require("discord.js");
const { renderLoadPanel } = require("../../Utils/Core/terminalUI");

async function loadCommands(client) {
  const startedAt = Date.now();
  const commandsDir = path.join(__dirname, "../../Commands");
  const commandsArray = [];
  const groups = [];
  const counts = { loaded: 0, skipped: 0, failed: 0 };

  if (!fs.existsSync(commandsDir)) {
    console.log(renderLoadPanel({
      title: "◆ COMMAND LOADER",
      groups,
      counts: { loaded: 0, skipped: 0, failed: 1 },
      durationMs: Date.now() - startedAt,
      footer: "COMMANDS KLASÖRÜ BULUNAMADI · KONTROL İPTAL EDİLDİ",
      footerStatus: "failed",
      total: 0,
    }));
    return { ...counts, failed: 1, total: 0, groups, registered: false };
  }

  const folders = fs.readdirSync(commandsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));

  for (const folder of folders) {
    const folderPath = path.join(commandsDir, folder.name);
    const files = fs.readdirSync(folderPath)
      .filter((file) => file.endsWith(".js"))
      .sort((a, b) => a.localeCompare(b, "tr"));
    const items = [];

    for (const file of files) {
      const filePath = path.join(folderPath, file);

      try {
        const commandFile = require(filePath);

        if (!(commandFile.data instanceof SlashCommandBuilder)) {
          items.push({
            name: file,
            status: "skipped",
            detail: "Builder kullanılmamış",
          });
          counts.skipped++;
          continue;
        }

        const properties = { folder: folder.name, ...commandFile };
        client.commands.set(commandFile.data.name, properties);
        commandsArray.push(commandFile.data.toJSON());
        items.push({ name: file, status: "loaded" });
        counts.loaded++;
      } catch (error) {
        items.push({ name: file, status: "failed", detail: "Hata" });
        counts.failed++;
        console.error(`🔴 [KOMUT] ${file} yüklenirken hata oluştu:`, error);
      }
    }

    if (items.length > 0) groups.push({ name: folder.name, items });
  }

  let registered = false;
  try {
    await client.application.commands.set(commandsArray);
    registered = true;
  } catch (error) {
    console.error("🔴 [KOMUT] Slash komutları Discord'a aktarılamadı:", error);
  }

  const total = counts.loaded + counts.skipped + counts.failed;
  const registrationSummary = registered
    ? "DISCORD'A SENKRONİZE EDİLDİ"
    : "DISCORD SENKRONİZASYONU BAŞARISIZ";

  console.log(renderLoadPanel({
    title: "◆ COMMAND LOADER",
    groups,
    counts,
    durationMs: Date.now() - startedAt,
    footer: `${counts.loaded} KOMUT YÜKLENDİ · ${registrationSummary}`,
    footerStatus: registered ? (counts.failed > 0 ? "warning" : "success") : "failed",
    total,
  }));

  return { ...counts, total, groups, registered };
}

module.exports = { loadCommands };
