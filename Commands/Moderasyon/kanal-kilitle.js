const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("kanal-kilit")
    .setDescription("Kanalı kilitle veya aç.")
    .addSubcommand(sub =>
      sub
        .setName("kilitle")
        .setDescription("Kanalı kilitler.")
    )
    .addSubcommand(sub =>
      sub
        .setName("aç")
        .setDescription("Kilidi açar.")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand(false);
    const channel = interaction.channel;

    await interaction.deferReply({ flags: 64 });

    const unlockButtonId = `unlock_${channel.id}`;
    const lockButtonId = `lock_${channel.id}`;

async function kilitleKanal() {
  const overwrites = channel.permissionOverwrites.cache;
  const roleIds = overwrites.filter((_, id) => interaction.guild.roles.cache.has(id)).map((_, id) => id);
  for (const id of roleIds) {
    const role = interaction.guild.roles.cache.get(id);
    if (!role) continue;
    await channel.permissionOverwrites.edit(role, { SendMessages: false }).catch(() => {});
    await new Promise(res => setTimeout(res, 250));
  }
}

async function acKanal() {
  const overwrites = channel.permissionOverwrites.cache;
  const roleIds = overwrites.filter((_, id) => interaction.guild.roles.cache.has(id)).map((_, id) => id);
  for (const id of roleIds) {
    const role = interaction.guild.roles.cache.get(id);
    if (!role) continue;
    await channel.permissionOverwrites.edit(role, { SendMessages: true }).catch(() => {});
    await new Promise(res => setTimeout(res, 250));
  }
}

    if (sub === "kilitle") {
      await kilitleKanal();

      const embed = new EmbedBuilder()
        .setColor("Red")
        .setTitle("🔒 Kanal Kilitlendi")
        .setDescription(`Kanal <@${interaction.user.id}> tarafından **herkese** kapatıldı.`)
        

      const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(unlockButtonId)
          .setLabel("Kilit Aç")
          .setEmoji("🔓")
          .setStyle(ButtonStyle.Success)
      );

      const sent = await channel.send({ embeds: [embed], components: [button] }).catch(() => {});
      await interaction.editReply({ content: `${emojiler.tik} Kanal **herkese** kilitlendi.` });

      const collector = channel.createMessageComponentCollector({ filter: i => i.message.id === sent.id, time: 120000 });
      collector.on("collect", async i => {
        if (!i.isButton()) return;
        if (!i.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          await i.reply({ content: `${emojiler.uyari} **Bu butonu kullanabilmek için yetki yok.**`, flags: 64 }).catch(() => {});
          return;
        }
        if (i.customId === unlockButtonId) {
          await acKanal();
          const newEmbed = new EmbedBuilder()
            .setColor("Green")
            .setTitle("🔓 Kilit Açıldı")
            .setDescription(`Kanal <@${i.user.id}> tarafından **herkese** açıldı.`)
            
          const newButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(lockButtonId)
              .setLabel("Tekrar Kilitle")
              .setEmoji("🔒")
              .setStyle(ButtonStyle.Danger)
          );
          await i.update({ embeds: [newEmbed], components: [newButton] }).catch(() => {});
        } else if (i.customId === lockButtonId) {
          await kilitleKanal();
          const newEmbed = new EmbedBuilder()
            .setColor("Red")
            .setTitle("🔒 Kanal Kilitlendi")
            .setDescription(`Kanal <@${i.user.id}> tarafından **herkese** yeniden kilitlendi.`)
            
          const newButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(unlockButtonId)
              .setLabel("Kilit Aç")
              .setEmoji("🔓")
              .setStyle(ButtonStyle.Success)
          );
          await i.update({ embeds: [newEmbed], components: [newButton] }).catch(() => {});
        }
      });
      return;
    }

    if (sub === "aç") {
      await acKanal();

      const embed = new EmbedBuilder()
        .setColor("Green")
        .setTitle("🔓 Kilit Açıldı")
        .setDescription(`Kanal <@${interaction.user.id}> tarafından **herkese** açıldı.`)
        

      const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(lockButtonId)
          .setLabel("Tekrar Kilitle")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Danger)
      );

      const sent = await channel.send({ embeds: [embed], components: [button] }).catch(() => {});
      await interaction.editReply({ content: `${emojiler.tik} Kanal **herkese** açıldı.` });

      const collector = channel.createMessageComponentCollector({ filter: i => i.message.id === sent.id, time: 120000 });
      collector.on("collect", async i => {
        if (!i.isButton()) return;
        if (!i.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          await i.reply({ content: `${emojiler.uyari} **Bu butonu kullanabilmek için yetki yok.**`, flags: 64 }).catch(() => {});
          return;
        }
        if (i.customId === lockButtonId) {
          await kilitleKanal();
          const newEmbed = new EmbedBuilder()
            .setColor("Red")
            .setTitle("🔒 Kanal Kilitlendi")
            .setDescription(`Kanal <@${i.user.id}> tarafından **herkese** yeniden kilitlendi.`)
            
          const newButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(unlockButtonId)
              .setLabel("Kilit Aç")
              .setEmoji("🔓")
              .setStyle(ButtonStyle.Success)
          );
          await i.update({ embeds: [newEmbed], components: [newButton] }).catch(() => {});
        } else if (i.customId === unlockButtonId) {
          await acKanal();
          const newEmbed = new EmbedBuilder()
            .setColor("Green")
            .setTitle("🔓 Kilit Açıldı")
            .setDescription(`Kanal <@${i.user.id}> tarafından **herkese** açıldı.`)
            
          const newButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(lockButtonId)
              .setLabel("Tekrar Kilitle")
              .setEmoji("🔒")
              .setStyle(ButtonStyle.Danger)
          );
          await i.update({ embeds: [newEmbed], components: [newButton] }).catch(() => {});
        }
      });
    }
  },
};