const session = require('express-session');

class OturumDeposu extends session.Store {
  constructor() {
    super();
    this.kayitlar = new Map();
    this.temizlik = setInterval(() => {
      for (const [id, kayit] of this.kayitlar) if (kayit.bitis <= Date.now()) this.kayitlar.delete(id);
    }, 60_000);
    this.temizlik.unref();
  }
  get(id, callback) {
    const kayit = this.kayitlar.get(id);
    if (!kayit || kayit.bitis <= Date.now()) { this.kayitlar.delete(id); return callback(null, null); }
    callback(null, JSON.parse(kayit.veri));
  }
  set(id, veri, callback = () => {}) {
    if (!this.kayitlar.has(id) && this.kayitlar.size >= 1000) this.kayitlar.delete(this.kayitlar.keys().next().value);
    this.kayitlar.set(id, { veri: JSON.stringify(veri), bitis: new Date(veri.cookie.expires || Date.now() + 30 * 60_000).getTime() });
    callback(null);
  }
  touch(id, veri, callback = () => {}) {
    const kayit = this.kayitlar.get(id);
    if (kayit && kayit.bitis > Date.now()) {
      const mevcut = JSON.parse(kayit.veri);
      mevcut.cookie = veri.cookie;
      kayit.veri = JSON.stringify(mevcut);
      kayit.bitis = new Date(veri.cookie.expires).getTime();
    }
    callback(null);
  }
  destroy(id, callback = () => {}) { this.kayitlar.delete(id); callback(null); }
  close() { clearInterval(this.temizlik); this.kayitlar.clear(); }
}
module.exports = { OturumDeposu };
