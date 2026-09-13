const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 5173);
const PUBLIC_DIR = path.join(__dirname, "public");
const CACHE_FILE = path.join(__dirname, "work", "cache.json");
const CACHE_TTL_MS = 5 * 60 * 1000;

const SOURCES = {
  bmkgLatest:
    "https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json",
  bmkgM5:
    "https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json",
  bmkgFelt:
    "https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json",
  bnpbDashboard:
    "https://gis.bnpb.go.id/server/rest/services/Hosted/Data_Bencana_Dashboard/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson&orderByFields=objectid%20desc&resultRecordCount=200",
  bnpbTable:
    "https://gis.bnpb.go.id/databencana/tabel/pencarian.php",
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body, null, 2));
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "IndonesiaDisasterMVP/0.1" },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "IndonesiaDisasterMVP/0.1" },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseCoordinates(value) {
  if (!value || typeof value !== "string") return null;
  const [lat, lon] = value.split(",").map((part) => Number(part.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function bmkgId(item, suffix) {
  const stamp = (item.DateTime || `${item.Tanggal}-${item.Jam}`).replace(/\W/g, "");
  return `bmkg-${suffix}-${stamp}-${item.Magnitude || "na"}`;
}

function normalizeBmkg(item, feedType) {
  const coords = parseCoordinates(item.Coordinates);
  if (!coords) return null;
  const isFelt = Boolean(item.Dirasakan);
  return {
    id: bmkgId(item, feedType),
    sourceId: bmkgId(item, "event"),
    source: "BMKG",
    sourceUrl: "https://data.bmkg.go.id/gempabumi/",
    confidence: "official-feed",
    freshness: feedType === "latest" ? "event-driven" : "latest-list",
    type: "Gempa Bumi",
    title: `Gempa M${item.Magnitude} - ${item.Wilayah}`,
    region: item.Wilayah || "Indonesia",
    province: inferProvince(item.Wilayah),
    occurredAt: item.DateTime || null,
    updatedAt: new Date().toISOString(),
    lat: coords.lat,
    lon: coords.lon,
    severity: Number(item.Magnitude) >= 6 ? "high" : Number(item.Magnitude) >= 5 ? "medium" : "low",
    metrics: {
      magnitude: Number(item.Magnitude),
      depth: item.Kedalaman,
      tsunamiPotential: item.Potensi || null,
      felt: isFelt ? item.Dirasakan : null,
      shakemap: item.Shakemap
        ? `https://static.bmkg.go.id/${item.Shakemap}`
        : null,
    },
    summary: [
      item.Kedalaman ? `Kedalaman ${item.Kedalaman}` : null,
      item.Potensi || null,
      isFelt ? `Dirasakan: ${item.Dirasakan}` : null,
    ]
      .filter(Boolean)
      .join(". "),
  };
}

function normalizeBnpb(feature) {
  const p = feature.properties || {};
  const coords = feature.geometry && feature.geometry.coordinates;
  const lon = Array.isArray(coords) ? Number(coords[0]) : null;
  const lat = Array.isArray(coords) ? Number(coords[1]) : null;
  const type = normalizeDisasterType(pick(p, ["kejadian", "jenis_bencana", "bencana", "jenis"]));
  const occurredAt = pick(p, ["tanggal", "tgl_kejadian", "tanggal_kejadian", "date"]);
  const province = pick(p, ["provinsi", "province", "nama_provinsi"]);
  const city = pick(p, ["kabupaten", "kab_kota", "kabupaten_kota", "kota"]);
  const objectId = pick(p, ["objectid", "OBJECTID", "id"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    id: `bnpb-${objectId || `${lat}-${lon}-${occurredAt || ""}`}`,
    sourceId: `bnpb-${objectId || `${lat}-${lon}`}`,
    source: "BNPB",
    sourceUrl: "https://gis.bnpb.go.id/databencana/",
    confidence: "official-gis",
    freshness: "reported-event",
    type,
    title: `${type} - ${city || province || "Indonesia"}`,
    region: [city, province].filter(Boolean).join(", ") || "Indonesia",
    province: province || inferProvince(`${city || ""} ${type || ""}`),
    occurredAt: normalizeDate(occurredAt),
    updatedAt: new Date().toISOString(),
    lat,
    lon,
    severity: "unknown",
    metrics: {
      deaths: pick(p, ["meninggal", "md"]),
      missing: pick(p, ["hilang"]),
      injured: pick(p, ["terluka", "luka"]),
      damagedHouses: pick(p, ["rumah_rusak", "rumah rusak"]),
    },
    summary: pick(p, ["lokasi", "kronologi", "penyebab", "description"]) || "Laporan kejadian dari layanan GIS BNPB.",
  };
}

function normalizeBnpbTable(row, index) {
  const province = row.province || inferProvince(row.region);
  const point = getApproximatePoint(province, row.city);
  if (!point) return null;
  const type = normalizeDisasterType(row.type);
  const occurredAt = normalizeDate(row.date);
  return {
    id: `bnpb-table-${row.identity || `${row.city}-${row.province}-${row.date}-${index}`}`.replace(/\s+/g, "-").toLowerCase(),
    sourceId: `bnpb-table-${row.identity || `${row.city}-${row.province}-${row.date}-${row.type}`}`.replace(/\s+/g, "-").toLowerCase(),
    source: "BNPB",
    sourceUrl: "https://gis.bnpb.go.id/databencana/tabel/pencarian.php",
    confidence: "official-table",
    freshness: "reported-event",
    type,
    title: `${type} - ${row.city || province || "Indonesia"}`,
    region: [row.city, province].filter(Boolean).join(", ") || "Indonesia",
    province,
    occurredAt,
    updatedAt: new Date().toISOString(),
    lat: point.lat,
    lon: point.lon,
    approximateLocation: true,
    severity: classifyImpact(row),
    metrics: {
      deaths: numberOrNull(row.deaths),
      missing: numberOrNull(row.missing),
      injured: numberOrNull(row.injured),
      damagedHouses: numberOrNull(row.damagedHouses),
      floodedHouses: numberOrNull(row.floodedHouses),
      damagedFacilities: numberOrNull(row.damagedFacilities),
    },
    summary: [row.location, row.cause ? `Penyebab: ${row.cause}` : null]
      .filter(Boolean)
      .join(". ") || "Laporan kejadian dari tabel BNPB. Titik peta memakai perkiraan wilayah administratif.",
  };
}

function parseBnpbTable(html) {
  const rowMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  return rowMatches
    .map((match) => [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cleanHtml(cell[1])))
    .filter((cells) => cells.length >= 14 && /^\d+$/.test(cells[0]))
    .map((cells) => ({
      identity: cells[1],
      districtId: cells[2],
      date: cells[3],
      type: cells[4],
      location: cells[5],
      city: cells[6],
      province: cells[7],
      cause: cells[9],
      deaths: cells[10],
      missing: cells[11],
      injured: cells[12],
      damagedHouses: cells[13],
      floodedHouses: cells[14],
      damagedFacilities: cells[15],
    }));
}

function cleanHtml(value) {
  return String(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function numberOrNull(value) {
  const number = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function classifyImpact(row) {
  const deaths = numberOrNull(row.deaths) || 0;
  const missing = numberOrNull(row.missing) || 0;
  const injured = numberOrNull(row.injured) || 0;
  if (deaths + missing > 0) return "high";
  if (injured > 0) return "medium";
  return "unknown";
}

function pick(obj, keys) {
  for (const key of keys) {
    const found = Object.keys(obj).find((k) => k.toLowerCase() === key.toLowerCase());
    if (found && obj[found] !== null && obj[found] !== "") return obj[found];
  }
  return null;
}

function titleCase(value) {
  return String(value)
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeDisasterType(value) {
  const label = titleCase(value || "Kejadian Bencana");
  const compact = label.replace(/\s+/g, "").toLowerCase();
  const aliases = {
    gempabumi: "Gempa Bumi",
    kebakaranhutandanlahan: "Kebakaran Hutan Dan Lahan",
    cuacaekstrim: "Cuaca Ekstrem",
    cuacaekstrem: "Cuaca Ekstrem",
    erupsigunungapi: "Erupsi Gunung Api",
    tanahlongsor: "Tanah Longsor",
  };
  return aliases[compact] || label;
}

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value).toISOString();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? String(value) : new Date(parsed).toISOString();
}

function inferProvince(text = "") {
  const normalized = text.toUpperCase();
  const provinces = [
    "Aceh", "Sumatera Utara", "Sumatera Barat", "Riau", "Jambi", "Sumatera Selatan",
    "Bengkulu", "Lampung", "DKI Jakarta", "Jawa Barat", "Jawa Tengah", "DI Yogyakarta",
    "Jawa Timur", "Bali", "Nusa Tenggara Barat", "Nusa Tenggara Timur", "Kalimantan Barat",
    "Kalimantan Tengah", "Kalimantan Selatan", "Kalimantan Timur", "Kalimantan Utara",
    "Sulawesi Utara", "Sulawesi Tengah", "Sulawesi Selatan", "Sulawesi Tenggara",
    "Gorontalo", "Sulawesi Barat", "Maluku", "Maluku Utara", "Papua"
  ];
  return provinces.find((p) => normalized.includes(p.toUpperCase())) || null;
}

const PROVINCE_POINTS = {
  "Aceh": { lat: 4.6951, lon: 96.7494 },
  "Sumatera Utara": { lat: 2.1154, lon: 99.5451 },
  "Sumatera Barat": { lat: -0.7399, lon: 100.8000 },
  "Riau": { lat: 0.2933, lon: 101.7068 },
  "Kepulauan Riau": { lat: 3.9457, lon: 108.1429 },
  "Jambi": { lat: -1.4852, lon: 102.4381 },
  "Sumatera Selatan": { lat: -3.3194, lon: 103.9144 },
  "Bengkulu": { lat: -3.5778, lon: 102.3464 },
  "Lampung": { lat: -4.5586, lon: 105.4068 },
  "Bangka Belitung": { lat: -2.7411, lon: 106.4406 },
  "Banten": { lat: -6.4058, lon: 106.0640 },
  "DKI Jakarta": { lat: -6.2088, lon: 106.8456 },
  "Jawa Barat": { lat: -6.9175, lon: 107.6191 },
  "Jawa Tengah": { lat: -7.1500, lon: 110.1403 },
  "DI Yogyakarta": { lat: -7.8754, lon: 110.4262 },
  "Jawa Timur": { lat: -7.5361, lon: 112.2384 },
  "Bali": { lat: -8.4095, lon: 115.1889 },
  "Nusa Tenggara Barat": { lat: -8.6529, lon: 117.3616 },
  "Nusa Tenggara Timur": { lat: -8.6574, lon: 121.0794 },
  "Kalimantan Barat": { lat: -0.2788, lon: 111.4753 },
  "Kalimantan Tengah": { lat: -1.6815, lon: 113.3824 },
  "Kalimantan Selatan": { lat: -3.0926, lon: 115.2838 },
  "Kalimantan Timur": { lat: 0.5387, lon: 116.4194 },
  "Kalimantan Utara": { lat: 3.0731, lon: 116.0414 },
  "Sulawesi Utara": { lat: 0.6247, lon: 123.9750 },
  "Sulawesi Tengah": { lat: -1.4300, lon: 121.4456 },
  "Sulawesi Selatan": { lat: -3.6688, lon: 119.9741 },
  "Sulawesi Tenggara": { lat: -4.1449, lon: 122.1746 },
  "Gorontalo": { lat: 0.6999, lon: 122.4467 },
  "Sulawesi Barat": { lat: -2.8441, lon: 119.2321 },
  "Maluku": { lat: -3.2385, lon: 130.1453 },
  "Maluku Utara": { lat: 1.5709, lon: 127.8088 },
  "Papua": { lat: -4.2699, lon: 138.0804 },
  "Papua Barat": { lat: -1.3361, lon: 133.1747 },
  "Papua Barat Daya": { lat: -0.8667, lon: 131.2500 },
  "Papua Tengah": { lat: -3.7396, lon: 136.8426 },
  "Papua Pegunungan": { lat: -4.0000, lon: 139.5000 },
  "Papua Selatan": { lat: -6.5000, lon: 139.5000 },
};

function getApproximatePoint(province, city) {
  if (province && PROVINCE_POINTS[province]) return jitterPoint(PROVINCE_POINTS[province], city || province);
  return null;
}

function jitterPoint(point, seed = "") {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  const latOffset = ((hash % 19) - 9) / 60;
  const lonOffset = (((hash >> 3) % 19) - 9) / 60;
  return { lat: point.lat + latOffset, lon: point.lon + lonOffset };
}

function dedupeIncidents(items) {
  const map = new Map();
  for (const item of items.filter(Boolean)) {
    const key = item.sourceId || item.id;
    const previous = map.get(key);
    if (!previous || String(item.summary || "").length > String(previous.summary || "").length) {
      map.set(key, item);
    }
  }
  return [...map.values()].sort((a, b) => new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0));
}

async function readCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function writeCache(data) {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2));
}

async function loadIncidents() {
  const cached = await readCache();
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return { ...cached, cache: "hit" };

  const errors = [];
  const sourceEntries = Object.entries(SOURCES);
  const results = await Promise.allSettled(sourceEntries.map(async ([name, url]) => {
    const body = name === "bnpbTable" ? await fetchText(url) : await fetchJson(url);
    return [name, body];
  }));
  const data = {};
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      data[result.value[0]] = result.value[1];
    } else {
      errors.push({ source: sourceEntries[index][0], message: result.reason.message });
    }
  });

  const bnpbTableRows = typeof data.bnpbTable === "string" ? parseBnpbTable(data.bnpbTable) : [];

  const incidents = dedupeIncidents([
    normalizeBmkg(data.bmkgLatest?.Infogempa?.gempa || {}, "latest"),
    ...(data.bmkgM5?.Infogempa?.gempa || []).map((item) => normalizeBmkg(item, "m5")),
    ...(data.bmkgFelt?.Infogempa?.gempa || []).map((item) => normalizeBmkg(item, "felt")),
    ...(data.bnpbDashboard?.features || []).map(normalizeBnpb),
    ...bnpbTableRows.map(normalizeBnpbTable),
  ]);

  const payload = {
    cachedAt: Date.now(),
    generatedAt: new Date().toISOString(),
    cacheTtlSeconds: CACHE_TTL_MS / 1000,
    incidents,
    errors,
    sources: [
      {
        name: "BMKG Data Gempabumi Terbuka",
        url: "https://data.bmkg.go.id/gempabumi/",
        updateMode: "Diperbarui setiap ada peristiwa gempa; batas akses 60 permintaan/menit/IP.",
        realtimeClaim: "event-driven, bukan jaminan detik-per-detik",
      },
      {
        name: "BNPB Data Bencana / GIS",
        url: "https://gis.bnpb.go.id/databencana/",
        updateMode: "Data kejadian terlapor dari layanan GIS BNPB.",
        realtimeClaim: "near real-time/terlapor sesuai pembaruan sumber",
      },
      {
        name: "PVMBG MAGMA Indonesia",
        url: "https://magma.esdm.go.id/",
        updateMode: "Quasi real-time untuk kebencanaan geologi; API publik resmi belum terdokumentasi stabil.",
        realtimeClaim: "direkomendasikan fase berikutnya melalui kerja sama/API resmi atau scraping terkontrol dengan izin",
      },
    ],
  };
  await writeCache(payload);
  return { ...payload, cache: "miss" };
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, {
      "content-type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "public, max-age=60",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === "/api/incidents") return json(res, 200, await loadIncidents());
      if (url.pathname === "/api/health") return json(res, 200, { ok: true, at: new Date().toISOString() });
      return serveStatic(req, res);
    } catch (error) {
      json(res, 500, { error: error.message });
    }
  })
  .listen(PORT, () => {
    console.log(`Disaster monitor MVP running at http://localhost:${PORT}`);
  });
