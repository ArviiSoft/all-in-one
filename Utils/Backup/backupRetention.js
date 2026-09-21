const fs = require("fs");
const path = require("path");

function recordFailure(failed, file, error) {
  failed.push({ file, code: error.code || "UNKNOWN" });
  console.warn(`⚠️ [YEDEK TEMİZLİĞİ] ${file}: ${error.message}`);
}

function findPreviousBackups(folders, matches) {
  const files = [];
  const failed = [];

  for (const folder of new Set(folders.map(value => path.resolve(value)))) {
    let entries;
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch (error) {
      if (error.code !== "ENOENT") recordFailure(failed, path.basename(folder), error);
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !matches(entry.name)) continue;
      const filePath = path.join(folder, entry.name);
      try {
        const stats = fs.lstatSync(filePath);
        if (!stats.isFile()) continue;
        files.push({ file: entry.name, filePath, size: stats.size, modifiedAt: stats.mtimeMs, ino: stats.ino });
      } catch (error) {
        if (error.code !== "ENOENT") recordFailure(failed, entry.name, error);
      }
    }
  }

  files.sort((first, second) => second.modifiedAt - first.modifiedAt);
  return { files, failed };
}

function prunePreviousBackups(previous, currentFile) {
  const currentPath = path.resolve(currentFile);
  const currentStats = fs.lstatSync(currentPath);
  if (!currentStats.isFile() || currentStats.size === 0) {
    throw new Error("Yeni yedek doğrulanamadığı için eski yedekler korundu.");
  }

  const deleted = [];
  const failed = [...previous.failed];
  for (const file of previous.files) {
    try {
      if (file.filePath !== currentPath) {
        const stats = fs.lstatSync(file.filePath);
        if (!stats.isFile() || stats.ino !== file.ino || stats.size !== file.size || stats.mtimeMs !== file.modifiedAt) {
          recordFailure(failed, file.file, { code: "CHANGED", message: "Yedek işlem sırasında değişti, silinmedi." });
          continue;
        }
        fs.unlinkSync(file.filePath);
      }
      deleted.push(file);
    } catch (error) {
      if (error.code !== "ENOENT") recordFailure(failed, file.file, error);
    }
  }

  return { deleted, failed };
}

function inlineCode(value) {
  return `\`${String(value).replace(/[`\r\n]/g, "'").slice(0, 100)}\``;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function buildCleanupReport(cleanup) {
  const lines = ["### 🗑️ Eski Yedek Temizliği"];
  if (!cleanup) return [...lines, "Temizlik bilgisi bulunmuyor."].join("\n");

  const { deleted, failed } = cleanup;
  if (deleted.length > 0) {
    const totalBytes = deleted.reduce((sum, file) => sum + file.size, 0);
    lines.push(`**Silinen:** **${deleted.length} dosya** · **Toplam boyut:** ${inlineCode(formatBytes(totalBytes))}`);
    for (const file of deleted.slice(0, 5)) {
      lines.push(
        `**Dosya:** ${inlineCode(file.file)} · **Boyut:** ${inlineCode(formatBytes(file.size))}`,
        `**Dosya tarihi:** <t:${Math.floor(file.modifiedAt / 1000)}:F>`,
      );
    }
    if (deleted.length > 5) lines.push(`… ve ${deleted.length - 5} eski yedek daha silindi.`);
  } else {
    lines.push(failed.length ? "Eski yedek silinemedi." : "Silinecek önceki yedek bulunamadı.");
  }

  if (failed.length > 0) {
    lines.push(`⚠️ **${failed.length} temizlik hatası.** Yeni yedek hazır, temizlenemeyen eski yedekler korundu.`);
    for (const file of failed.slice(0, 2)) {
      lines.push(`${inlineCode(file.file)} · ${inlineCode(file.code)}`);
    }
    if (failed.length > 2) lines.push(`… ve ${failed.length - 2} hata daha; ayrıntılar konsolda.`);
  }
  return lines.join("\n");
}

module.exports = { buildCleanupReport, findPreviousBackups, prunePreviousBackups };