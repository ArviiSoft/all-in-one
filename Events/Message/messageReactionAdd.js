const fs = require("../../Utils/Core/databaseFs");
const path = require("path");

const ALFABE_EMOJILERI = ["🇦", "🇧", "🇨", "🇩", "🇪", "🇫", "🇬", "🇭", "🇮", "🇯"];
const OYLAMA_DOSYA_YOLU = path.join(__dirname, "../../Database/Eğlence ve Etkileşim/oylama.json");

function oylamalariOku() {
  if (!fs.existsSync(OYLAMA_DOSYA_YOLU)) return {};
  try {
    return JSON.parse(fs.readFileSync(OYLAMA_DOSYA_YOLU, "utf8"));
  } catch {
    return {};
  }
}

module.exports = {
  name: "messageReactionAdd",

  async execute(reaction, user) {
    if (user.bot) return;

    try {
      if (reaction.partial) await reaction.fetch().catch(() => {});
      if (reaction.message.partial) await reaction.message.fetch().catch(() => {});

      const message = reaction.message;
      const oylama = oylamalariOku()[message.id];
      if (!oylama || oylama.ended || oylama.endTime <= Date.now()) return;

      const secenekEmojileri = ALFABE_EMOJILERI.slice(0, oylama.options?.length || 0);
      const secilenEmoji = reaction.emoji.name;
      if (!secenekEmojileri.includes(secilenEmoji)) return;

      for (const emoji of secenekEmojileri) {
        if (emoji === secilenEmoji) continue;

        const oncekiTepki = message.reactions.cache.get(emoji);
        if (oncekiTepki) {
          await oncekiTepki.users.remove(user.id).catch(() => {});
        }
      }
    } catch (err) {
      console.error("🔴 [OYLAMA] Önceki oy kaldırılırken hata:", err);
    }
  },
};
