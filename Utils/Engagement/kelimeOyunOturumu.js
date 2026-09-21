const WORD_PATTERN = /^[a-zçğıöşüâîû]+$/u;

function normalizeGameWord(value) {
  return String(value || "").trim().toLocaleLowerCase("tr-TR").normalize("NFC");
}

function resetUsedWords(data) {
  for (const session of Object.values(data)) {
    if (!session || typeof session !== "object") continue;
    session.kullanilanlar = session.sonKelime ? [session.sonKelime] : [];
  }
}

function componentText(components = []) {
  return components.flatMap(component => {
    const data = typeof component.toJSON === "function" ? component.toJSON() : component;
    return [data.content || "", ...componentText(data.components || [])];
  });
}

function initialWordFromPanel(message, botId) {
  if (message.webhookId || message.author?.id !== botId) return null;

  const text = [
    ...componentText(message.components),
    ...(message.embeds || []).flatMap(embed => [
      embed.title || "",
      embed.description || "",
      ...(embed.fields || []).flatMap(field => [field.name, field.value]),
    ]),
  ].join("\n").normalize("NFC");

  if (!text.includes("Kelime Türetme")) return null;
  const match = text.match(/İlk Kelime[^\p{L}]+([a-zçğıöşüâîû]+)/iu);
  return match ? normalizeGameWord(match[1]) : null;
}

async function recoverSessionFromChannel(channel, { webhookId, botId, before }) {
  let cursor = before;

  while (true) {
    const messages = await channel.messages.fetch({ limit: 100, before: cursor, cache: false });
    if (messages.size === 0) return null;

    const newestFirst = [...messages.values()].sort((a, b) => (
      BigInt(a.id) > BigInt(b.id) ? -1 : BigInt(a.id) < BigInt(b.id) ? 1 : 0
    ));

    for (const message of newestFirst) {
      const word = message.webhookId === webhookId
        ? normalizeGameWord(message.content)
        : initialWordFromPanel(message, botId);

      if (word && WORD_PATTERN.test(word)) {
        return { sonKelime: word, kullanilanlar: [word] };
      }
    }

    const oldestId = newestFirst.at(-1).id;
    if (oldestId === cursor) throw new Error("Kelime oyunu geçmişinde ilerlenemedi.");
    cursor = oldestId;
  }
}

module.exports = { resetUsedWords, recoverSessionFromChannel };