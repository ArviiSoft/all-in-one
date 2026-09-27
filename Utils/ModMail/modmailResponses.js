const unavailableCodes = new Set([10003, 10008, 10015, 10062, 50027]);
const unavailableInteractions = new WeakSet();

async function respond(interaction, method, payload) {
  if (unavailableInteractions.has(interaction)) return false;
  try {
    await interaction[method](payload);
    return true;
  } catch (error) {
    if (!unavailableCodes.has(Number(error?.code))) throw error;
    unavailableInteractions.add(interaction);
    return false;
  }
}

function errorDetails(error) {
  return {
    name: error?.name || 'Error', code: error?.code, status: error?.status,
    message: String(error?.message || 'Bilinmeyen hata').replace(/https?:\/\/[^\s"'<>]+/gi, '[bağlantı]').slice(0, 500),
  };
}

module.exports = { respond, errorDetails };
