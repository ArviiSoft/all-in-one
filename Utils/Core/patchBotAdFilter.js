const PATCHBOT_MARKER = /\bpatch\s*bot\b|patchbot\.io/i;

const PATCHBOT_AD_PATTERNS = [
  /\bpatch\s*bot\s+premium\b/i,
  /\banyone\s+can\s+(?:give|gift)\s+premium\s+to\s+(?:this|your)\s+server\b/i,
  /\b(?:subscribe|upgrade)\s+to\s+patch\s*bot\s+premium\b/i,
  /\b(?:brought|sponsored)\s+(?:to\s+you\s+)?by\s+patch\s*bot\b/i,
  /\bpatchbot\.io\/premium\b/i,
];

function getEmbedText(embed) {
  if (!embed || typeof embed !== "object") return "";

  const raw = typeof embed.toJSON === "function"
    ? embed.toJSON()
    : (embed.data && typeof embed.data === "object" ? embed.data : embed);

  const parts = [
    raw.author?.name,
    raw.title,
    raw.description,
    raw.footer?.text,
    raw.provider?.name,
    raw.url,
  ];

  for (const field of raw.fields || []) {
    parts.push(field?.name, field?.value);
  }

  return parts.filter(value => typeof value === "string").join("\n");
}

function isPatchBotAdEmbed(embed) {
  const text = getEmbedText(embed);
  if (!PATCHBOT_MARKER.test(text)) return false;

  return PATCHBOT_AD_PATTERNS.some(pattern => pattern.test(text));
}

module.exports = { isPatchBotAdEmbed };
