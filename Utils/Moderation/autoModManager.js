const { AutoModerationActionType, AutoModerationRuleEventType, AutoModerationRuleKeywordPresetType, AutoModerationRuleTriggerType } = require("discord.js");
const PROFANITY_KEYWORDS = require("./autoModProfanity.js");

const RULE_KEYS = Object.freeze({
  ADVERTISING: "advertising",
  PROFANITY: "profanity",
  CUSTOM_WORDS: "customWords",
  PROTECTED_ROLES: "protectedRoles",
  UNSAFE_CONTENT: "unsafeContent",
  SPAM: "spam",
  MENTION_SPAM: "mentionSpam",
});

const ADVERTISING_REGEX_PATTERNS = Object.freeze([
  "(?:https?://)?(?:www\\.)?(?:discord(?:app)?\\.com/invites?|discord\\.gg)/[a-z0-9-]+",
  "(?:https?://)?(?:www\\.)?(?:discord\\.me|discord\\.io|invite\\.gg)/[a-z0-9-]+",
  "(?:https?://)?(?:www\\.)?(?:t\\.me|telegram\\.me)/[a-z0-9_]+",
  "(?:https?://)?(?:www\\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:com|net|org|co|io|xyz|gg|me|be|tv|app|dev|site|online|store|club|link)(?:/\\S*)?",
  "\\b(?:[0-9]{1,3}\\.){3}[0-9]{1,3}(?::[0-9]{2,5})?\\b",
  "discord\\s*(?:\\.|\\[\\s*\\.\\s*\\])\\s*gg\\s*/\\s*[a-z0-9-]+",
]);

const RULE_DEFINITIONS = Object.freeze({
  [RULE_KEYS.ADVERTISING]: {
    name: "Reklam Engeli",
    triggerType: AutoModerationRuleTriggerType.Keyword,
    customMessage: "Reklam ve izinsiz bağlantı paylaşımı bu sunucuda engelleniyor.",
  },
  [RULE_KEYS.PROFANITY]: {
    name: "Türkçe Küfür Engeli",
    triggerType: AutoModerationRuleTriggerType.Keyword,
    customMessage: "Küfür ve uygunsuz dil kullanımı bu sunucuda engelleniyor.",
  },
  [RULE_KEYS.CUSTOM_WORDS]: {
    name: "Yasaklı Kelimeler",
    triggerType: AutoModerationRuleTriggerType.Keyword,
    customMessage: "Mesajın sunucunun yasaklı kelime filtresine takıldı.",
  },
  [RULE_KEYS.PROTECTED_ROLES]: {
    name: "Korunan Rol Etiketleri",
    triggerType: AutoModerationRuleTriggerType.Keyword,
    customMessage: "Bu rolü etiketlemene izin verilmiyor.",
  },
  [RULE_KEYS.UNSAFE_CONTENT]: {
    name: "Sakıncalı İçerik",
    triggerType: AutoModerationRuleTriggerType.KeywordPreset,
    customMessage: "Discord'un sakıncalı içerik filtresi bu mesajı engelledi.",
  },
  [RULE_KEYS.SPAM]: {
    name: "Genel Spam Engeli",
    triggerType: AutoModerationRuleTriggerType.Spam,
    customMessage: "Discord bu mesajı spam olarak algıladı.",
  },
  [RULE_KEYS.MENTION_SPAM]: {
    name: "Etiket Spam Engeli",
    triggerType: AutoModerationRuleTriggerType.MentionSpam,
    customMessage: "Tek mesajda çok fazla kullanıcı veya rol etiketleyemezsin.",
  },
});

const DEFAULT_ENABLE_KEYS = Object.freeze([
  RULE_KEYS.ADVERTISING,
  RULE_KEYS.PROFANITY,
  RULE_KEYS.UNSAFE_CONTENT,
  RULE_KEYS.SPAM,
  RULE_KEYS.MENTION_SPAM,
]);

class AutoModConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "AutoModConfigError";
  }
}

function normalizeKeywords(values) {
  const unique = new Map();

  for (const value of values) {
    const keyword = String(value).trim().replace(/\s+/g, " ");
    if (!keyword) continue;
    if (keyword.length > 60) {
      throw new AutoModConfigError(`\`${keyword.slice(0, 30)}…\` 60 karakter sınırını aşıyor.`);
    }

    const normalizedKey = keyword.toLocaleLowerCase("tr-TR");
    if (!unique.has(normalizedKey)) unique.set(normalizedKey, keyword);
  }

  const keywords = [...unique.values()];
  if (keywords.length > 1000) {
    throw new AutoModConfigError("Bir Discord AutoMod kuralına en fazla 1.000 kelime eklenebilir.");
  }

  return keywords;
}

function parseKeywordInput(input) {
  return normalizeKeywords(String(input).split(/[\n,]/));
}

function extractProtectedRoleIds(rule) {
  if (!rule) return [];

  return rule.triggerMetadata.keywordFilter
    .map(keyword => /^<@&(\d+)>$/.exec(keyword)?.[1])
    .filter(Boolean);
}

function getRule(rules, key) {
  const definition = RULE_DEFINITIONS[key];
  if (!definition) throw new AutoModConfigError("Bilinmeyen AutoMod kuralı.");
  return rules.find(rule => rule.name === definition.name) || null;
}

async function fetchRules(guild) {
  return guild.autoModerationRules.fetch({ cache: false });
}

