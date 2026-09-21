const bcrypt = require('bcryptjs');
const { randomBytes } = require('node:crypto');

function gizliOku(etiket) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error('Parolayı gizli girebilmek için bu komutu etkileşimli terminalde çalıştırın.'));
    process.stdout.write(etiket);
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
    let metin = '';
    const temizle = () => { process.stdin.removeListener('data', dinle); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); };
    const dinle = giris => {
      for (const harf of giris) {
        if (harf === '\u0003') { temizle(); return reject(new Error('İşlem iptal edildi.')); }
        if (harf === '\r' || harf === '\n') { temizle(); return resolve(metin); }
        if (harf === '\u007f' || harf === '\b') metin = Array.from(metin).slice(0, -1).join('');
        else if (harf >= ' ' && Buffer.byteLength(metin) < 256) metin += harf;
      }
    };
    process.stdin.on('data', dinle);
  });
}
async function baslat() {
  const parola = await gizliOku('Yeni parola (yazdıklarınız görünmez): ');
  if (parola.length < 12 || bcrypt.truncates(parola)) throw new Error('En az 12 karakter, UTF-8 olarak en fazla 72 bayt parola kullanın.');
  const tekrar = await gizliOku('Parolayı tekrar girin: ');
  if (parola !== tekrar) throw new Error('Parolalar eşleşmiyor.');
  process.stdout.write('\nAşağıdaki değerleri Settings/.env dosyasına kendiniz ekleyin. Bu çıktı gizlidir.\n');
  process.stdout.write(`DASHBOARD_PASSWORD_HASH=${await bcrypt.hash(parola, 12)}\n`);
  process.stdout.write(`DASHBOARD_SESSION_SECRET=${randomBytes(48).toString('hex')}\n`);
  process.stdout.write('DASHBOARD_USERNAME değerini seçin ve DASHBOARD_ENABLED=true yapın.\n');
}
baslat().catch(hata => { console.error(`🔴 [DASHBOARD] ${hata.message}`); process.exitCode = 1; });
