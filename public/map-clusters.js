(() => {
  if (!window.L || window.__idmClusterInstalled) return;
  window.__idmClusterInstalled = true;
  const OriginalMap = L.map;
  const OriginalMarker = L.marker;
  const clusterIcon = count => L.divIcon({ className: 'idm-cluster-marker', html: `<span>${count > 99 ? '99+' : count}</span>`, iconSize: [42, 42], iconAnchor: [21, 21] });
  function createManager(map) {
    const manager = {
      map, markers: new Set(), clusterLayers: new Set(), gridSize: 70, adding: false,
      add(marker) { this.markers.add(marker); this.refresh(); },
      remove(marker) { this.markers.delete(marker); try { marker.__idmOriginalRemove.call(marker); } catch {} this.refresh(); },
      refresh() {
        if (this.adding) return;
        this.adding = true;
        requestAnimationFrame(() => {
          this.adding = false;
          const map = this.map;
          this.clusterLayers.forEach(layer => { try { layer.remove(); } catch {} });
          this.clusterLayers.clear();
          const buckets = new Map();
          this.markers.forEach(marker => {
            const p = map.latLngToLayerPoint(marker.getLatLng());
            const key = `${Math.floor(p.x / this.gridSize)}:${Math.floor(p.y / this.gridSize)}`;
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(marker);
          });
          buckets.forEach(items => {
            if (items.length === 1) {
              const marker = items[0]; marker.__idmVisible = true;
              if (!map.hasLayer(marker)) marker.__idmOriginalAddTo.call(marker, map);
              return;
            }
            items.forEach(marker => { marker.__idmVisible = false; if (map.hasLayer(marker)) marker.__idmOriginalRemove.call(marker); });
            const bounds = L.latLngBounds(items.map(m => m.getLatLng()));
            const cluster = OriginalMarker(bounds.getCenter(), { icon: clusterIcon(items.length), keyboard: false, zIndexOffset: 900 });
            cluster.on('click', () => map.fitBounds(bounds, { padding: [40, 40], maxZoom: Math.min(map.getMaxZoom(), map.getZoom() + 2) }));
            cluster.addTo(map); this.clusterLayers.add(cluster);
          });
        });
      },
      reveal(marker) {
        if (!this.markers.has(marker)) return;
        marker.__idmVisible = true; this.refresh();
        setTimeout(() => { if (!map.hasLayer(marker)) marker.__idmOriginalAddTo.call(marker, map); marker.__idmOriginalOpenPopup.call(marker); }, 120);
      }
    };
    map.on('zoomend moveend', () => manager.refresh());
    return manager;
  }
  L.map = function(...args) { const map = OriginalMap.apply(this, args); window.__idmClusterManager = createManager(map); return map; };
  L.marker = function(...args) {
    const marker = OriginalMarker.apply(this, args), originalAddTo = marker.addTo, originalRemove = marker.remove, originalOpenPopup = marker.openPopup;
    marker.__idmOriginalAddTo = originalAddTo; marker.__idmOriginalRemove = originalRemove; marker.__idmOriginalOpenPopup = originalOpenPopup;
    marker.addTo = function(map) { if (window.__idmClusterManager && map === window.__idmClusterManager.map) { window.__idmClusterManager.add(this); return this; } return originalAddTo.call(this, map); };
    marker.remove = function() { if (window.__idmClusterManager?.markers.has(this)) { window.__idmClusterManager.remove(this); return this; } return originalRemove.call(this); };
    marker.openPopup = function(...popupArgs) { if (window.__idmClusterManager?.markers.has(this) && !this.__idmVisible) { window.__idmClusterManager.reveal(this); return this; } return originalOpenPopup.apply(this, popupArgs); };
    return marker;
  };
  const KEY='idm-time-window';
  const WINDOWS={live:0,h1:1,h6:6,h24:24,d7:168};
  const selected=localStorage.getItem(KEY)||'live';
  const originalFetch=window.fetch;
  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:input?.url||'';
    const response=await originalFetch.apply(this,arguments);
    if(!url.includes('/api/incidents')) return response;
    const hours=WINDOWS[localStorage.getItem(KEY)||'live']||0;
    if(!hours) return response;
    try{
      const data=await response.clone().json(), now=Date.now(), cut=now-hours*3600000;
      if(Array.isArray(data.incidents)) data.incidents=data.incidents.filter(i=>{const t=new Date(i.occurredAt||i.updatedAt||0).getTime();return Number.isFinite(t)&&t>=cut&&t<=now+3600000});
      return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers:new Headers(response.headers)});
    }catch{return response}
  };
  function installTimeFilter(){
    if(document.querySelector('.idm-time-filter')) return;
    const filters=document.querySelector('.filters'); if(!filters) return;
    const box=document.createElement('section'); box.className='idm-time-filter';
    box.innerHTML='<div class="idm-time-title"><strong>Periode</strong><small>Filter kejadian berdasarkan waktu</small></div><div class="idm-time-buttons"><button data-window="live">LIVE</button><button data-window="h1">1 JAM</button><button data-window="h6">6 JAM</button><button data-window="h24">24 JAM</button><button data-window="d7">7 HARI</button></div><small class="idm-time-status"></small>';
    filters.parentNode.insertBefore(box,filters);
    const status=box.querySelector('.idm-time-status');
    function paint(){const current=localStorage.getItem(KEY)||'live';box.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.window===current));const h=WINDOWS[current];status.textContent=h?`Menampilkan kejadian ${h<24?h+' jam':'7 hari'} terakhir`:'Menampilkan semua kejadian yang tersedia'}
    paint();
    box.addEventListener('click',e=>{const b=e.target.closest('button[data-window]');if(!b)return;localStorage.setItem(KEY,b.dataset.window);location.reload()});
    const style=document.createElement('style'); style.textContent='.idm-time-filter{margin:0 0 12px;padding:10px 12px;border:1px solid #eaecf0;border-radius:12px;background:#fff}.idm-time-title{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}.idm-time-title strong{font-size:12px;color:#101828}.idm-time-title small,.idm-time-status{font-size:10px;color:#667085}.idm-time-buttons{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}.idm-time-buttons button{border:1px solid #d0d5dd;background:#fff;border-radius:7px;padding:7px 4px;font-size:10px;font-weight:800;color:#475467;cursor:pointer}.idm-time-buttons button.active{background:#175cd3;border-color:#175cd3;color:#fff}.idm-time-status{display:block;margin-top:7px}@media(max-width:700px){.idm-time-buttons{grid-template-columns:repeat(3,1fr)}}';document.head.appendChild(style);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',installTimeFilter); else installTimeFilter();
})();
