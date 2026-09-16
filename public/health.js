(() => {
  const grid = document.querySelector('#healthGrid');
  const updated = document.querySelector('#healthUpdated');
  const refresh = document.querySelector('#healthRefresh');
  if (!grid) return;

  const SOURCES = [
    ['bmkgLatest', 'BMKG · Gempa terbaru', 'BMKG'],
    ['bmkgM5', 'BMKG · Gempa M5+', 'BMKG'],
    ['bmkgFelt', 'BMKG · Gempa dirasakan', 'BMKG'],
    ['bnpbDashboard', 'BNPB · GIS Dashboard', 'BNPB'],
    ['bnpbTable', 'BNPB · Tabel kejadian', 'BNPB']
  ];

  function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
  function statusFor(name, payload) {
    const error = (payload.errors || []).find(e => e.source === name);
    if (error) return { cls: 'offline', label: 'Offline', detail: error.message || 'Gagal mengambil data.' };
    const rows = (payload.incidents || []).filter(i => i.source === (name.startsWith('bmkg') ? 'BMKG' : 'BNPB'));
    if (!rows.length) return { cls: 'degraded', label: 'Perlu cek', detail: 'Tidak ada kejadian dari sumber ini pada respons terakhir.' };
    return { cls: 'online', label: 'Terhubung', detail: `${rows.length} kejadian terwakili pada respons terakhir.` };
  }
  function render(payload, elapsed) {
    grid.innerHTML = SOURCES.map(([name, title, provider]) => {
      const s = statusFor(name, payload);
      return `<article class="health-card"><div class="health-card-head"><strong>${esc(title)}</strong><span class="health-status ${s.cls}">${s.label}</span></div><small>${esc(provider)} · respons API ${elapsed} ms</small><p>${esc(s.detail)}</p></article>`;
    }).join('');
    updated.textContent = `Pemeriksaan ${new Date().toLocaleTimeString('id-ID')}`;
  }
  async function check() {
    refresh.disabled = true;
    updated.textContent = 'Memeriksa...';
    const started = performance.now();
    try {
      const r = await fetch(`/api/incidents?health=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      render(await r.json(), Math.round(performance.now() - started));
    } catch (e) {
      grid.innerHTML = `<article class="health-card"><div class="health-card-head"><strong>API pemantauan</strong><span class="health-status offline">Offline</span></div><p>${esc(e.message)}</p></article>`;
      updated.textContent = 'Pemeriksaan gagal';
    } finally { refresh.disabled = false; }
  }
  refresh?.addEventListener('click', check);
  check();
  setInterval(check, 5 * 60 * 1000);
})();
