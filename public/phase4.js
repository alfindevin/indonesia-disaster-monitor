/* Phase 4 — Incident sharing, deep links, and resilient emergency access */
(() => {
  const qs = new URLSearchParams(location.search);
  const incidentId = qs.get('incident');
  const side = document.querySelector('.side-panel');
  if (!side) return;
  const box = document.createElement('section');
  box.className = 'phase4-box';
  box.innerHTML = `<div class="section-heading"><div><strong>🧭 Akses Cepat</strong><small>Bagikan kejadian atau buka sumber resmi</small></div></div><div class="phase4-actions"><button type="button" id="phase4Share" disabled>Bagikan kejadian</button><a href="https://www.bmkg.go.id/" target="_blank" rel="noreferrer">BMKG ↗</a><a href="https://www.bnpb.go.id/" target="_blank" rel="noreferrer">BNPB ↗</a></div><p id="phase4Message" class="muted">Pilih kejadian dari daftar untuk membuat tautan langsung.</p>`;
  document.querySelector('.source-note')?.before(box);
  const msg=box.querySelector('#phase4Message'), shareBtn=box.querySelector('#phase4Share'); let selected=null;
  function readCard(card){return card?{id:card.dataset.id,title:card.querySelector('h3')?.textContent?.trim()||'Kejadian bencana',region:card.querySelector('small')?.textContent?.split('·')[0]?.trim()||'Indonesia'}:null}
  function selectCard(card){selected=readCard(card);shareBtn.disabled=!selected;if(selected)msg.textContent=`Tautan siap untuk: ${selected.title}`}
  document.addEventListener('click',e=>{const card=e.target.closest('.incident-card');if(card)selectCard(card)});
  async function share(){if(!selected)return;const url=new URL(location.href);url.search='';url.searchParams.set('incident',selected.id);const data={title:selected.title,text:`${selected.title} — ${selected.region}`,url:url.toString()};try{if(navigator.share)await navigator.share(data);else{await navigator.clipboard.writeText(url.toString());msg.textContent='Tautan kejadian tersalin ✓'}}catch(e){if(e?.name!=='AbortError')msg.textContent='Tautan tidak dapat dibagikan dari browser ini.'}}
  shareBtn.addEventListener('click',share);
  function openDeepLink(){if(!incidentId)return;const card=document.querySelector(`.incident-card[data-id="${CSS.escape(incidentId)}"]`);if(card){selectCard(card);card.click();card.scrollIntoView({behavior:'smooth',block:'center'});msg.textContent='Kejadian dari tautan langsung dibuka.'}}
  const observer=new MutationObserver(openDeepLink);observer.observe(document.body,{childList:true,subtree:true});setTimeout(openDeepLink,1200);
})();

/* Coordinate repair: normalize alternate coordinate shapes and force one fresh render. */
(() => {
  const originalFetch = window.fetch.bind(window);
  const finite = v => Number.isFinite(Number(v)) ? Number(v) : null;
  const pair = (lat, lon) => {
    lat = finite(lat); lon = finite(lon);
    return lat !== null && lon !== null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? {lat, lon} : null;
  };
  const geoPair = v => Array.isArray(v) && v.length >= 2 ? pair(v[1], v[0]) : null;
  const textPair = v => {
    if (typeof v !== 'string') return null;
    const m = v.trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    return m ? pair(m[1], m[2]) : null;
  };
  function normalize(i) {
    if (!i || typeof i !== 'object') return i;
    if (pair(i.lat, i.lon)) return i;
    let p = pair(i.latitude, i.longitude) || pair(i.Latitude, i.Longitude) || textPair(i.Coordinates);
    if (!p && Array.isArray(i.coordinates)) p = geoPair(i.coordinates);
    if (!p && i.geometry) p = geoPair(i.geometry.coordinates);
    if (!p && i.location) p = geoPair(i.location.coordinates) || pair(i.location.lat, i.location.lon) || pair(i.location.latitude, i.location.longitude);
    if (!p && i.point) p = geoPair(i.point.coordinates) || pair(i.point.lat, i.point.lon);
    if (!p && i.geojson?.geometry) p = geoPair(i.geojson.geometry.coordinates);
    return p ? {...i, lat:p.lat, lon:p.lon} : i;
  }
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (!url.includes('/api/incidents')) return response;
      const payload = await response.clone().json();
      if (Array.isArray(payload.incidents)) payload.incidents = payload.incidents.map(normalize);
      return new Response(JSON.stringify(payload), {status:response.status, statusText:response.statusText, headers:new Headers(response.headers)});
    } catch { return response; }
  };
  setTimeout(() => document.querySelector('#refreshBtn')?.click(), 900);
})();
