const { createHash } = require('node:crypto');
const { MessageFlags } = require('discord.js');
const aktifDB = require('./aktifDB');
const emojiler = require('../Emojis/emojiler');
const { buildActiveMemberPayload, buildWeeklyAnnouncementPayload, yasakliKisiID } = require('./embedGenerator');
const { ayarlaZamanlama, calismaZamaniMi, normalizeZamanlama, zamanlamaMetni } = require('./aktifUyeZamanlama');

const schedulers = new WeakMap();

function weeklyResult(data, sorted) {
  const result = structuredClone(data);
  const winner = sorted[0];
  const previous = data.birinci || { id: null, puan: 0 };
  result.oncekiHafta = { ...previous };
  result.birinci = { ...winner };
  result.aktifUye = winner.id;
  result.streaks ||= {};
  if (previous.id === winner.id) {
    result.streaks[winner.id] = (result.streaks[winner.id] || 1) + 1;
  } else if (previous.id) {
    delete result.streaks[previous.id];
  }

  const streak = result.streaks[winner.id] || 0;
  const streaks = new Map((result.streakRekorlar || []).map(entry => [entry.id, entry.streak]));
  if (streak >= 2) streaks.set(winner.id, Math.max(streak, streaks.get(winner.id) || 0));
  result.streakRekorlar = [...streaks].map(([id, value]) => ({ id, streak: value }))
    .sort((a, b) => b.streak - a.streak).slice(0, 3);

  const records = new Map((result.rekorlar || []).map(entry => [entry.id, entry.puan]));
  for (const entry of sorted.filter(entry => entry.puan >= 1000)) {
    records.set(entry.id, Math.max(entry.puan, records.get(entry.id) || 0));
  }
  result.rekorlar = [...records].map(([id, puan]) => ({ id, puan }))
    .sort((a, b) => b.puan - a.puan).slice(0, 3);
  return result;
}

function sameInstallation(first, second) {
  return ['guild', 'kanal', 'mesaj', 'thread', 'rol'].every(key => first[key] === second[key])
    && JSON.stringify(normalizeZamanlama(first.zamanlama)) === JSON.stringify(normalizeZamanlama(second.zamanlama));
}

function completeSelection(db, snapshot, result, calismaAnahtari) {
  const latest = db.loadData();
  if (latest.guild !== snapshot.guild) return null;
  if (result) {
    for (const key of ['oncekiHafta', 'birinci', 'aktifUye', 'streaks', 'streakRekorlar', 'rekorlar']) {
      latest[key] = result[key];
    }
    for (const [key, value] of Object.entries(snapshot)) {
      if (!key.startsWith('puan_') || !Number.isFinite(value)) continue;
      const remaining = Math.max(0, (Number(latest[key]) || 0) - value);
      if (remaining > 0) latest[key] = remaining;
      else delete latest[key];
    }
  }
  latest.zamanlama = { ...normalizeZamanlama(latest.zamanlama), sonCalisma: calismaAnahtari };
  db.saveData(latest);
  return latest;
}

async function transferRole(guild, data, previousId) {
  const role = await guild.roles.fetch(data.rol);
  if (!role) throw new Error('Ödül rolü bulunamadı.');
  const winner = await guild.members.fetch(data.aktifUye);
  await winner.roles.add(role, 'Haftalık aktif üye seçildi.');
  const previousMembers = new Map(role.members);
  if (previousId && previousId !== winner.id && !previousMembers.has(previousId)) {
    try {
      previousMembers.set(previousId, await guild.members.fetch(previousId));
    } catch (error) {
      if (error.code !== 10007) throw error;
    }
  }
  const removals = await Promise.allSettled([...previousMembers.values()]
    .filter(member => member.id !== winner.id)
    .map(member => member.roles.remove(role, 'Haftalık aktif üye rolü devredildi.')));
  const failed = removals.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
}

