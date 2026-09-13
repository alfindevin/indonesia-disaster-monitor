const state = {
  incidents: [],
  filtered: [],
  markers: new Map(),
  selectedId: null,
};

const map = L.map("map", { zoomControl: false }).setView([-2.5, 118], 5);
L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const els = {
  list: document.querySelector("#incidentList"),
  count: document.querySelector("#incidentCount"),
  updated: document.querySelector("#lastUpdated"),
  type: document.querySelector("#typeFilter"),
  province: document.querySelector("#provinceFilter"),
  search: document.querySelector("#searchInput"),
  refresh: document.querySelector("#refreshBtn"),
  dialog: document.querySelector("#detailDialog"),
  closeDialog: document.querySelector("#closeDialog"),
  detailSource: document.querySelector("#detailSource"),
  detailTitle: document.querySelector("#detailTitle"),
  detailMeta: document.querySelector("#detailMeta"),
  detailSummary: document.querySelector("#detailSummary"),
  detailLink: document.querySelector("#detailLink"),
};

function formatTime(value) {
  if (!value) return "Tidak tersedia";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function markerColor(item) {
  if (item.source === "BMKG") return item.severity === "high" ? "#b42318" : "#c45317";
  const colors = {
    "Banjir": "#0b7a75",
    "Kebakaran Hutan Dan Lahan": "#b54708",
    "Tanah Longsor": "#7a5c38",
    "Cuaca Ekstrim": "#175cd3",
    "Gempa Bumi": "#c45317",
  };
  return colors[item.type] || "#475467";
}

function markerIcon(item) {
  return L.divIcon({
    className: "incident-marker",
    html: `<span style="background:${markerColor(item)}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function setOptions(select, values, firstLabel) {
  const current = select.value;
  select.innerHTML = `<option value="">${firstLabel}</option>` + values.map((value) => `<option>${value}</option>`).join("");
  select.value = values.includes(current) ? current : "";
}

function renderFilters() {
  const types = [...new Set(state.incidents.map((item) => item.type).filter(Boolean))].sort();
  const provinces = [...new Set(state.incidents.map((item) => item.province || item.region).filter(Boolean))].sort();
  setOptions(els.type, types, "Semua jenis");
  setOptions(els.province, provinces, "Semua wilayah");
}

function applyFilters() {
  const q = els.search.value.trim().toLowerCase();
  state.filtered = state.incidents.filter((item) => {
    const province = item.province || item.region;
    const haystack = `${item.title} ${item.region} ${item.source} ${item.summary}`.toLowerCase();
    return (!els.type.value || item.type === els.type.value)
      && (!els.province.value || province === els.province.value)
      && (!q || haystack.includes(q));
  });
  render();
}

function renderMap() {
  for (const marker of state.markers.values()) marker.remove();
  state.markers.clear();

  const bounds = [];
  for (const item of state.filtered) {
    const marker = L.marker([item.lat, item.lon], { icon: markerIcon(item), title: item.title })
      .addTo(map)
      .bindPopup(`<strong>${item.title}</strong><br>${item.source}<br>${formatTime(item.occurredAt)}`)
      .on("click", () => selectIncident(item.id, true));
    state.markers.set(item.id, marker);
    bounds.push([item.lat, item.lon]);
  }
  if (bounds.length) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 7 });
}

function renderList() {
  els.count.textContent = state.filtered.length.toString();
  if (!state.filtered.length) {
    els.list.innerHTML = `<p class="muted">Tidak ada kejadian yang cocok dengan filter.</p>`;
    return;
  }
  els.list.innerHTML = state.filtered.map((item) => `
    <button class="incident-card ${item.id === state.selectedId ? "active" : ""}" data-id="${item.id}" type="button">
      <div class="card-meta">
        <span class="pill">${item.source}</span>
        <span class="pill">${item.type}</span>
        ${item.approximateLocation ? `<span class="pill">perkiraan</span>` : ""}
        <span class="pill ${item.severity}">${item.severity}</span>
      </div>
      <h3>${escapeHtml(item.title)}</h3>
      <small>${escapeHtml(item.region)} · ${formatTime(item.occurredAt)}</small>
    </button>
  `).join("");
}

function render() {
  renderMap();
  renderList();
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function selectIncident(id, openDetail = false) {
  const item = state.incidents.find((candidate) => candidate.id === id);
  if (!item) return;
  state.selectedId = id;
  const marker = state.markers.get(id);
  if (marker) {
    map.setView([item.lat, item.lon], Math.max(map.getZoom(), 7));
    marker.openPopup();
  }
  renderList();
  if (openDetail) showDetail(item);
}

function showDetail(item) {
  els.detailSource.textContent = `${item.source} · ${item.confidence}`;
  els.detailTitle.textContent = item.title;
  els.detailMeta.innerHTML = `
    <dt>Terjadi</dt><dd>${formatTime(item.occurredAt)}</dd>
    <dt>Diperbarui</dt><dd>${formatTime(item.updatedAt)}</dd>
    <dt>Wilayah</dt><dd>${escapeHtml(item.region)}</dd>
    <dt>Koordinat</dt><dd>${item.lat.toFixed(3)}, ${item.lon.toFixed(3)}</dd>
    <dt>Lokasi</dt><dd>${item.approximateLocation ? "Perkiraan wilayah administratif" : "Titik dari sumber"}</dd>
    <dt>Kesegaran</dt><dd>${escapeHtml(item.freshness)}</dd>
  `;
  els.detailSummary.textContent = item.summary || "Tidak ada ringkasan tambahan dari sumber.";
  els.detailLink.href = item.sourceUrl;
  els.dialog.showModal();
}

async function loadData() {
  els.updated.textContent = "Memuat...";
  const response = await fetch("/api/incidents");
  const payload = await response.json();
  state.incidents = payload.incidents || [];
  els.updated.textContent = formatTime(payload.generatedAt);
  renderFilters();
  applyFilters();
}

els.list.addEventListener("click", (event) => {
  const card = event.target.closest(".incident-card");
  if (card) selectIncident(card.dataset.id, true);
});

for (const input of [els.type, els.province, els.search]) {
  input.addEventListener("input", applyFilters);
}

els.refresh.addEventListener("click", loadData);
els.closeDialog.addEventListener("click", () => els.dialog.close());

loadData().catch((error) => {
  els.updated.textContent = "Gagal memuat";
  els.list.innerHTML = `<p class="muted">Data belum bisa dimuat: ${escapeHtml(error.message)}</p>`;
});
