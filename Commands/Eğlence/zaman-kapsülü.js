const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const fs = require('../../Utils/Core/databaseFs');
const path = require('path');
const emojiler = require('../../Utils/Emojis/emojiler.js');
const { getSettings } = require('../../Utils/Engagement/engagementSettings');

const dbPath = path.join(__dirname, '../../Database/Eğlence ve Etkileşim/zamanKapsulu.json');

function loadDB() {
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, '[]', 'utf8');
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDB(data) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

function parseSure(input) {
  const str = input.toLowerCase().trim();
  const map = {
    'saniye': 1000, 'sn': 1000,
    'dakika': 60000, 'dk': 60000, 'dak': 60000,
    'saat': 3600000, 'sa': 3600000,
    'gün': 86400000, 'gun': 86400000,
    'hafta': 604800000,
    'ay': 2592000000,
  };

  let total = 0;
  let lastIndex = 0;
  const regex = /(\d+)\s*(saniye|sn|dakika|dak|dk|saat|sa|gün|gun|hafta|ay)/g;
  let match;
  while ((match = regex.exec(str)) !== null) {
    if (str.slice(lastIndex, match.index).trim()) return 0;
    total += parseInt(match[1]) * (map[match[2]] || 0);
    lastIndex = regex.lastIndex;
  }
  return str.slice(lastIndex).trim() || !Number.isSafeInteger(total) ? 0 : total;
}

function formatSure(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} saniye`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dakika`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} gün`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w} hafta`;
  return `${Math.floor(d / 30)} ay`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('zaman-kapsülü')
    .setDescription('Kendine ileride teslim edilecek bir mesaj bırak.'),

  async execute(interaction) {
    if (!getSettings(interaction.guildId, 'zaman-kapsulu').enabled) return interaction.reply({ content: 'Zaman kapsülü bu sunucuda kapalı.', flags: MessageFlags.Ephemeral });
    const modal = new ModalBuilder()
      .setCustomId('zamanKapsuluModal')
      .setTitle('Zaman Kapsülü');

    const mesajInput = new TextInputBuilder()
      .setCustomId('zkMesaj')
      .setLabel('Kendine bırakmak istediğin mesajı yaz.')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Gelecekteki kendime...')
      .setRequired(true);

    const sureInput = new TextInputBuilder()
      .setCustomId('zkSure')
      .setLabel('Ne zaman teslim edilsin?')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ÖRNEK: 3 gün, 2 saat, 1 hafta, 30 dakika')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(mesajInput),
      new ActionRowBuilder().addComponents(sureInput),
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction) {
    if (interaction.customId !== 'zamanKapsuluModal') return;
    const config = getSettings(interaction.guildId, 'zaman-kapsulu');
    if (!config.enabled) return interaction.reply({ content: 'Zaman kapsülü bu sunucuda kapalı.', flags: MessageFlags.Ephemeral });

    const mesaj = interaction.fields.getTextInputValue('zkMesaj');
    const sureRaw = interaction.fields.getTextInputValue('zkSure');
    const ms = parseSure(sureRaw);

    if (!ms || ms < config.minDurationMinutes * 60000) {
      return interaction.reply({
        content: `${emojiler.uyari} **Geçerli bir süre gir. (3 gün, 2 saat, 1 hafta)** \n**- En az ${config.minDurationMinutes} dakika olmalı.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (ms > config.maxDurationDays * 86400000) {
      return interaction.reply({
        content: `${emojiler.uyari} **En fazla ${config.maxDurationDays} gün sonrası için kapsül oluşturabilirsin.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const teslimAt = Date.now() + ms;
    const db = loadDB();
    if (config.maxPendingPerUser && db.filter(v => v.guildId === interaction.guildId && v.userId === interaction.user.id).length >= config.maxPendingPerUser) return interaction.reply({ content: `Bu sunucuda en fazla ${config.maxPendingPerUser} bekleyen kapsül oluşturabilirsin.`, flags: MessageFlags.Ephemeral });

    db.push({
      guildId: interaction.guildId || null,
      userId: interaction.user.id,
      mesaj,
      teslimAt,
      olusturuldu: Date.now(),
    });

    saveDB(db);

    const container = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ⏳ Zaman Kapsülün Oluşturuldu \n` +
          `-# Mesajın zamanı gelince DM olarak iletilecek.`
        )
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emojiler.saat} **Teslim zamanı:** <t:${Math.floor(teslimAt / 1000)}:F>\n` +
          `⏳ **Kalan süre:** <t:${Math.floor(teslimAt / 1000)}:R>\n\n` +
          `-# Kapsülün içeriği her zaman gizli tutulur.`
        )
      );

    return interaction.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },

  startChecker(client) {
    setInterval(async () => {
      const db = loadDB();
      const now = Date.now();
      const kalanlar = [];

      for (const kapsul of db) {
        if (now < kapsul.teslimAt) {
          kalanlar.push(kapsul);
          continue;
        }

        try {
          const user = await client.users.fetch(kapsul.userId).catch(() => null);
          if (!user) { kalanlar.push(kapsul); continue; }

          const sure = formatSure(kapsul.teslimAt - kapsul.olusturuldu);

          const container = new ContainerBuilder()
            .setAccentColor(0xFEE75C)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## 🕰️ Zaman Kapsülün Açıldı\n` +
                `-# ${sure} önce kendine bir mesaj bırakmıştın.`
              )
            )
            .addSeparatorComponents(
              new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `📝 **Mesajın:**\n${kapsul.mesaj}\n\n` +
                `-# Bırakılma zamanı: <t:${Math.floor(kapsul.olusturuldu / 1000)}:F>`
              )
            );

          await user.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
          });
        } catch {}
      }

      saveDB(kalanlar);
    }, 60000);
  },
};
