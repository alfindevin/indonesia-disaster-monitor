(() => {
  const KEY = "idm-history-v1";
  const MAX_RECORDS = 1000;
  const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
  const list = document.querySelector("#persistentHistoryList");
  const label = document.querySelector("#persistentHistoryLabel");
  const limitEl = document.querySelector("#persistentHistoryLimit");
  const clearBtn = document.querySelector("#clearPersistentHistory");
  const message = document.querySelector("#persistentHistoryMessage");
  if (!list) return;

  function readHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function writeHistory(rows) {
    try { localStorage.setItem(KEY, JSON.stringify(rows)); return true; } catch { return false; }
  }

  function recordKey(i) {
    return String(i.id || `${i.source || "unknown"}:${i.title || ""}:${i.occurredAt || ""}`);
  }

  function merge(current) {
    const now = Date.now();
    const map = new Map(readHistory().map(row => [row.key, row]));
    for (const incident of Array.isArray(current) ? current : []) {
      const key = recordKey(incident);
      const previous = map.get(key);
      map.set(key, {
        ...(previous || {}),
        ...incident,
        key,
        firstSeenAt: previous?.firstSeenAt || new Date(now).toISOString(),
        lastSeenAt: new Date(now).toISOString()
      });
    }
    const rows = [...map.values()]
      .filter(row => {
        const t = new Date(row.occurredAt || row.updatedAt || row.lastSeenAt).getTime();
        return !Number.isFinite(t) || now - t <= RETENTION_MS;
      })
      .sort((a, b) => new Date(b.occurredAt || b.updatedAt || b.lastSeenAt).getTime() - new Date(a.occurredAt || a.updatedAt || a.lastSeenAt).getTime())
      .slice(0, MAX_RECORDS);
    writeHistory(rows);
    return rows;
  }

  function formatTime(value) {
    if (!value) return "Tidak tersedia";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(d);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));
  }

  function render(rows) {
    const limit = Number(limitEl?.value) || 25;
    const visible = rows.slice(0, limit);
    label.textContent = `${rows.length} kejadian tersimpan di perangkat ini`;
    if (!visible.length) {
      list.innerHTML = `<p class="muted">Belum ada riwayat lokal. Riwayat mulai terkumpul setelah data berhasil dimuat.</p>`;
      return;
    }
    list.innerHTML = visible.map(i => `<button class="persistent-history-item" data-history-key="${escapeHtml(i.key)}" type="button">
      <span class="persistent-history-dot ${escapeHtml(i.severity || "unknown")}"></span>
      <span><strong>${escapeHtml(i.title || "Kejadian bencana")}</strong><small>${escapeHtml(i.region || "Indonesia")} · ${formatTime(i.occurredAt || i.updatedAt)}</small><em>${escapeHtml(i.source || "Sumber tidak diketahui")} · ${escapeHtml(i.type || "Bencana")}</em></span>
    </button>`).join("");
  }

  async function refresh() {
    try {
      const response = await fetch(`/api/incidents?history=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const rows = merge(payload.incidents || payload.data || payload || []);
      render(rows);
      message.textContent = `Terakhir disinkronkan ${formatTime(new Date().toISOString())}. Tersimpan hanya di perangkat/browser ini.`;
    } catch (error) {
      const rows = readHistory();
      render(rows);
      message.textContent = `Gagal mengambil data baru. Menampilkan ${rows.length} riwayat lokal yang tersimpan.`;
    }
  }

  list.addEventListener("click", event => {
    const button = event.target.closest("[data-history-key]");
    if (!button) return;
    const row = readHistory().find(item => item.key === button.dataset.historyKey);
    if (!row) return;
    const dialog = document.querySelector("#detailDialog");
    if (dialog && typeof window.showPersistentHistoryDetail === "function") window.showPersistentHistoryDetail(row);
    else if (row.sourceUrl) window.open(row.sourceUrl, "_blank", "noopener,noreferrer");
  });

  window.showPersistentHistoryDetail = row => {
    const title = document.querySelector("#detailTitle");
    const source = document.querySelector("#detailSource");
    const badges = document.querySelector("#detailBadges");
    const meta = document.querySelector("#detailMeta");
    const metrics = document.querySelector("#detailMetrics");
    const summary = document.querySelector("#detailSummary");
    const link = document.querySelector("#detailLink");
    const dialog = document.querySelector("#detailDialog");
    if (!dialog || !title) return;
    source.textContent = `${row.source || "Sumber"} · riwayat lokal`;
    title.textContent = row.title || "Kejadian bencana";
    badges.innerHTML = `<span class="pill ${escapeHtml(row.severity || "unknown")}">${escapeHtml(row.severity || "unknown")}</span>${row.approximateLocation ? `<span class="pill">Lokasi perkiraan</span>` : `<span class="pill">Koordinat sumber</span>`}`;
    const lat = Number(row.lat), lon = Number(row.lon);
    meta.innerHTML = `<dt>Terjadi</dt><dd>${formatTime(row.occurredAt)}</dd><dt>Diperbarui</dt><dd>${formatTime(row.updatedAt)}</dd><dt>Wilayah</dt><dd>${escapeHtml(row.region || "Tidak tersedia")}</dd><dt>Provinsi</dt><dd>${escapeHtml(row.province || "Tidak tersedia")}</dd><dt>Koordinat</dt><dd>${Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : "Tidak tersedia"}</dd><dt>Pertama terlihat</dt><dd>${formatTime(row.firstSeenAt)}</dd><dt>Terakhir terlihat</dt><dd>${formatTime(row.lastSeenAt)}</dd>`;
    const entries = Object.entries(row.metrics || {}).filter(([, value]) => value !== null && value !== undefined && value !== "");
    metrics.innerHTML = entries.length ? entries.map(([key, value]) => `<div><span>${escapeHtml(key)}</span><b>${escapeHtml(value)}</b></div>`).join("") : `<p class="muted">Tidak ada data dampak/parameter tambahan.</p>`;
    summary.textContent = row.summary || "Tidak ada ringkasan tambahan dari sumber.";
    link.href = row.sourceUrl || "#";
    dialog.showModal();
  };

  limitEl?.addEventListener("change", () => render(readHistory()));
  clearBtn?.addEventListener("click", () => {
    if (!confirm("Hapus seluruh riwayat lokal pada perangkat ini?")) return;
    localStorage.removeItem(KEY);
    render([]);
    message.textContent = "Riwayat lokal dihapus dari browser ini.";
  });

  refresh();
  setInterval(refresh, 5 * 60 * 1000);
})();
