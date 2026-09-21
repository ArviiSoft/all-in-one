const path = require("path");
const { acquireSingleInstance } = require("./Utils/Core/singleInstance");
const { loadEnv, getEnv, getRequiredEnv } = require("./Utils/Core/env");
const { readConfig } = require("./Utils/Database/config");
const { initializeDatabase, closeDatabase } = require("./Utils/Database/runtime");

try {
    loadEnv();
    const config = readConfig();
    acquireSingleInstance(path.join(__dirname, "Settings/pid.txt"));
    initializeDatabase({ config });
} catch (error) {
    console.error("🛑 [DATABASE] Bot başlatılamadı:", error.message);
    process.exit(1);
}
process.prependOnceListener("exit", () => { try { closeDatabase(); } catch {} });

const { Client, GatewayIntentBits, Partials, Collection } = require("discord.js");
const { setupBlacklistServers } = require("./Utils/Moderation/blacklistservers");
const DISCORD_TOKEN = getRequiredEnv("DISCORD_TOKEN");
const client = global.client = new Client({intents: Object.keys(GatewayIntentBits),partials:Object.keys(Partials)});
require('./Utils/Core/clientErrors').installClientErrorHandler(client);

const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const { SpotifyExtractor } = require('discord-player-spotify');
const { YoutubeMusicExtractor } = require('./Utils/Media/musicService');
const { bindDiscordPlayerVoiceHandoff } = require('./Utils/Voice/persistentVoiceConnection');

const { databaseKontrolEt } = require('./Utils/Core/databaseKontrol.js');
const { loadEvents } = require('./Handlers/Core/eventHandler');
const { loadCommands } = require('./Handlers/Core/commandHandler');
const { loadDashboard } = require('./Handlers/Dashboard/dashboardHandler');
const { clearTerminal, createStartupLogCapture, printStartupBanner, renderServicePanel, startRuntimeMonitor } = require('./Utils/Core/terminalUI');
const emojiler = require('./Utils/Emojis/emojiler.js');

const { EventEmitter } = require('events');
EventEmitter.defaultMaxListeners = 120;

client.commands = new Collection();
client.userTempVoiceChannels = new Map();

const player = new Player(client);
bindDiscordPlayerVoiceHandoff(player);
const musicExtractorsReady = (async () => {
    const extractorsWithoutLegacySpotify = DefaultExtractors.filter(
        extractor => extractor.identifier !== 'com.discord-player.spotifyextractor'
    );
    await player.extractors.loadMulti(extractorsWithoutLegacySpotify);
    await player.extractors.register(SpotifyExtractor, { market: 'TR' });
    await player.extractors.register(YoutubeMusicExtractor, {});
    console.log('🎵 [MÜZİK] Spotify, YouTube Music, SoundCloud, Apple Music ve Deezer kaynakları hazır');
})().catch((error) => {
    console.error('🔴 [MÜZİK] Extractorlar yüklenemedi:', error);
});

const { hookConsole, setConsoleInterceptor } = require('./Utils/Core/logger');
hookConsole();
clearTerminal();
printStartupBanner();
const startupLogCapture = createStartupLogCapture();
setConsoleInterceptor(startupLogCapture.interceptor);

async function startBot() {
    setupBlacklistServers(client);
    const burcGönderici = require('./Utils/Engagement/burcGönderici');
    burcGönderici(client);
    const autoBackup = require('./Utils/Backup/autoBackup');
    const randomMediaScheduler = require("./Utils/Media/randomMediaScheduler");
    const { cekilisleriYukle } = require('./Utils/Engagement/çekilişKontrol.js');
    const { oylamaKontrolYukle } = require("./Utils/Engagement/oylamaKontrol.js");
    const { dogumGunuZamanlayiciKur } = require('./Utils/Engagement/dogumGunuKontrol.js');
    const { aboneKontrolYukle } = require("./Utils/Membership/aboneKontrol.js");

    const hatirlatmaKomut = require('./Commands/Kullanıcı/hatırlatıcı.js');
    const { setupStickyListeners } = require("./Commands/Sunucu/sticky-message.js");
    const { loadTimedRoleScheduler } = require("./Utils/Moderation/rolYonetimi.js");

    require('./Utils/Core/logger.js').hookConsole();
    require('./Utils/Scheduling/haberKontrol.js')(client);
    require("./Utils/Backup/yedekAlıcı")(client);
    require('./Utils/Tickets/ticketExpiry')(client);

    databaseKontrolEt();
    console.log("✔️ [SİSTEM] Database kontrolleri tamamlandı. \n");

    const eventStats = loadEvents(client);

    await client.login(DISCORD_TOKEN);
    await musicExtractorsReady;
    const emojiStats = await emojiler.loadApplicationEmojis(client);
    console.log(
        `✔️ [EMOJİ] ${emojiStats.count} Application Emoji çekildi, `
        + `${emojiStats.lookupCount} taşınabilir ad anahtarı oluşturuldu.`,
    );
    if (emojiStats.ambiguousLookupKeys.length > 0) {
        console.warn(
            `⚠️ [EMOJİ] Birden fazla emojiyi işaret ettiği için kullanılmayan adlar: `
            + emojiStats.ambiguousLookupKeys.join(", "),
        );
    }

    const commandStats = await loadCommands(client);
    const oyYarismasiCommand = client.commands.get('oy-yarışması');
    if (oyYarismasiCommand?.restorePolls) {
        await oyYarismasiCommand.restorePolls(client);
    }
    autoBackup(client);
    randomMediaScheduler(client);
    hatirlatmaKomut.hatirlatmalariYukle(client);
    cekilisleriYukle(client);
    oylamaKontrolYukle(client);
    aboneKontrolYukle(client);
    await dogumGunuZamanlayiciKur(client);
    setupStickyListeners(client);
    loadTimedRoleScheduler(client);
    if (getEnv("DASHBOARD_ENABLED", "false") === "true") {
        await loadDashboard(client);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    setConsoleInterceptor(null);
    console.log(`\n${renderServicePanel(startupLogCapture.entries)}\n`);

    const runtimeMonitor = startRuntimeMonitor(client, {
        events: eventStats.loaded,
        commands: commandStats.loaded,
    });
    setConsoleInterceptor(runtimeMonitor.interceptor);
}

startBot().catch((error) => {
    setConsoleInterceptor(null);
    console.log(`\n${renderServicePanel(startupLogCapture.entries)}\n`);
    console.error("🛑 [SİSTEM] Bot başlatılamadı:", error);
    process.exit(1);
});
