const AY_ADLARI = Object.freeze([
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
]);

const ISTANBUL_SAAT_DILIMI = "Europe/Istanbul";
const BIR_GUN = 24 * 60 * 60 * 1000;

function istanbulBugunu(tarih = new Date()) {
  const parcalar = new Intl.DateTimeFormat("en-CA", {
    timeZone: ISTANBUL_SAAT_DILIMI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(tarih);

  const degerler = Object.fromEntries(
    parcalar
      .filter(parca => parca.type !== "literal")
      .map(parca => [parca.type, Number(parca.value)])
  );

  return {
    gun: degerler.day,
    ay: degerler.month,
    yil: degerler.year,
  };
}

function gecerliTarihMi(gun, ay, yil) {
  const tarih = new Date(Date.UTC(yil, ay - 1, gun));
  return tarih.getUTCFullYear() === yil
    && tarih.getUTCMonth() + 1 === ay
    && tarih.getUTCDate() === gun;
}

function dogumGunuCoz(deger) {
  if (typeof deger !== "string") return null;

  const parcalar = deger.split("/");
  if (parcalar.length < 2 || parcalar.length > 3) return null;

  const [gunMetni, ayMetni, yilMetni] = parcalar;
  if (!/^\d{1,2}$/.test(gunMetni) || !/^\d{1,2}$/.test(ayMetni)) return null;
  if (yilMetni !== undefined && !/^\d{4}$/.test(yilMetni)) return null;

  const gun = Number(gunMetni);
  const ay = Number(ayMetni);
  const yil = yilMetni === undefined ? null : Number(yilMetni);
  const kontrolYili = yil ?? 2000;

  if (!gecerliTarihMi(gun, ay, kontrolYili)) return null;

  return { gun, ay, yil };
}

function dogumGunuOlustur(gun, ay, yil, bugun = istanbulBugunu()) {
  const yilGirildi = yil !== null && yil !== undefined;

  if (!Number.isInteger(gun) || !Number.isInteger(ay) || (yilGirildi && !Number.isInteger(yil))) {
    return { hata: "Gün, ay ve yıl yalnızca tam sayı olabilir." };
  }

  if (gun < 1 || gun > 31 || ay < 1 || ay > 12) {
    return { hata: "Geçerli bir gün ve ay girin." };
  }

  if (yilGirildi && yil > bugun.yil) {
    return { hata: "Gelecekten bir doğum yılı giremezsiniz." };
  }

  if (yilGirildi && yil < bugun.yil - 100) {
    return { hata: "En fazla 100 yaşında bir doğum yılı girebilirsiniz." };
  }

  const kontrolYili = yilGirildi ? yil : 2000;
  if (!gecerliTarihMi(gun, ay, kontrolYili)) {
    return { hata: "Geçersiz bir tarih kombinasyonu girdiniz." };
  }

  return {
    deger: {
      gun,
      ay,
      yil: yilGirildi ? yil : null,
    },
  };
}

function dogumGunuKayitMetni(dogumGunu) {
  const gun = String(dogumGunu.gun).padStart(2, "0");
  const ay = String(dogumGunu.ay).padStart(2, "0");
  return dogumGunu.yil ? `${gun}/${ay}/${dogumGunu.yil}` : `${gun}/${ay}`;
}

function uzunTarih(dogumGunu, yilGoster = true) {
  const temel = `${dogumGunu.gun} ${AY_ADLARI[dogumGunu.ay - 1]}`;
  return yilGoster && dogumGunu.yil ? `${temel} ${dogumGunu.yil}` : temel;
}

function sonrakiDogumGunu(dogumGunu, bugun = istanbulBugunu()) {
  const bugunZamani = Date.UTC(bugun.yil, bugun.ay - 1, bugun.gun);

  for (let yil = bugun.yil; yil <= bugun.yil + 8; yil++) {
    if (!gecerliTarihMi(dogumGunu.gun, dogumGunu.ay, yil)) continue;

    const zaman = Date.UTC(yil, dogumGunu.ay - 1, dogumGunu.gun);
    if (zaman < bugunZamani) continue;

    return {
      gun: dogumGunu.gun,
      ay: dogumGunu.ay,
      yil,
      zaman,
      gunFarki: Math.round((zaman - bugunZamani) / BIR_GUN),
    };
  }

  return null;
}

function kalanSureMetni(sonraki, bugun = istanbulBugunu()) {
  if (!sonraki || sonraki.gunFarki === 0) return "bugün";
  if (sonraki.gunFarki === 1) return "yarın";
  if (sonraki.gunFarki < 14) return `${sonraki.gunFarki} gün içinde`;
  if (sonraki.gunFarki < 60) return `${Math.ceil(sonraki.gunFarki / 7)} hafta içinde`;

  let ayFarki = (sonraki.yil - bugun.yil) * 12 + (sonraki.ay - bugun.ay);
  if (sonraki.gun < bugun.gun) ayFarki--;
  return `${Math.max(1, ayFarki)} ay içinde`;
}

function gelecekYas(dogumGunu, sonraki) {
  if (!dogumGunu.yil || !sonraki) return null;
  return sonraki.yil - dogumGunu.yil;
}

function mevcutYas(dogumGunu, bugun = istanbulBugunu()) {
  if (!dogumGunu.yil) return null;

  let yas = bugun.yil - dogumGunu.yil;
  const dogumGunuGecmedi = bugun.ay < dogumGunu.ay
    || (bugun.ay === dogumGunu.ay && bugun.gun < dogumGunu.gun);

  if (dogumGunuGecmedi) yas--;
  return Math.max(0, yas);
}

module.exports = {
  AY_ADLARI,
  ISTANBUL_SAAT_DILIMI,
  dogumGunuCoz,
  dogumGunuKayitMetni,
  dogumGunuOlustur,
  gelecekYas,
  istanbulBugunu,
  kalanSureMetni,
  mevcutYas,
  sonrakiDogumGunu,
  uzunTarih,
};
