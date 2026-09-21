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
})();
