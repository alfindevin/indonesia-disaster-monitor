/* Phase 4 — Incident sharing, deep links, and resilient emergency access */
(() => {
  const qs = new URLSearchParams(location.search);
  const incidentId = qs.get('incident');
  const side = document.querySelector('.side-panel');
  if (!side) return;

  const box = document.createElement('section');
  box.className = 'phase4-box';
  box.innerHTML = `
    <div class="section-heading"><div><strong>🧭 Akses Cepat</strong><small>Bagikan kejadian atau buka sumber resmi</small></div></div>
    <div class="phase4-actions">
      <button type="button" id="phase4Share">Bagikan kejadian</button>
      <a href="https://www.bmkg.go.id/" target="_blank" rel="noreferrer">BMKG ↗</a>
      <a href="https://www.bnpb.go.id/" target="_blank" rel="noreferrer">BNPB ↗</a>
    </div>
    <p id="phase4Message" class="muted">Pilih kejadian dari daftar untuk membuat tautan langsung.</p>`;
  document.querySelector('.source-note')?.before(box);

  const msg = box.querySelector('#phase4Message');
  const shareBtn = box.querySelector('#phase4Share');
  let selected = null;

  function setSelected(i) {
    selected = i;
    shareBtn.disabled = !i;
    if (i) msg.textContent = `Tautan siap untuk: ${i.title}`;
  }

  window.IDMPhase4 = { setSelected };

  async function share() {
    if (!selected) return;
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('incident', selected.id);
    const data = { title: selected.title || 'Indonesia Disaster Monitor', text: `${selected.title} — ${selected.region || 'Indonesia'}`, url: url.toString() };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(url.toString()); msg.textContent = 'Tautan kejadian tersalin ✓'; }
    } catch (e) {
      if (e?.name !== 'AbortError') msg.textContent = 'Tautan tidak dapat dibagikan dari browser ini.';
    }
  }
  shareBtn.addEventListener('click', share);

  function openDeepLink() {
    if (!incidentId || !window.state?.incidents?.length) return;
    const item = window.state.incidents.find(i => String(i.id) === String(incidentId));
    if (item && typeof window.selectIncident === 'function') setTimeout(() => window.selectIncident(item.id, true), 250);
  }
  window.addEventListener('idm:data-ready', openDeepLink);
})();
