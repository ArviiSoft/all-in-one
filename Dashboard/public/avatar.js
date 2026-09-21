/* exported avatarYukle, avatarPaneli, avatarAyarlariniBagla */

'use strict';
let avatarDurumu;
function avatarOturumunuSifirla() {
  avatarDurumu = { avatar: null, loaded: false, draft: null, loading: false, saving: false, message: '', error: false, selection: 0 };
}
avatarOturumunuSifirla();
async function avatarYukle() {
  const editor = avatarDurumu;
  try {
    const veri = await api('/profile/avatar');
    if (editor === avatarDurumu) { editor.avatar = veri.avatar; editor.loaded = true; }
  } catch (hata) {
    if (hata.status === 401) throw hata;
    if (editor === avatarDurumu) { editor.error = true; editor.message = 'Kayıtlı avatar yüklenemedi. Tekrar denemek için sayfayı yenileyin.'; }
  }
}
function profilAvatarIcerigi() {
  const avatar = avatarDurumu.avatar || (durum.authMethod === 'discord' ? durum.user?.avatarUrl : null);
  return `${kacir(profilHarfleri())}${avatar ? `<img class="user-avatar-image" src="${kacir(avatar)}" alt="">` : ''}`;
}
function avatarPaneli() {
  return `<section class="panel profile-panel" aria-labelledby="profile-avatar-title">
    <div class="profile-section-heading"><span class="module-icon">${ikon('profile')}</span><div><h2 id="profile-avatar-title">Profil fotoğrafı</h2><p>Profilinizde ve alt menüde görünecek avatarınızı seçin.</p></div></div>
    <form id="avatar-form">
      <div class="avatar-upload-row"><div class="avatar avatar-preview" id="avatar-preview" role="img" aria-label="Avatar önizlemesi"></div><div class="avatar-upload-content">
        <div class="avatar-buttons"><button type="button" class="btn" id="avatar-upload">${ikon('upload')} Görsel yükle</button><button type="button" class="btn" id="avatar-edit">Düzenle</button><button type="button" class="btn danger" id="avatar-remove">Kaldır</button></div>
        <input type="file" id="avatar-file" accept="image/png,image/jpeg,image/webp" aria-label="Avatar görseli seçin" aria-describedby="avatar-file-hint" hidden>
        <p class="field-hint" id="avatar-file-hint">PNG, JPG veya WebP · En fazla 5 MB. Görsel daire içinde gösterilir.</p>
      </div></div>
      <div class="avatar-crop-controls" id="avatar-crop-controls" hidden>
        <div class="avatar-crop-heading"><h3>Görseli ayarla</h3><button type="button" class="text-button" id="avatar-crop-reset">Ortala ve sıfırla</button></div>
        <div class="avatar-range"><label for="avatar-zoom">Yakınlaştırma</label><output id="avatar-zoom-value" for="avatar-zoom"></output><input type="range" id="avatar-zoom" min="1" max="3" step="0.05" value="1"></div>
        <div class="avatar-position-controls"><div class="avatar-range"><label for="avatar-x">Yatay konum</label><input type="range" id="avatar-x" min="0" max="100" step="1" value="50"></div><div class="avatar-range"><label for="avatar-y">Dikey konum</label><input type="range" id="avatar-y" min="0" max="100" step="1" value="50"></div></div>
      </div>
      <p class="field-hint avatar-storage-hint">Avatarınız hesabınıza kaydedilir, çıkış yaptığınızda ve bot yeniden başlatıldığında korunur.</p>
      <div class="profile-form-footer"><p class="small muted" id="avatar-save-status" role="status" aria-live="polite"></p><div class="avatar-buttons"><button type="button" class="btn" id="avatar-cancel" hidden>Vazgeç</button><button type="submit" class="btn primary" id="avatar-save" disabled>${ikon('check')} Avatarı kaydet</button></div></div>
    </form>
  </section>`;
}
function avatarTuvali(draft) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
  const image = draft.image;
  const size = Math.min(image.naturalWidth, image.naturalHeight) / draft.zoom;
  canvas.getContext('2d').drawImage(image, (image.naturalWidth - size) * draft.x / 100, (image.naturalHeight - size) * draft.y / 100, size, size, 0, 0, 256, 256);
  return canvas;
}
function avatarEditorGuncelle() {
  const form = document.getElementById('avatar-form'); if (!form) return;
  const editor = avatarDurumu; const draft = editor.draft; const busy = editor.loading || editor.saving || !editor.loaded;
  const preview = document.getElementById('avatar-preview');
  preview.innerHTML = draft ? kacir(profilHarfleri()) : profilAvatarIcerigi();
  if (draft?.image) preview.replaceChildren(avatarTuvali(draft));
  document.getElementById('avatar-upload').disabled = busy;
  document.getElementById('avatar-file').disabled = busy;
  document.getElementById('avatar-edit').disabled = busy || !editor.avatar;
  document.getElementById('avatar-remove').disabled = busy || (!editor.avatar && !draft?.image) || !!draft?.remove;
  document.getElementById('avatar-save').disabled = busy || !draft;
  document.getElementById('avatar-save').innerHTML = editor.saving ? 'Kaydediliyor…' : `${ikon('check')} Avatarı kaydet`;
  document.getElementById('avatar-cancel').hidden = !draft && !editor.loading;
  document.getElementById('avatar-cancel').disabled = editor.saving;
  document.getElementById('avatar-crop-controls').hidden = !draft?.image;
  document.getElementById('avatar-crop-reset').disabled = busy;
  for (const field of ['zoom', 'x', 'y']) {
    const input = document.getElementById(`avatar-${field}`); input.disabled = busy;
    input.value = draft?.[field] ?? (field === 'zoom' ? 1 : 50);
  }
  document.getElementById('avatar-zoom-value').textContent = `%${Math.round((draft?.zoom || 1) * 100)}`;
  const status = document.getElementById('avatar-save-status');
  status.textContent = editor.loading ? 'Görsel hazırlanıyor…' : editor.message;
  status.classList.toggle('avatar-error', editor.error);
  form.setAttribute('aria-busy', String(editor.loading || editor.saving));
}
async function avatarGorseliniAc(source, editor, selection) {
  const image = new Image(); image.src = source; await image.decode();
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 24_000_000) throw new Error('Görsel en fazla 24 megapiksel olmalı. Daha küçük bir görsel seçin.');
  if (editor !== avatarDurumu || selection !== editor.selection) return;
  editor.draft = { image, zoom: 1, x: 50, y: 50 };
  editor.message = 'Önizlemeyi ayarlayın ve avatarınızı kaydedin.';
}
function avatarDosyasiniOku(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Görsel dosyası okunamadı. Tekrar deneyin.'));
    reader.readAsDataURL(file);
  });
}
async function avatarSec(source) {
  const editor = avatarDurumu; if (editor.saving || editor.loading) return;
  const selection = ++editor.selection; editor.loading = true; editor.error = false; avatarEditorGuncelle();
  try {
    if (source instanceof File) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(source.type)) throw new Error('PNG, JPG veya WebP biçiminde bir görsel seçin.');
      if (!source.size || source.size > 5 * 1024 * 1024) throw new Error('Görsel boş olmamalı ve 5 MB sınırını aşmamalı.');
      source = await avatarDosyasiniOku(source);
    }
    await avatarGorseliniAc(source, editor, selection);
  } catch (hata) {
    if (selection === editor.selection) { editor.error = true; editor.message = hata.name === 'EncodingError' ? 'Görsel okunamadı. Başka bir görsel seçin.' : hata.message; }
  } finally {
    if (editor === avatarDurumu && selection === editor.selection) { editor.loading = false; avatarEditorGuncelle(); }
  }
}
function avatarAyarlariniBagla() {
  const file = document.getElementById('avatar-file');
  document.getElementById('avatar-upload').onclick = () => file.click();
  file.onchange = () => { const selected = file.files[0]; file.value = ''; if (selected) avatarSec(selected); };
  document.getElementById('avatar-edit').onclick = () => avatarSec(avatarDurumu.avatar);
  document.getElementById('avatar-remove').onclick = () => {
    avatarDurumu.draft = avatarDurumu.avatar ? { remove: true } : null;
    avatarDurumu.error = false; avatarDurumu.message = avatarDurumu.draft ? 'Kaldırmayı uygulamak için avatarı kaydedin.' : 'Görsel seçimi iptal edildi.'; avatarEditorGuncelle();
  };
  document.getElementById('avatar-cancel').onclick = () => {
    avatarDurumu.selection++; avatarDurumu.loading = false; avatarDurumu.draft = null; avatarDurumu.error = false;
    avatarDurumu.message = 'Değişikliklerden vazgeçildi.'; avatarEditorGuncelle();
  };
  document.getElementById('avatar-crop-reset').onclick = () => {
    Object.assign(avatarDurumu.draft, { zoom: 1, x: 50, y: 50 }); avatarEditorGuncelle();
  };
  for (const field of ['zoom', 'x', 'y']) document.getElementById(`avatar-${field}`).oninput = olay => {
    avatarDurumu.draft[field] = Number(olay.target.value); avatarDurumu.error = false;
    avatarDurumu.message = 'Kaydedilmemiş avatar değişiklikleri var.'; avatarEditorGuncelle();
  };
  document.getElementById('avatar-form').onsubmit = async olay => {
    olay.preventDefault(); const editor = avatarDurumu;
    if (!editor.draft || editor.loading || editor.saving) return;
    editor.saving = true; editor.error = false; editor.message = 'Avatar kaydediliyor…'; avatarEditorGuncelle();
    try {
      const avatar = editor.draft.remove ? null : avatarTuvali(editor.draft).toDataURL('image/png');
      const veri = await api('/profile/avatar', 'PUT', { avatar });
      if (editor !== avatarDurumu) return;
      editor.avatar = veri.avatar; editor.draft = null;
      editor.message = veri.avatar ? 'Avatar hesabınıza kaydedildi.' : durum.authMethod === 'discord' && durum.user?.avatarUrl ? 'Avatar kaldırıldı. Discord profil fotoğrafınız gösteriliyor.' : 'Avatar kaldırıldı. Baş harfleriniz gösteriliyor.';
      profilKimliginiUygula();
    } catch (hata) {
      editor.error = true; editor.message = hata.status === 401 ? 'Oturumunuz sona erdi. Yeniden giriş yapıp avatarı tekrar kaydedin.' : `Avatar kaydedilemedi. ${hata.message}`;
    } finally {
      if (editor === avatarDurumu) { editor.saving = false; avatarEditorGuncelle(); }
    }
  };
  avatarEditorGuncelle();
}