function resolveTriggerMetadata(key, currentRule, options = {}) {
  const allowList = currentRule?.triggerMetadata.allowList || [];
  const withAllowList = metadata => (
    allowList.length > 0 ? { ...metadata, allowList: [...allowList] } : metadata
  );

  switch (key) {
    case RULE_KEYS.ADVERTISING:
      return withAllowList({ regexPatterns: [...ADVERTISING_REGEX_PATTERNS] });

    case RULE_KEYS.PROFANITY:
      return withAllowList({ keywordFilter: [...PROFANITY_KEYWORDS] });

    case RULE_KEYS.CUSTOM_WORDS: {
      const keywords = normalizeKeywords(
        options.keywords ?? currentRule?.triggerMetadata.keywordFilter ?? [],
      );
      if (keywords.length === 0) {
        throw new AutoModConfigError("Önce en az bir yasaklı kelime eklemelisin.");
      }
      return withAllowList({ keywordFilter: keywords });
    }

    case RULE_KEYS.PROTECTED_ROLES: {
      const roleIds = [...new Set(options.roleIds ?? extractProtectedRoleIds(currentRule))];
      if (roleIds.length === 0) {
        throw new AutoModConfigError("Önce korunacak en az bir rol seçmelisin.");
      }
      if (roleIds.length > 20) {
        throw new AutoModConfigError("En fazla 20 rol korunabilir.");
      }
      return withAllowList({ keywordFilter: roleIds.map(roleId => `<@&${roleId}>`) });
    }

    case RULE_KEYS.UNSAFE_CONTENT:
      return withAllowList({
        presets: [
          AutoModerationRuleKeywordPresetType.Profanity,
          AutoModerationRuleKeywordPresetType.SexualContent,
          AutoModerationRuleKeywordPresetType.Slurs,
        ],
      });

    case RULE_KEYS.SPAM:
      return undefined;

    case RULE_KEYS.MENTION_SPAM: {
      const mentionLimit = Number(
        options.mentionLimit ?? currentRule?.triggerMetadata.mentionTotalLimit ?? 5,
      );
      if (!Number.isInteger(mentionLimit) || mentionLimit < 1 || mentionLimit > 50) {
        throw new AutoModConfigError("Etiket sınırı 1 ile 50 arasında bir tam sayı olmalı.");
      }
      return {
        mentionTotalLimit: mentionLimit,
        mentionRaidProtectionEnabled: true,
      };
    }

    default:
      throw new AutoModConfigError("Bilinmeyen AutoMod kuralı.");
  }
}

function buildActions(definition, currentRule) {
  const blockAction = {
    type: AutoModerationActionType.BlockMessage,
    metadata: { customMessage: definition.customMessage },
  };
  const additionalActions = (currentRule?.actions || [])
    .filter(action => action.type !== AutoModerationActionType.BlockMessage)
    .map(action => {
      const metadata = {};
      if (action.metadata?.channelId) metadata.channel = action.metadata.channelId;
      if (action.metadata?.durationSeconds) metadata.durationSeconds = action.metadata.durationSeconds;
      if (action.metadata?.customMessage) metadata.customMessage = action.metadata.customMessage;
      return Object.keys(metadata).length > 0
        ? { type: action.type, metadata }
        : { type: action.type };
    });

  return [blockAction, ...additionalActions];
}

async function upsertRule(guild, rules, key, options = {}) {
  const definition = RULE_DEFINITIONS[key];
  if (!definition) throw new AutoModConfigError("Bilinmeyen AutoMod kuralı.");

  const currentRule = getRule(rules, key);
  const enabled = options.enabled ?? true;
  if (!currentRule && !enabled) return null;

  const triggerMetadata = resolveTriggerMetadata(key, currentRule, options);
  const sharedOptions = {
    name: definition.name,
    eventType: AutoModerationRuleEventType.MessageSend,
    triggerMetadata,
    actions: buildActions(definition, currentRule),
    enabled,
    reason: options.reason || "/automod paneli üzerinden güncellendi.",
  };

  const updatedRule = currentRule
    ? await currentRule.edit(sharedOptions)
    : await guild.autoModerationRules.create({
      ...sharedOptions,
      triggerType: definition.triggerType,
    });

  rules.set(updatedRule.id, updatedRule);
  return updatedRule;
}

async function deleteRule(guild, rules, key, reason) {
  const currentRule = getRule(rules, key);
  if (!currentRule) return false;

  await guild.autoModerationRules.delete(
    currentRule.id,
    reason || "/automod panelinden yapılandırma temizlendi.",
  );
  rules.delete(currentRule.id);
  return true;
}

function formatAutoModError(error) {
  if (error instanceof AutoModConfigError) return error.message;
  if (error?.code === 50013 || error?.code === 50001) {
    return "Botun **Sunucuyu Yönet** izni olmadığı için Discord AutoMod kuralları değiştirilemedi.";
  }

  return "Discord AutoMod kuralı değiştirilemedi. Sunucudaki kural limitlerini ve bot izinlerini kontrol et.";
}

module.exports = {
  ADVERTISING_REGEX_PATTERNS,
  AutoModConfigError,
  DEFAULT_ENABLE_KEYS,
  PROFANITY_KEYWORDS,
  RULE_DEFINITIONS,
  RULE_KEYS,
  deleteRule,
  extractProtectedRoleIds,
  fetchRules,
  formatAutoModError,
  getRule,
  normalizeKeywords,
  parseKeywordInput,
  resolveTriggerMetadata,
  upsertRule,
};
