(() => {
  const KEY = 'idm-sidebar-collapsed';

  function mount() {
    const shell = document.querySelector('.shell');
    const mapPanel = document.querySelector('.map-panel');
    const side = document.querySelector('.side-panel');
    if (!shell || !mapPanel || !side || document.querySelector('.sidebar-toggle')) return;

    const rail = document.createElement('div');
    rail.className = 'sidebar-rail';
    rail.setAttribute('aria-label', 'Kontrol panel samping');
    rail.innerHTML = `
      <button class="sidebar-toggle" type="button" aria-label="Sembunyikan panel" aria-expanded="true" title="Sembunyikan panel">‹</button>
      <button class="sidebar-open" type="button" aria-label="Tampilkan panel" aria-expanded="false" title="Tampilkan panel">›</button>
    `;
    mapPanel.appendChild(rail);

    const toggle = rail.querySelector('.sidebar-toggle');
    const open = rail.querySelector('.sidebar-open');

    const setCollapsed = (collapsed, save = true) => {
      shell.classList.toggle('sidebar-collapsed', collapsed);
      toggle.hidden = collapsed;
      open.hidden = !collapsed;
      toggle.setAttribute('aria-expanded', String(!collapsed));
      open.setAttribute('aria-expanded', String(collapsed));
      toggle.title = collapsed ? 'Tampilkan panel' : 'Sembunyikan panel';
      open.title = 'Tampilkan panel';
      toggle.setAttribute('aria-label', collapsed ? 'Tampilkan panel' : 'Sembunyikan panel');
      if (save) localStorage.setItem(KEY, collapsed ? '1' : '0');
      window.dispatchEvent(new Event('resize'));
      setTimeout(() => window.dispatchEvent(new Event('resize')), 220);
    };

    toggle.addEventListener('click', () => setCollapsed(true));
    open.addEventListener('click', () => setCollapsed(false));

    const saved = localStorage.getItem(KEY) === '1';
    setCollapsed(saved, false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
