const AUTOMATION_NONCE_PREFIX = "aio:";

let nonceSequence = 0;

function createAutomationNonce(source = "auto") {
  nonceSequence = (nonceSequence + 1) % 1_679_616;

  const safeSource = String(source)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 5) || "auto";

  return `${AUTOMATION_NONCE_PREFIX}${safeSource}:${Date.now().toString(36)}:${nonceSequence.toString(36)}`
    .slice(0, 25);
}

function isInternalAutomationMessage(message, clientUserId) {
  if (!clientUserId || message?.author?.id !== clientUserId) return false;
  return typeof message.nonce === "string" && message.nonce.startsWith(AUTOMATION_NONCE_PREFIX);
}

function isBotOrWebhookMessage(message) {
  return message?.author?.bot === true || Boolean(message?.webhookId);
}

module.exports = {
  AUTOMATION_NONCE_PREFIX,
  createAutomationNonce,
  isBotOrWebhookMessage,
  isInternalAutomationMessage,
};