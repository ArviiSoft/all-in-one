const categories = [
  {
    category: "Şehir",
    words: [
      "adana", "adıyaman", "afyonkarahisar", "ağrı", "amasya", "ankara", "antalya", "artvin", "aydın",
      "balıkesir", "bilecik", "bingöl", "bitlis", "bolu", "burdur", "bursa", "çanakkale", "çankırı", "çorum",
      "denizli", "diyarbakır", "edirne", "elazığ", "erzincan", "erzurum", "eskişehir", "gaziantep", "giresun",
      "gümüşhane", "hakkâri", "hatay", "ısparta", "mersin", "istanbul", "izmir", "kars", "kastamonu", "kayseri",
      "kırklareli", "kırşehir", "kocaeli", "konya", "kütahya", "malatya", "manisa", "kahramanmaraş", "mardin",
      "muğla", "muş", "nevşehir", "niğde", "ordu", "rize", "sakarya", "samsun", "siirt", "sinop", "sivas",
      "tekirdağ", "tokat", "trabzon", "tunceli", "şanlıurfa", "uşak", "van", "yozgat", "zonguldak", "aksaray",
      "bayburt", "karaman", "kırıkkale", "batman", "şırnak", "bartın", "ardahan", "ığdır", "yalova", "karabük",
      "kilis", "osmaniye", "düzce",
    ],
  },
  {
    category: "Hayvan",
    words: [
      "aslan", "kaplan", "leopar", "çita", "jaguar", "puma", "kurt", "tilki", "çakal", "sırtlan", "ayı", "panda",
      "koala", "kanguru", "zürafa", "fil", "gergedan", "suaygırı", "zebra", "bizon", "manda", "geyik", "karaca",
      "ceylan", "keçi", "koyun", "inek", "boğa", "at", "eşek", "deve", "lama", "alpaka", "tavşan", "sincap",
      "kirpi", "kunduz", "fare", "hamster", "köstebek", "yarasa", "maymun", "goril", "şempanze", "orangutan",
      "lemur", "penguen", "devekuşu", "kartal", "şahin", "doğan", "baykuş", "karga", "martı", "güvercin",
      "serçe", "flamingo", "pelikan", "papağan", "tavuskuşu", "timsah", "kaplumbağa", "kertenkele", "bukalemun",
      "iguana", "yılan", "kurbağa", "semender", "köpekbalığı", "yunus", "balina", "fok", "ahtapot", "kalamar",
      "denizanası", "yengeç", "ıstakoz", "karınca", "arı", "kelebek", "çekirge", "uğurböceği", "örümcek", "akrep",
      "kırkayak", "salyangoz", "solucan", "sazan", "hamsi", "levrek", "alabalık", "kılıçbalığı", "karides",
    ],
  },
  {
    category: "Eşya",
    words: [
      "kitap", "defter", "kalem", "silgi", "cetvel", "makas", "zımba", "dosya", "çanta", "cüzdan", "anahtar",
      "kilit", "saat", "gözlük", "şemsiye", "tarak", "ayna", "havlu", "sabun", "yastık", "battaniye", "perde",
      "halı", "masa", "sandalye", "koltuk", "dolap", "çekmece", "raf", "yatak", "lamba", "avize", "fener", "mum",
      "televizyon", "radyo", "telefon", "bilgisayar", "klavye", "kumanda", "kulaklık", "kamera", "yazıcı", "ütü",
      "süpürge", "buzdolabı", "fırın", "tencere", "tava", "tabak", "bardak", "fincan", "kaşık", "çatal", "bıçak",
      "sürahi", "şişe", "sepet", "kova", "çekiç", "tornavida", "pense", "matkap", "testere", "merdiven", "ip",
      "çadır", "pusula", "dürbün", "valiz", "bavul", "kask", "düdük", "mendil", "fırça", "mandal", "askı",
      "termos", "çakmak", "priz", "kablo", "adaptör", "mikrofon", "hoparlör", "tripod", "projektör", "hesapmakinesi",
    ],
  },
  {
    category: "Meslek",
    words: [
      "öğretmen", "doktor", "hemşire", "eczacı", "dişçi", "veteriner", "psikolog", "avukat", "hakim", "savcı",
      "polis", "asker", "itfaiyeci", "mimar", "mühendis", "teknisyen", "elektrikçi", "tesisatçı", "marangoz", "terzi",
      "kuaför", "berber", "aşçı", "garson", "fırıncı", "kasap", "manav", "çiftçi", "bahçıvan", "balıkçı", "şoför",
      "pilot", "kaptan", "makinist", "gazeteci", "yazar", "şair", "ressam", "heykeltıraş", "fotoğrafçı", "müzisyen",
      "oyuncu", "yönetmen", "sunucu", "spiker", "tercüman", "arkeolog", "tarihçi", "biyolog", "kimyager", "fizikçi",
      "matematikçi", "yazılımcı", "tasarımcı", "muhasebeci", "bankacı", "ekonomist", "sekreter", "güvenlik", "kurye",
      "postacı", "madenci", "jeolog", "astronom", "dalgıç", "cankurtaran", "hakem", "antrenör", "noter", "müfettiş",
      "editör", "kameraman", "reklamcı", "sigortacı", "emlakçı", "operatör", "kaynakçı", "döşemeci", "saatçi",
    ],
  },
  {
    category: "Doğa",
    words: [
      "orman", "dağ", "tepe", "ova", "vadi", "kanyon", "mağara", "şelale", "nehir", "dere", "göl", "deniz",
      "okyanus", "ada", "yarımada", "koy", "körfez", "sahil", "kumsal", "çöl", "bozkır", "plato", "buzul",
      "yanardağ", "krater", "kaynak", "pınar", "yağmur", "kar", "dolu", "sis", "rüzgar", "fırtına", "kasırga",
      "hortum", "şimşek", "yıldırım", "gökkuşağı", "bulut", "güneş", "ay", "yıldız", "gezegen", "gökyüzü",
      "toprak", "kaya", "taş", "kum", "çamur", "dalga", "gelgit", "deprem", "çığ", "heyelan", "yaprak", "çiçek",
      "ağaç", "çimen", "yosun", "mercan", "volkan", "obruk", "delta", "akarsu", "bataklık", "şafak", "günbatımı",
      "gölge", "kırağı", "çiy", "sağanak", "meltem", "muson", "mevsim", "ufuk", "yamaç", "zirve",
    ],
  },
  {
    category: "Yiyecek",
    words: [
      "ekmek", "simit", "poğaça", "börek", "mantı", "makarna", "pilav", "çorba", "kebap", "döner", "köfte",
      "lahmacun", "pide", "gözleme", "menemen", "omlet", "dolma", "sarma", "karnıyarık", "musakka", "güveç",
      "baklava", "kadayıf", "künefe", "lokum", "helva", "sütlaç", "muhallebi", "aşure", "dondurma", "pasta",
      "kurabiye", "çikolata", "bal", "reçel", "peynir", "yoğurt", "tereyağı", "zeytin", "yumurta", "sucuk",
      "pastırma", "elma", "armut", "ayva", "muz", "portakal", "mandalina", "limon", "greyfurt", "çilek", "kiraz",
      "vişne", "üzüm", "karpuz", "kavun", "şeftali", "kayısı", "erik", "incir", "nar", "kivi", "ananas", "mango",
      "hurma", "kestane", "fındık", "fıstık", "ceviz", "badem", "domates", "salatalık", "biber", "patlıcan",
      "kabak", "patates", "soğan", "sarımsak", "havuç", "turp", "ıspanak", "marul", "lahana", "pırasa", "bamya",
      "fasulye", "nohut", "mercimek", "bezelye", "mısır", "mantar", "brokoli", "karnabahar", "enginar", "kereviz",
    ],
  },
  {
    category: "Bitki",
    words: [
      "gül", "lale", "papatya", "menekşe", "orkide", "nergis", "sümbül", "karanfil", "yasemin", "lavanta", "zambak",
      "begonya", "kamelya", "manolya", "şakayık", "nilüfer", "kaktüs", "sardunya", "açelya", "ortanca", "akasya",
      "çam", "meşe", "çınar", "kavak", "söğüt", "kayın", "gürgen", "sedir", "ardıç", "köknar", "ladin", "selvi",
      "zeytin", "incir", "ceviz", "fındık", "badem", "defne", "okaliptüs", "baobab", "sekoya", "palmiye", "bambu",
      "eğrelti", "sarmaşık", "yonca", "ısırgan", "kekik", "nane", "fesleğen", "adaçayı", "biberiye", "maydanoz",
      "dereotu", "rezene", "ekinezya", "ıhlamur", "kantaron", "gelincik", "kardelen", "çiğdem", "safran", "vanilya",
    ],
  },
  {
    category: "Spor",
    words: [
      "futbol", "basketbol", "voleybol", "hentbol", "tenis", "badminton", "beyzbol", "softbol", "ragbi", "kriket",
      "hokey", "golf", "bilardo", "bowling", "okçuluk", "atletizm", "jimnastik", "halter", "güreş", "boks", "judo",
      "karate", "tekvando", "eskrim", "yüzme", "dalgıçlık", "kürek", "yelken", "sörf", "kayak", "kızak", "paten",
      "bisiklet", "tırmanış", "koşu", "maraton", "triatlon", "oryantiring", "paraşüt", "motokros", "karting", "dart",
      "satranç", "masa tenisi", "sutopu", "rafting", "kano", "snowboard", "curling", "bocce", "pentatlon",
    ],
  },
  {
    category: "Ulaşım",
    words: [
      "otomobil", "otobüs", "minibüs", "kamyon", "kamyonet", "motosiklet", "bisiklet", "scooter", "traktör", "ambulans",
      "itfaiye", "taksi", "tramvay", "metro", "metrobüs", "tren", "lokomotif", "vagon", "füniküler", "teleferik",
      "uçak", "helikopter", "planör", "balon", "roket", "gemi", "vapur", "feribot", "tekne", "yelkenli", "kano",
      "kayık", "denizaltı", "yat", "sandal", "limuzin", "karavan", "monoray", "zeplin", "denizotobüsü",
    ],
  },
  {
    category: "Teknoloji",
    words: [
      "bilgisayar", "telefon", "tablet", "televizyon", "kamera", "klavye", "monitör", "işlemci", "anakart", "bellek",
      "ekrankartı", "disk", "sunucu", "modem", "yönlendirici", "internet", "uygulama", "yazılım", "donanım", "algoritma",
      "veritabanı", "programlama", "robot", "drone", "sensör", "lazer", "uydu", "radar", "sonar", "anten", "batarya",
      "mikroçip", "transistör", "devre", "kablo", "adaptör", "projektör", "yazıcı", "tarayıcı", "mikrofon", "hoparlör",
      "kulaklık", "konsol", "oyunkolu", "akıllısaat", "hesapmakinesi", "şifreleme", "güvenlikduvarı", "bulut", "piksel",
      "dokunmatik", "dosya", "klasör", "işletimsistemi", "yapayzeka", "sanalgerçeklik", "biyometri", "otomasyon",
    ],
  },
];

module.exports = Object.freeze(categories.map(({ category, words }) => Object.freeze({
  category,
  words: Object.freeze([...words]),
})));