async function refreshRanking(guild, data) {
  const channel = await guild.channels.fetch(data.kanal);
  if (!channel) throw new Error('Sıralama kanalı bulunamadı.');
  const message = await channel.messages.fetch(data.mesaj);
  const payload = buildActiveMemberPayload(data, guild);
  if (!message.flags?.has(MessageFlags.IsComponentsV2)) {
    payload.content = null;
    payload.embeds = [];
  }
  await message.edit(payload);
}

function createAktifUyeChecker(client, { db = aktifDB, logger = console, now = () => new Date() } = {}) {
  let running = false;
  return async function check() {
    if (running) return 'busy';
    running = true;
    try {
      const data = db.loadData();
      if (!data.guild || !data.kanal || !data.mesaj || !data.thread || !data.rol) return 'disabled';
      const date = now();
      data.zamanlama = normalizeZamanlama(data.zamanlama);
      if (!data.zamanlama.baslangic && !data.zamanlama.sonCalisma) {
        data.zamanlama = ayarlaZamanlama(data.zamanlama, {}, date);
        db.saveData(data);
      }
      const due = calismaZamaniMi(data.zamanlama, date);
      if (!due.calismali) return 'waiting';
      const guild = client.guilds.cache.get(data.guild);
      if (!guild) throw new Error('Sunucu bulunamadı.');
      const sorted = Object.entries(data)
        .filter(([key, value]) => key.startsWith('puan_') && Number.isFinite(value) && value > 0)
        .map(([key, puan]) => ({ id: key.slice(5), puan }))
        .filter(entry => !yasakliKisiID.includes(entry.id))
        .sort((a, b) => b.puan - a.puan);
      if (!sorted.length) {
        completeSelection(db, data, null, due.calismaAnahtari);
        logger.log(`⚠️ [AKTİF ÜYE] ${due.calismaAnahtari}: Seçilebilir puan verisi yok; bu dönem atlandı.`);
        return 'empty';
      }

      const thread = await guild.channels.fetch(data.thread, { force: true });
      if (!thread?.isThread?.()) throw new Error('Geçmiş aktif üyeler thread’i bulunamadı.');
      if (thread.archived) await thread.setArchived(false, 'Haftalık aktif üye sonucu gönderilecek.');
      if (!sameInstallation(data, db.loadData())) return 'changed';
      const result = weeklyResult(data, sorted);
      const payload = buildWeeklyAnnouncementPayload({ data: result, guild, winner: result.birinci, previousWinner: result.oncekiHafta });
      payload.nonce = createHash('sha256').update(`${data.thread}:${due.calismaAnahtari}`).digest('hex').slice(0, 24);
      payload.enforceNonce = true;
      const announcement = await thread.send(payload);

      const latest = completeSelection(db, data, result, due.calismaAnahtari);
      if (!latest) return 'changed';
      logger.log(`🟢 [AKTİF ÜYE] ${zamanlamaMetni(data.zamanlama)} haftalık seçimi tamamlandı (${due.calismaAnahtari}).`);
      const followups = await Promise.allSettled([
        transferRole(guild, latest, data.aktifUye || data.birinci?.id),
        refreshRanking(guild, latest),
        announcement.react(emojiler.green_heart || '💚'),
      ]);
      const labels = ['Ödül rolü devredilemedi', 'Sıralama mesajı güncellenemedi', 'Sonuç tepkisi eklenemedi'];
      followups.forEach((followup, index) => {
        if (followup.status === 'rejected') logger.error(`🔴 [AKTİF ÜYE] ${labels[index]}:`, followup.reason);
      });
      return 'sent';
    } catch (error) {
      logger.error('🔴 [AKTİF ÜYE] Haftalık seçim tamamlanamadı; sonraki kontrolde tekrar denenecek:', error);
      return 'failed';
    } finally {
      running = false;
    }
  };
}

function startAktifUyeScheduler(client, options) {
  if (schedulers.has(client)) return schedulers.get(client);
  const check = createAktifUyeChecker(client, options);
  const timer = setInterval(check, 60_000);
  timer.unref?.();
  const scheduler = { check, stop() { clearInterval(timer); schedulers.delete(client); } };
  schedulers.set(client, scheduler);
  void check();
  return scheduler;
}

module.exports = { createAktifUyeChecker, startAktifUyeScheduler };