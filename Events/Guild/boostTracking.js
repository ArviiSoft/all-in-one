const { Events } = require("discord.js");
const { getTracker } = require("../../Utils/Boost/boostTracker");

module.exports = (client) => {
  const tracker = getTracker(client);
  const handle = (context, operation) => {
    Promise.resolve().then(operation).catch((error) => {
      console.warn(`⚠️ [BOOST] ${context}:`, error?.message || error);
    });
  };

  const start = async () => {
    await tracker.reconcile();
    await tracker.initialize();
  };
  client.on(Events.ClientReady, () => handle("Takip başlatılamadı", start));
  client.on(Events.GuildMemberUpdate, (oldMember, member) => {
    handle("Boost değişikliği kaydedilemedi", () => tracker.onMemberUpdate(oldMember, member));
  });
  client.on(Events.MessageCreate, (message) => {
    handle("Boost sistem mesajı işlenemedi", () => tracker.onMessageCreate(message));
  });
  client.on(Events.GuildMemberRemove, (member) => {
    handle("Ayrılan üye kaydı temizlenemedi", () => tracker.onMemberRemove(member));
  });
  client.on(Events.ShardResume, () => {
    handle("Bağlantı sonrası boost kayıtları eşitlenemedi", () => tracker.reconcile());
  });
  client.on(Events.ShardReady, () => {
    if (client.isReady()) handle("Yeni oturum sonrası boost kayıtları eşitlenemedi", () => tracker.reconcile());
  });
  client.on(Events.GuildAvailable, (guild) => {
    if (client.isReady()) handle("Sunucu boost kayıtları eşitlenemedi", () => tracker.reconcile(guild.id));
  });
  if (client.isReady()) handle("Takip başlatılamadı", start);
};
