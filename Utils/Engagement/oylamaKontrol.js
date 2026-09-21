const path = require('node:path');
const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { createJsonStore } = require('../Core/safeJsonStore');
const { requireEnabled, targetChannel } = require('./engagementSettings');
const { buildAktifOylama, buildOylamaSonucu } = require('./oylamaGorunum');
const store = createJsonStore(path.join(__dirname, '../../Database/Eğlence ve Etkileşim/oylama.json'));
const alfabe = ['🇦', '🇧', '🇨', '🇩', '🇪', '🇫', '🇬', '🇭', '🇮', '🇯'];
const timers = new Map(); const finishing = new Map();
const MAX_TIMEOUT = 2_147_000_000;

function schedulePoll(client, id, delay) {
  clearTimeout(timers.get(id));
  const timer = setTimeout(() => {
    timers.delete(id);
    const poll = store.get(id);
    if (!poll || poll.ended) return;
    if (poll.endTime > Date.now()) return schedulePoll(client, id, poll.endTime - Date.now());
    endPoll(client, id).catch(error => console.error('🔴 [OYLAMA] Oylama bitirilemedi:', error));
  }, Math.min(Math.max(0, delay), MAX_TIMEOUT));
  timer.unref?.(); timers.set(id, timer);
}

async function startPoll(guild, fallbackChannelId, creatorId, input) {
  const config = requireEnabled(guild.id, 'oylama-baslat');
  const durationMs = input.durationMs ?? config.durationSeconds * 1000;
  const question = String(input.question || '').trim();
  const options = (input.options || []).map(value => String(value).trim());
  if (!Number.isSafeInteger(durationMs) || durationMs < 1000 || durationMs > 30 * 86400000) throw new RangeError('Oylama süresi 1 saniye ile 30 gün arasında olmalı.');
  if (!question || question.length > 300) throw new RangeError('Soru 1–300 karakter olmalı.');
  if (options.length < 2 || options.length > 10 || options.some(v => !v || v.length > 150)) throw new RangeError('1–150 karakter uzunluğunda 2–10 seçenek girin.');
  if (new Set(options.map(v => v.toLocaleLowerCase('tr-TR'))).size !== options.length) throw new RangeError('Seçenekler birbirinden farklı olmalı.');
  const channel = await targetChannel(guild, config.channelId || fallbackChannelId, [PermissionFlagsBits.AddReactions, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]);
  const endTime = Date.now() + durationMs;
  const message = await channel.send({ components: [buildAktifOylama({ alfabe, baslatanId: creatorId, bitisZamani: Math.floor(endTime / 1000), soru: question, secenekler: options, thumbnailURL: guild.iconURL({ size: 256 }) })], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
  try {
    for (const emoji of alfabe.slice(0, options.length)) await message.react(emoji);
    store.set(message.id, { guildId: guild.id, channelId: channel.id, messageId: message.id, question, options, creatorId, endTime, ended: false });
  } catch (error) { await message.delete().catch(() => {}); throw error; }
  schedulePoll(guild.client, message.id, endTime - Date.now());
  return message;
}

async function endPoll(client, id, guildId) {
  const poll = store.get(id);
  if (!poll || (guildId && poll.guildId !== guildId)) throw new RangeError('Oylama bu sunucuda bulunamadı.');
  if (poll.ended) throw new RangeError('Bu oylama zaten bitmiş.');
  if (finishing.has(id)) return finishing.get(id);
  const operation = finishPoll(client, id, poll);
  finishing.set(id, operation);
  try { return await operation; } finally { finishing.delete(id); }
}

async function finishPoll(client, id, poll) {
  const channel = await client.channels.fetch(poll.channelId);
  const message = await channel.messages.fetch(poll.messageId);
  const results = []; const voters = new Set(); let total = 0;
  for (let i = 0; i < poll.options.length; i++) {
    const reaction = message.reactions.cache.get(alfabe[i]);
    const count = reaction ? Math.max(0, reaction.count - 1) : 0;
    const users = reaction ? await reaction.users.fetch() : [];
    users.forEach(user => { if (!user.bot) voters.add(user.id); });
    results.push({ emoji: alfabe[i], secenek: poll.options[i], oy: count }); total += count;
  }
  await message.edit({ content: null, embeds: [], components: [buildOylamaSonucu({ bitisZamani: Math.floor(poll.endTime / 1000), pollId: id, sonuclar: results, soru: poll.question, toplamOy: total, voterCount: voters.size, thumbnailURL: channel.guild.iconURL({ size: 256 }) })], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
  await message.reactions.removeAll().catch(() => {});
  store.update(data => { if (data[id]) Object.assign(data[id], { ended: true, endedAt: Date.now(), voters: [...voters] }); });
  clearTimeout(timers.get(id)); timers.delete(id);
}

function oylamaKontrolYukle(client) {
  const check = async () => {
    for (const { ID, data } of store.all()) {
      if (data.ended) continue;
      if (data.endTime <= Date.now()) await endPoll(client, ID).catch(error => console.error('🔴 [OYLAMA] Oylama bitirilemedi:', error));
      else if (!timers.has(ID)) schedulePoll(client, ID, data.endTime - Date.now());
    }
  };
  check().catch(console.error);
  const timer = setInterval(() => check().catch(console.error), 60000); timer.unref?.();
}
module.exports = { oylamaKontrolYukle, startPoll, endPoll };
