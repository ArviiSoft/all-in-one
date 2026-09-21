const { SlashCommandBuilder } = require("discord.js");
const fs = require("../../Utils/Core/databaseFs");
const path = require("path");

const afkPath = path.join(__dirname, "../../Database/Üye Verileri/afk.json");

function readAfkDB() {
  if (!fs.existsSync(afkPath)) return {};
  return JSON.parse(fs.readFileSync(afkPath, "utf-8"));
}

function writeAfkDB(data) {
  fs.writeFileSync(afkPath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("afk")
    .setDescription("AFK moduna geçmeni sağlar.")
    .addStringOption(option =>
      option.setName("sebep").setDescription("AFK sebebini yaz").setRequired(true)
    ),

  async execute(interaction) {
    const sebep = interaction.options.getString("sebep");
    const userId = interaction.user.id;
    const db = readAfkDB();
    const member = interaction.guild.members.cache.get(userId);

    if (!member) {
      return interaction.reply({ content: "Bir hata oluştu: Kullanıcı bulunamadı.", flags: 64 });
    }

    if (db[userId]) {
      delete db[userId];
      writeAfkDB(db);

      let eskiIsim;

      if (member.nickname && member.nickname.startsWith("[AFK]")) {
        eskiIsim = member.nickname.replace(/^\[AFK\]\s*/i, "");
      } else {
        eskiIsim = member.user.globalName || member.user.username;
      }

      await member.setNickname(eskiIsim).catch(() => {});
      return interaction.reply("**AFK** modundan çıktın. 🌙");
    }

    db[userId] = { sebep, zaman: Date.now() };
    writeAfkDB(db);

    let yeniIsim;
    if (member.nickname) {
      yeniIsim = `[AFK] ${member.nickname}`;
    } else {
      yeniIsim = `[AFK] ${member.user.globalName || member.user.username}`;
    }

    await member.setNickname(yeniIsim).catch(() => {});
    return interaction.reply(`🌙 **AFK** moduna geçildi: \`${sebep}\``);
  }
};