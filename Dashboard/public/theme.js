'use strict';

(() => {
  const storageKey = 'sandbox-dashboard-theme';
  const palettes = [
    ['lavender', 'Lavanta', 'Yumuşak ve sakin'],
    ['ocean', 'Okyanus', 'Ferah bir mavi'],
    ['emerald', 'Zümrüt', 'Doğadan ilhamla'],
    ['amber', 'Kehribar', 'Sıcak ve enerjik'],
    ['rose', 'Gül', 'Zarif bir dokunuş'],
    ['graphite', 'Grafit', 'Sade ve zamansız'],
    ['sky', 'Gökyüzü', 'Açık ve özgür'],
    ['violet', 'Menekşe', 'Derin ve yaratıcı'],
    ['turquoise', 'Turkuaz', 'Canlı ve dengeli'],
    ['coral', 'Mercan', 'Neşeli ve sıcak'],
    ['crimson', 'Kızıl', 'Cesur ve güçlü'],
    ['slate', 'Arduvaz', 'Serin ve modern'],
  ];
  const root = document.documentElement;
  const normalize = value => ({
    mode: value?.mode === 'light' ? 'light' : 'dark',
    palette: palettes.some(([id]) => id === value?.palette) ? value.palette : 'lavender',
  });
  function readPreference() {
    try { return normalize(JSON.parse(localStorage.getItem(storageKey))); }
    catch { return normalize(); }
  }
  let preference = readPreference();
  function apply() {
    root.dataset.mode = preference.mode;
    root.dataset.palette = preference.palette;
    document.querySelector('meta[name="color-scheme"]').content = preference.mode;
  }
  apply();

  document.addEventListener('DOMContentLoaded', () => {
    const dialog = document.createElement('dialog');
    dialog.id = 'theme-dialog';
    dialog.className = 'theme-dialog';
    dialog.setAttribute('aria-labelledby', 'theme-title');
    dialog.setAttribute('aria-describedby', 'theme-description');
    const check = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
    dialog.innerHTML = `
      <div class="theme-heading"><div><div class="eyebrow">SİZİN PANELİNİZ, SİZİN TARZINIZ</div><h2 id="theme-title">Görünümü kişiselleştirin</h2></div><button type="button" class="icon-button" data-theme-close aria-label="Tema ayarlarını kapat" autofocus><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
      <p id="theme-description">Size en iyi gelen görünümü ve rengi seçin.</p>
      <fieldset class="theme-fieldset"><legend>Görünüm</legend><div class="theme-modes">
        ${[['light', 'Açık', 'Aydınlık ve net'], ['dark', 'Koyu', 'Göz yormayan tonlar']].map(([id, name, description]) => `
          <label class="theme-choice theme-mode" data-preview-mode="${id}"><input type="radio" name="theme-mode" value="${id}"><span class="theme-choice-body"><span class="theme-mini" aria-hidden="true"><span class="theme-mini-sidebar"><i></i><i></i><i></i></span><span class="theme-mini-content"><span class="theme-mini-heading"></span><span class="theme-mini-cards"><i></i><i></i></span><span class="theme-mini-chart"></span></span></span><span class="theme-choice-title">${name}<span class="theme-check">${check}</span></span><span class="theme-choice-description">${description}</span></span></label>`).join('')}
      </div></fieldset>
      <fieldset class="theme-fieldset"><legend>Tema rengi <span>Her iki görünümle de uyumlu</span></legend><div class="theme-colors">
        ${palettes.map(([id, name, description]) => `<label class="theme-choice theme-color" data-palette="${id}"><input type="radio" name="theme-palette" value="${id}"><span class="theme-choice-body"><span class="theme-swatch" aria-hidden="true"><i></i><i></i><i></i></span><span class="theme-choice-title">${name}<span class="theme-check">${check}</span></span><span class="theme-choice-description">${description}</span></span></label>`).join('')}
      </div></fieldset>
      <div class="theme-footer"><div><p class="theme-current" role="status" aria-live="polite"></p><p class="theme-storage">Seçiminiz bu tarayıcıda hatırlanır.</p></div><button type="button" class="btn primary" data-theme-close>Tamam</button></div>`;
    document.body.append(dialog);
    let opener;
    function sync() {
      dialog.querySelectorAll('input[type="radio"]').forEach(input => {
        input.checked = input.value === preference[input.name === 'theme-mode' ? 'mode' : 'palette'];
      });
      dialog.querySelector('.theme-current').textContent = `${preference.mode === 'light' ? 'Açık' : 'Koyu'} görünüm · ${palettes.find(([id]) => id === preference.palette)[1]}`;
    }
    sync();
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-theme-open]');
      if (!button || dialog.open) return;
      opener = button;
      sync();
      dialog.showModal();
      root.classList.add('theme-modal-open');
    });
    dialog.addEventListener('change', event => {
      const input = event.target;
      if (!input.matches('input[name="theme-mode"], input[name="theme-palette"]')) return;
      preference = normalize({ ...preference, [input.name === 'theme-mode' ? 'mode' : 'palette']: input.value });
      apply();
      sync();
      try {
        localStorage.setItem(storageKey, JSON.stringify(preference));
        dialog.querySelector('.theme-storage').textContent = 'Seçiminiz bu tarayıcıda hatırlanır.';
      } catch {
        dialog.querySelector('.theme-storage').textContent = 'Tarayıcı kayda izin vermedi. Seçiminiz bu sayfada geçerli.';
      }
    });

    const outside = event => {
      const bounds = dialog.getBoundingClientRect();
      return event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
    };
    let backdropPressed = false;
    dialog.addEventListener('pointerdown', event => { backdropPressed = outside(event); });
    dialog.addEventListener('click', event => {
      if (event.target.closest('[data-theme-close]') || (backdropPressed && outside(event))) dialog.close();
      backdropPressed = false;
    });
    dialog.addEventListener('close', () => {
      root.classList.remove('theme-modal-open');
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button:not([disabled]), input:checked')];
      const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    window.addEventListener('storage', event => {
      if (event.key !== storageKey && event.key !== null) return;
      preference = readPreference();
      apply();
      sync();
    });
  });
})();
