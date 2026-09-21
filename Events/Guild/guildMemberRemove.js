const fs = require("../../Utils/Core/databaseFs");
const path = require("path");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { markMemberLeft } = require("../../Utils/Membership/inviteTracker");

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//ÇIKIŞ SİSTEMİ
module.exports = {
  name: "guildMemberRemove",
  async execute(member) {
    try {
      markMemberLeft(member);
    } catch (err) {
      console.warn(`⚠️ [DAVET] ${member.user.tag} için çıkış kaydı işlenemedi:`, err.message);
    }

    const dbPath = path.join(__dirname, "../../Database/Sunucu Yönetimi/girisCikis.json");
    if (!fs.existsSync(dbPath)) return;
    const data = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
    const guildData = data[member.guild.id];
    if (!guildData || !guildData.cikis) return;
    const girisCikisAktif = guildData.aktif ?? Boolean(guildData.giris?.kanal || guildData.cikis?.kanal);
    if (!girisCikisAktif) return;
    const kanalId = guildData.cikis.kanal;
    const kanal = member.guild.channels.cache.get(kanalId);
    if (!kanal) return;
    let hedefBilgi = "";
    const hedefUye = guildData.cikis.hedefUye || guildData.giris?.hedefUye;
    if (hedefUye && !isNaN(hedefUye)) {
      const hedef = parseInt(hedefUye, 10);
      const toplam = member.guild.memberCount;
      const kalan = hedef - toplam;
      hedefBilgi = ` \n-# Hedef: ${hedef} • Kalan: ${kalan > 0 ? kalan : 0}`;
    }
    kanal.send(`${emojiler.cikisOk} ${member} **(** ${member.user.username} **)** sunucudan **ayrıldı.** \n-# ${hedefBilgi}`);
  }
};
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
