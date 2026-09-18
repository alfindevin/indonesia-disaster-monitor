(() => {
  const parseCards = () => [...document.querySelectorAll('.incident-card')].map(card => ({
    type: card.querySelectorAll('.pill')[1]?.textContent?.trim() || 'Lainnya',
    severity: card.querySelector('.pill.high, .pill.medium, .pill.low, .pill.unknown')?.textContent?.trim().toLowerCase() || 'unknown',
    region: card.querySelector('small')?.textContent?.split(' · ')[0]?.trim() || ''
  }));

  const mount = () => {
    const mapPanel = document.querySelector('.map-panel');
    if (!mapPanel || document.querySelector('.dashboard-kpis')) return;
    const wrap = document.createElement('section');
    wrap.className = 'dashboard-kpis';
    wrap.setAttribute('aria-label', 'Ringkasan kondisi saat ini');
    wrap.innerHTML = `
      <article class="kpi-card kpi-primary"><span class="kpi-icon">●</span><div><strong id="kpiActive">0</strong><small>Kejadian terpantau</small></div></article>
      <article class="kpi-card"><span class="kpi-icon">!</span><div><strong id="kpiHigh">0</strong><small>Level high</small></div></article>
      <article class="kpi-card"><span class="kpi-icon">◈</span><div><strong id="kpiTypes">0</strong><small>Jenis bencana</small></div></article>
      <article class="kpi-card"><span class="kpi-icon">⌖</span><div><strong id="kpiRegions">0</strong><small>Wilayah terpantau</small></div></article>`;
    mapPanel.appendChild(wrap);
  };

  const update = () => {
    mount();
    const cards = parseCards();
    const active = document.querySelector('#incidentCount')?.textContent?.trim();
    const high = cards.filter(x => x.severity === 'high').length;
    const types = new Set(cards.map(x => x.type).filter(Boolean)).size;
    const regions = new Set(cards.map(x => x.region).filter(Boolean)).size;
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    set('kpiActive', active && active !== '0' ? active : cards.length);
    set('kpiHigh', high);
    set('kpiTypes', types);
    set('kpiRegions', regions);
  };

  const boot = () => {
    update();
    const target = document.querySelector('#incidentList');
    if (target) new MutationObserver(update).observe(target, { childList: true, subtree: true });
    ['#typeFilter','#provinceFilter','#severityFilter','#searchInput'].forEach(sel => document.querySelector(sel)?.addEventListener('change', update));
    document.querySelector('#searchInput')?.addEventListener('input', update);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
