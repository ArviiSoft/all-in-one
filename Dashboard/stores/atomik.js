const fs = require('../../Utils/Core/databaseFs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
function atomikYaz(dosya, veri) {
  const gecici = `${dosya}.tmp-${randomUUID()}`;
  try {
    fs.mkdirSync(path.dirname(dosya), { recursive: true });
    fs.writeFileSync(gecici, JSON.stringify(veri, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(gecici, dosya);
  } finally { if (fs.existsSync(gecici)) fs.unlinkSync(gecici); }
}
module.exports = { atomikYaz };