const path = require("node:path");
const fs = require("../Core/databaseFs");
const FILE = path.join(__dirname, "../../Database/Üye Verileri/muzikFavorileri.json");

function readFavorites() {
  if (!fs.existsSync(FILE)) return {};
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

function listFavorites(userId) {
  return readFavorites()[userId] || [];
}

function toggleFavorite(userId, track) {
  const data = readFavorites();
  const favorites = data[userId] || [];
  const index = favorites.findIndex(item => item.url === track.url);
  if (index >= 0) favorites.splice(index, 1);
  else {
    if (favorites.length >= 100) throw new Error("En fazla 100 favori kaydedebilirsin. Önce bir favoriyi kaldır.");
    favorites.push({ title: track.cleanTitle || track.title, author: track.author, url: track.url, duration: track.duration });
  }
  if (favorites.length) data[userId] = favorites;
  else delete data[userId];
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
  return index < 0;
}

module.exports = { listFavorites, toggleFavorite };
