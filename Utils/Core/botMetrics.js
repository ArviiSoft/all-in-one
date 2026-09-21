const { ChannelType } = require("discord.js");
const cpuStat = require("cpu-stat");
const os = require("os");
function getChannelCounts(guild) {
  const channels = guild.channels.cache;
  const textTypes = new Set([
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.GuildMedia,
  ]);
  const voiceTypes = new Set([
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice,
  ]);

  return {
    categories: channels.filter(channel => channel.type === ChannelType.GuildCategory).size,
    text: channels.filter(channel => textTypes.has(channel.type)).size,
    total: channels.size,
    voice: channels.filter(channel => voiceTypes.has(channel.type)).size,
  };
}

function getMemberCounts(guild) {
  const cachedMembers = guild.members.cache;
  const humans = cachedMembers.filter(member => !member.user.bot);
  const statuses = { online: 0, idle: 0, dnd: 0, offline: 0 };

  for (const member of humans.values()) {
    const status = member.presence?.status;
    if (status && Object.hasOwn(statuses, status)) statuses[status] += 1;
    else statuses.offline += 1;
  }

  const coverage = guild.memberCount > 0
    ? ((cachedMembers.size / guild.memberCount) * 100).toFixed(1)
    : "0.0";

  return {
    bots: cachedMembers.filter(member => member.user.bot).size,
    coverage,
    humans: humans.size,
    statuses,
  };
}

function formatBytes(bytes, decimals = 2) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, unitIndex);

  return `${Number(value.toFixed(Math.max(0, decimals)))} ${units[unitIndex]}`;
}

function formatUptime(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return `${days}g ${hours}sa ${minutes}dk ${seconds}sn`;
}

function measureCpu(timeout = 2_500) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeout);

    try {
      cpuStat.usagePercent((error, percent) => {
        if (error || !Number.isFinite(percent)) {
          if (error) console.warn("🟡 [BOT BİLGİ] CPU kullanımı ölçülemedi:", error.message || error);
          return finish(null);
        }

        finish(percent);
      });
    } catch (error) {
      console.warn("🟡 [BOT BİLGİ] CPU kullanımı ölçülemedi:", error.message || error);
      finish(null);
    }
  });
}

async function collectMetrics(interaction, client, responseLatency) {
  const cpuUsage = await measureCpu();
  const cpus = os.cpus();
  const botMember = interaction.guild?.members.cache.get(client.user.id);

  return {
    apiPing: Number.isFinite(client.ws.ping) && client.ws.ping >= 0 ? Math.round(client.ws.ping) : null,
    botUptime: formatUptime(client.uptime),
    collectedAt: Math.floor(Date.now() / 1000),
    commandCount: client.commands?.size || 0,
    cpuCores: cpus.length,
    cpuModel: cpus[0]?.model?.trim() || "Bilinmiyor",
    cpuUsage,
    guildCount: client.guilds.cache.size,
    hostUptime: formatUptime(os.uptime() * 1000),
    joinedAt: botMember?.joinedTimestamp || botMember?.joinedAt || null,
    memoryUsage: formatBytes(process.memoryUsage().heapUsed),
    osArch: os.arch(),
    osPlatform: os.platform(),
    osType: os.type(),
    responseLatency,
    userCount: client.guilds.cache.reduce((total, guild) => total + (guild.memberCount || 0), 0),
  };
}

function dashboardMetrics(client, guild) {
 const channels=getChannelCounts(guild), members=getMemberCounts(guild);
 return {name:guild.name, online:client.isReady(), ping:Number.isFinite(client.ws.ping)&&client.ws.ping>=0?Math.round(client.ws.ping):null,
 uptime:formatUptime(client.uptime), memberCount:guild.memberCount, channels, members,
 voiceMembers:[...(guild.voiceStates?.cache?.values()||[])].filter(s=>s.channelId).length,
 boosts:guild.premiumSubscriptionCount||0, boostLevel:guild.premiumTier||0,
 commandCount:client.commands?.size||0, memory:formatBytes(process.memoryUsage().heapUsed),
 systemChannel:guild.systemChannel?.name||null, botName:client.user?.username||'ArviS',version:require('../../package.json').version,
 collectedAt:Date.now()};
}
module.exports={getChannelCounts,getMemberCounts,formatBytes,formatUptime,collectMetrics,dashboardMetrics};
