(() => {
  const $ = (s) => document.querySelector(s);
  const typeFilter = $('#typeFilter');
  const mapPanel = $('.map-panel');
  const map = $('#map');
  const list = $('#incidentList');
  if (!mapPanel || !map) return;

  // Quick filter chips: progressive enhancement over the existing filters.
  const bar = document.createElement('div');
  bar.className = 'map-quick-filters';
  bar.setAttribute('aria-label', 'Filter cepat peta');
  const all = document.createElement('button');
  all.type = 'button'; all.className = 'quick-filter active'; all.textContent = 'Semua';
  bar.appendChild(all);
  const known = ['Banjir','Gempa Bumi','Tanah Longsor','Kebakaran Hutan Dan Lahan','Cuaca Ekstrim','Cuaca Ekstrem'];
  known.forEach((type) => {
    if (!typeFilter || ![...typeFilter.options].some(o => o.value === type || o.textContent === type)) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'quick-filter'; b.textContent = type.replace('Kebakaran Hutan Dan Lahan','Karhutla').replace('Tanah Longsor','Longsor').replace('Gempa Bumi','Gempa').replace('Cuaca Ekstrim','Cuaca');
    b.dataset.type = type;
    b.addEventListener('click', () => {
      typeFilter.value = [...typeFilter.options].find(o => o.value === type || o.textContent === type)?.value || '';
      typeFilter.dispatchEvent(new Event('change', { bubbles: true }));
      [...bar.children].forEach(x => x.classList.remove('active')); b.classList.add('active');
    });
    bar.appendChild(b);
  });
  all.addEventListener('click', () => { typeFilter.value = ''; typeFilter.dispatchEvent(new Event('change', { bubbles: true })); [...bar.children].forEach(x => x.classList.remove('active')); all.classList.add('active'); });
  mapPanel.appendChild(bar);

  // Fullscreen map control.
  const full = document.createElement('button');
  full.type = 'button'; full.className = 'map-action map-fullscreen'; full.innerHTML = '⛶ <span>Peta penuh</span>';
  full.title = 'Buka peta layar penuh';
  full.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await mapPanel.requestFullscreen();
      else await document.exitFullscreen();
    } catch { mapPanel.classList.toggle('map-focus-mode'); }
  });
  mapPanel.appendChild(full);
  document.addEventListener('fullscreenchange', () => {
    full.innerHTML = document.fullscreenElement === mapPanel ? '× <span>Tutup peta</span>' : '⛶ <span>Peta penuh</span>';
  });

  // Mobile: tapping an incident card makes the list behave like a bottom sheet.
  if (list) {
    list.addEventListener('click', (e) => {
      const card = e.target.closest('.incident-card');
      if (!card || window.innerWidth > 800) return;
      mapPanel.classList.remove('map-mobile-focus');
    });
  }
  const mapFocus = document.createElement('button');
  mapFocus.type = 'button'; mapFocus.className = 'map-action map-mobile-toggle'; mapFocus.textContent = '↟ Peta';
  mapFocus.addEventListener('click', () => {
    mapPanel.classList.toggle('map-mobile-focus');
    mapFocus.textContent = mapPanel.classList.contains('map-mobile-focus') ? '↓ Daftar' : '↟ Peta';
  });
  document.body.appendChild(mapFocus);

  // Keep quick-filter active state aligned with the native type selector.
  typeFilter?.addEventListener('change', () => {
    const value = typeFilter.value;
    [...bar.children].forEach(x => x.classList.toggle('active', x === all ? !value : x.dataset.type === value));
  });
})();
