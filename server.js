const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 5173);
const PUBLIC_DIR = path.join(__dirname, "public");
const CACHE_FILE = path.join(__dirname, "work", "cache.json");
const CACHE_TTL_MS = 5 * 60 * 1000;
const ADMIN_TTL_MS = 60 * 60 * 1000;

const SOURCES = {
  bmkgLatest: "https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json",
  bmkgM5: "https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json",
  bmkgFelt: "https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json",
  bnpbDashboard: "https://gis.bnpb.go.id/server/rest/services/Hosted/Data_Bencana_Dashboard/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson&orderByFields=objectid%20desc&resultRecordCount=200",
  bnpbTable: "https://gis.bnpb.go.id/databencana/tabel/pencarian.php",
  bnpbAdmin: "https://gis.bnpb.go.id/server/rest/services/Hosted/KABKOT_INDO/FeatureServer/0/query?where=1%3D1&outFields=nama_prop_,nama_kab_1,kode_prop_,kode_kab_s&returnGeometry=false&returnCentroid=true&f=json&resultRecordCount=2000",
};

const contentTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };
let adminCache = null;
let adminCacheAt = 0;

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body, null, 2));
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "user-agent": "IndonesiaDisasterMonitor/1.0" } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally { clearTimeout(timeout); }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "user-agent": "IndonesiaDisasterMonitor/1.0" } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally { clearTimeout(timeout); }
}

function parseCoordinates(value) {
  if (!value || typeof value !== "string") return null;
  const [lat, lon] = value.split(",").map(v => Number(v.trim()));
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
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
    id: bmkgId(item, feedType), sourceId: bmkgId(item, "event"), source: "BMKG",
    sourceUrl: "https://data.bmkg.go.id/gempabumi/", confidence: "official-feed",
    freshness: feedType === "latest" ? "event-driven" : "latest-list", type: "Gempa Bumi",
    title: `Gempa M${item.Magnitude} - ${item.Wilayah}`, region: item.Wilayah || "Indonesia",
    province: inferProvince(item.Wilayah), occurredAt: item.DateTime || null,
    updatedAt: new Date().toISOString(), lat: coords.lat, lon: coords.lon,
    severity: Number(item.Magnitude) >= 6 ? "high" : Number(item.Magnitude) >= 5 ? "medium" : "low",
    metrics: { magnitude: Number(item.Magnitude), depth: item.Kedalaman, tsunamiPotential: item.Potensi || null, felt: isFelt ? item.Dirasakan : null, shakemap: item.Shakemap ? `https://static.bmkg.go.id/${item.Shakemap}` : null },
    summary: [item.Kedalaman ? `Kedalaman ${item.Kedalaman}` : null, item.Potensi || null, isFelt ? `Dirasakan: ${item.Dirasakan}` : null].filter(Boolean).join(". "),
  };
}

function normalizeBnpb(feature) {
  const p = feature.properties || {};
  const coords = feature.geometry && feature.geometry.coordinates;
  const lon = Array.isArray(coords) ? Number(coords[0]) : null;
  const lat = Array.isArray(coords) ? Number(coords[1]) : null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const type = normalizeDisasterType(pick(p, ["kejadian", "jenis_bencana", "bencana", "jenis"]));
  const occurredAt = pick(p, ["tanggal", "tgl_kejadian", "tanggal_kejadian", "date"]);
  const province = pick(p, ["provinsi", "province", "nama_provinsi"]);
  const city = pick(p, ["kabupaten", "kab_kota", "kabupaten_kota", "kota"]);
  const objectId = pick(p, ["objectid", "OBJECTID", "id"]);
  return {
    id: `bnpb-${objectId || `${lat}-${lon}-${occurredAt || ""}`}`, sourceId: `bnpb-${objectId || `${lat}-${lon}`}`,
    source: "BNPB", sourceUrl: "https://gis.bnpb.go.id/databencana/", confidence: "official-gis", freshness: "reported-event",
    type, title: `${type} - ${city || province || "Indonesia"}`, region: [city, province].filter(Boolean).join(", ") || "Indonesia",
    province: province || inferProvince(`${city || ""} ${type || ""}`), occurredAt: normalizeDate(occurredAt), updatedAt: new Date().toISOString(),
    lat, lon, approximateLocation: false, severity: "unknown",
    metrics: { deaths: pick(p, ["meninggal", "md"]), missing: pick(p, ["hilang"]), injured: pick(p, ["terluka", "luka"]), damagedHouses: pick(p, ["rumah_rusak", "rumah rusak"]) },
    summary: pick(p, ["lokasi", "kronologi", "penyebab", "description"]) || "Laporan kejadian dari layanan GIS BNPB.",
  };
}

function normalizeBnpbTable(row, index, point) {
  if (!point) return null;
  const province = row.province || inferProvince(row.region);
  const type = normalizeDisasterType(row.type);
  const occurredAt = normalizeDate(row.date);
  return {
    id: `bnpb-table-${row.identity || `${row.city}-${row.province}-${row.date}-${index}`}`.replace(/\s+/g, "-").toLowerCase(),
    sourceId: `bnpb-table-${row.identity || `${row.city}-${row.province}-${row.date}-${row.type}`}`.replace(/\s+/g, "-").toLowerCase(),
    source: "BNPB", sourceUrl: "https://gis.bnpb.go.id/databencana/tabel/pencarian.php", confidence: point.precision,
    freshness: "reported-event", type, title: `${type} - ${row.city || province || "Indonesia"}`,
    region: [row.city, province].filter(Boolean).join(", ") || "Indonesia", province, occurredAt,
    updatedAt: new Date().toISOString(), lat: point.lat, lon: point.lon,
    approximateLocation: point.approximate, locationPrecision: point.precision,
    severity: classifyImpact(row), metrics: {
      deaths: numberOrNull(row.deaths), missing: numberOrNull(row.missing), injured: numberOrNull(row.injured),
      damagedHouses: numberOrNull(row.damagedHouses), floodedHouses: numberOrNull(row.floodedHouses), damagedFacilities: numberOrNull(row.damagedFacilities),
    },
    summary: [row.location, row.cause ? `Penyebab: ${row.cause}` : null].filter(Boolean).join(". ") || "Laporan kejadian dari tabel BNPB.",
  };
}

function parseBnpbTable(html) {
  const rowMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  return rowMatches.map(m => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => cleanHtml(c[1])))
    .filter(cells => cells.length >= 14 && /^\d+$/.test(cells[0]))
    .map(cells => ({ identity: cells[1], districtId: cells[2], date: cells[3], type: cells[4], location: cells[5], city: cells[6], province: cells[7], cause: cells[9], deaths: cells[10], missing: cells[11], injured: cells[12], damagedHouses: cells[13], floodedHouses: cells[14], damagedFacilities: cells[15] }));
}

function cleanHtml(value) { return String(value).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); }
function numberOrNull(value) { const n = Number(String(value || "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : null; }
function classifyImpact(row) { const d = numberOrNull(row.deaths) || 0, m = numberOrNull(row.missing) || 0, i = numberOrNull(row.injured) || 0; if (d + m > 0) return "high"; if (i > 0) return "medium"; return "unknown"; }
function pick(obj, keys) { for (const key of keys) { const found = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase()); if (found && obj[found] !== null && obj[found] !== "") return obj[found]; } return null; }
function titleCase(value) { return String(value).toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }
function normalizeDisasterType(value) { const label = titleCase(value || "Kejadian Bencana"); const compact = label.replace(/\s+/g, "").toLowerCase(); const aliases = { gempabumi: "Gempa Bumi", kebakaranhutandanlahan: "Kebakaran Hutan Dan Lahan", cuacaekstrim: "Cuaca Ekstrem", cuacaekstrem: "Cuaca Ekstrem", erupsigunungapi: "Erupsi Gunung Api", tanahlongsor: "Tanah Longsor" }; return aliases[compact] || label; }
function normalizeDate(value) { if (!value) return null; if (typeof value === "number") return new Date(value).toISOString(); const parsed = Date.parse(value); return Number.isNaN(parsed) ? String(value) : new Date(parsed).toISOString(); }

const PROVINCE_ALIASES = { "Dki Jakarta": "DKI Jakarta", "Daerah Khusus Ibukota Jakarta": "DKI Jakarta", "Yogyakarta": "DI Yogyakarta", "Daerah Istimewa Yogyakarta": "DI Yogyakarta" };
function inferProvince(text = "") { const normalized = String(text).toUpperCase(); const provinces = ["Aceh","Sumatera Utara","Sumatera Barat","Riau","Jambi","Sumatera Selatan","Bengkulu","Lampung","Kepulauan Bangka Belitung","Kepulauan Riau","Banten","DKI Jakarta","Jawa Barat","Jawa Tengah","DI Yogyakarta","Jawa Timur","Bali","Nusa Tenggara Barat","Nusa Tenggara Timur","Kalimantan Barat","Kalimantan Tengah","Kalimantan Selatan","Kalimantan Timur","Kalimantan Utara","Sulawesi Utara","Sulawesi Tengah","Sulawesi Selatan","Sulawesi Tenggara","Gorontalo","Sulawesi Barat","Maluku","Maluku Utara","Papua Barat Daya","Papua Barat","Papua Tengah","Papua Pegunungan","Papua Selatan","Papua"]; return provinces.find(p => normalized.includes(p.toUpperCase())) || null; }

function normalizePlace(value) { return String(value || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\b(KABUPATEN|KAB\.?|KOTA|ADM\.?|ADMINISTRASI)\b/g, " ").replace(/[^A-Z0-9]/g, "").trim(); }

async function loadAdminCentroids() {
  if (adminCache && Date.now() - adminCacheAt < ADMIN_TTL_MS) return adminCache;
  const data = await fetchJson(SOURCES.bnpbAdmin);
  const byCity = new Map();
  const provincePoints = new Map();
  for (const feature of data.features || []) {
    const p = feature.attributes || feature.properties || {};
    const centroid = feature.centroid || feature.geometry?.centroid;
    const x = Number(centroid?.x ?? centroid?.coordinates?.[0]);
    const y = Number(centroid?.y ?? centroid?.coordinates?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const province = p.nama_prop_ || p.provinsi || "";
    const city = p.nama_kab_1 || p.kabkota || "";
    const point = { lat: y, lon: x };
    if (city) byCity.set(`${normalizePlace(province)}|${normalizePlace(city)}`, point);
    const key = normalizePlace(province);
    const bucket = provincePoints.get(key) || [];
    bucket.push(point); provincePoints.set(key, bucket);
  }
  const byProvince = new Map();
  for (const [key, points] of provincePoints) byProvince.set(key, { lat: points.reduce((s,p)=>s+p.lat,0)/points.length, lon: points.reduce((s,p)=>s+p.lon,0)/points.length });
  adminCache = { byCity, byProvince }; adminCacheAt = Date.now(); return adminCache;
}

async function resolveBnpbPoint(province, city) {
  try {
    const admin = await loadAdminCentroids();
    const pKey = normalizePlace(PROVINCE_ALIASES[province] || province);
    const cKey = normalizePlace(city);
    if (cKey) {
      const exact = admin.byCity.get(`${pKey}|${cKey}`);
      if (exact) return { ...exact, approximate: true, precision: "official-administrative-centroid" };
      for (const [key, point] of admin.byCity) if (key.endsWith(`|${cKey}`)) return { ...point, approximate: true, precision: "official-administrative-centroid" };
    }
    const provincePoint = admin.byProvince.get(pKey);
    if (provincePoint) return { ...provincePoint, approximate: true, precision: "official-provincial-centroid" };
  } catch (_) {}
  return null;
}

function dedupeIncidents(items) { const map = new Map(); for (const item of items.filter(Boolean)) { const key = item.sourceId || item.id; const prev = map.get(key); if (!prev || String(item.summary||"").length > String(prev.summary||"").length) map.set(key,item); } return [...map.values()].sort((a,b)=>new Date(b.occurredAt||0)-new Date(a.occurredAt||0)); }
async function readCache() { try { return JSON.parse(await fs.readFile(CACHE_FILE,"utf8")); } catch { return null; } }
async function writeCache(data) { await fs.mkdir(path.dirname(CACHE_FILE),{recursive:true}); await fs.writeFile(CACHE_FILE,JSON.stringify(data,null,2)); }

async function loadIncidents() {
  const cached = await readCache();
  if (cached && Date.now()-cached.cachedAt < CACHE_TTL_MS) return { ...cached, cache:"hit" };
  const errors=[]; const sourceEntries=Object.entries(SOURCES).filter(([name])=>name!=="bnpbAdmin");
  const results=await Promise.allSettled(sourceEntries.map(async([name,url])=>[name,name==="bnpbTable"?await fetchText(url):await fetchJson(url)]));
  const data={}; results.forEach((r,i)=>{ if(r.status==="fulfilled") data[r.value[0]]=r.value[1]; else errors.push({source:sourceEntries[i][0],message:r.reason?.message||"Unknown error"}); });
  const rows=typeof data.bnpbTable==="string"?parseBnpbTable(data.bnpbTable):[];
  const tableIncidents=[]; for(let i=0;i<rows.length;i++){ const row=rows[i]; const point=await resolveBnpbPoint(row.province,row.city); const incident=normalizeBnpbTable(row,i,point); if(incident)tableIncidents.push(incident); }
  const incidents=dedupeIncidents([
    normalizeBmkg(data.bmkgLatest?.Infogempa?.gempa||{},"latest"),
    ...(data.bmkgM5?.Infogempa?.gempa||[]).map(x=>normalizeBmkg(x,"m5")),
    ...(data.bmkgFelt?.Infogempa?.gempa||[]).map(x=>normalizeBmkg(x,"felt")),
    ...(data.bnpbDashboard?.features||[]).map(normalizeBnpb), ...tableIncidents,
  ]);
  const payload={cachedAt:Date.now(),generatedAt:new Date().toISOString(),cacheTtlSeconds:CACHE_TTL_MS/1000,incidents,errors,sources:[
    {name:"BMKG Data Gempabumi Terbuka",url:"https://data.bmkg.go.id/gempabumi/",updateMode:"Diperbarui setiap ada peristiwa gempa; batas akses 60 permintaan/menit/IP.",realtimeClaim:"event-driven, bukan jaminan detik-per-detik"},
    {name:"BNPB Data Bencana / GIS",url:"https://gis.bnpb.go.id/databencana/",updateMode:"Data kejadian terlapor dari layanan GIS BNPB.",realtimeClaim:"near real-time/terlapor sesuai pembaruan sumber"},
    {name:"PVMBG MAGMA Indonesia",url:"https://magma.esdm.go.id/",updateMode:"Quasi real-time untuk kebencanaan geologi; API publik resmi belum terdokumentasi stabil.",realtimeClaim:"fase berikutnya"},
  ]};
  return {...payload,cache:"miss"};
}


function escapePageHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[ch]));
}

function pageShell({ title, description, canonical, body, jsonLd }) {
  const schema = jsonLd ? '<script type="application/ld+json">' + JSON.stringify(jsonLd).replace(/</g, "\\u003c") + '</script>' : "";
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapePageHtml(title)}</title><meta name="description" content="${escapePageHtml(description)}"><meta name="robots" content="index,follow">
<link rel="canonical" href="${escapePageHtml(canonical)}"><meta property="og:type" content="website"><meta property="og:title" content="${escapePageHtml(title)}">
<meta property="og:description" content="${escapePageHtml(description)}"><meta property="og:url" content="${escapePageHtml(canonical)}">
<meta name="twitter:card" content="summary"><link rel="stylesheet" href="/seo.css">${schema}</head><body>
<header class="seo-header"><a href="/" class="brand">Indonesia Disaster Monitor</a><nav><a href="/gempa-hari-ini">Gempa Hari Ini</a><a href="/data-bencana-indonesia">Data Bencana</a><a href="/panduan-gempa">Panduan</a></nav></header>
<main class="seo-main">${body}</main><footer class="seo-footer">Sumber resmi: BMKG dan BNPB. Data dapat berubah mengikuti pembaruan sumber.</footer></body></html>`;
}


const TYPE_SLUGS = {
  "gempa-bumi":"Gempa Bumi",
  "banjir":"Banjir",
  "tanah-longsor":"Tanah Longsor",
  "cuaca-ekstrem":"Cuaca Ekstrem",
  "kebakaran-hutan-dan-lahan":"Kebakaran Hutan Dan Lahan",
  "erupsi-gunung-api":"Erupsi Gunung Api"
};
const PROVINCES = ["Aceh","Sumatera Utara","Sumatera Barat","Riau","Jambi","Sumatera Selatan","Bengkulu","Lampung","Kepulauan Bangka Belitung","Kepulauan Riau","Banten","DKI Jakarta","Jawa Barat","Jawa Tengah","DI Yogyakarta","Jawa Timur","Bali","Nusa Tenggara Barat","Nusa Tenggara Timur","Kalimantan Barat","Kalimantan Tengah","Kalimantan Selatan","Kalimantan Timur","Kalimantan Utara","Sulawesi Utara","Sulawesi Tengah","Sulawesi Selatan","Sulawesi Tenggara","Gorontalo","Sulawesi Barat","Maluku","Maluku Utara","Papua Barat Daya","Papua Barat","Papua Tengah","Papua Pegunungan","Papua Selatan","Papua"];
function slugify(value){ return String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }
function provinceBySlug(slug){ return PROVINCES.find(p=>slugify(p)===slug) || null; }
function incidentCards(rows){
  if(!rows.length) return '<p>Belum ada kejadian yang tersedia untuk filter ini.</p>';
  return '<div class="live-list">'+rows.slice(0,100).map(i=>`<a class="live-item" href="/kejadian/${encodeURIComponent(i.id)}"><strong>${escapePageHtml(i.title)}</strong><small>${escapePageHtml(i.region||"Indonesia")} · ${escapePageHtml(i.occurredAt||"")}</small></a>`).join("")+'</div>';
}
async function filteredLanding({kind,value,slug}){
  const payload=await loadIncidents();
  let rows=payload.incidents||[];
  let title,description,heading,kicker;
  if(kind==="type"){
    rows=rows.filter(i=>i.type===value);
    heading=`${value} di Indonesia`;
    title=`${heading} — Data Kejadian Terbaru`;
    description=`Pantau data ${value.toLowerCase()} terbaru di Indonesia dari sumber resmi yang tersedia, lengkap dengan waktu, wilayah, dan detail kejadian.`;
    kicker="JENIS BENCANA";
  } else {
    rows=rows.filter(i=>(i.province||"")===value || String(i.region||"").includes(value));
    heading=`Bencana di ${value}`;
    title=`${heading} — Data Kejadian Terbaru`;
    description=`Pantau kejadian bencana terbaru di ${value} berdasarkan data BMKG dan BNPB yang tersedia.`;
    kicker="WILAYAH";
  }
  const canonical=`https://indonesia-disaster-monitor.vercel.app/${kind==="type"?"jenis":"wilayah"}/${slug}`;
  const body=`<article><p class="kicker">${kicker}</p><h1>${escapePageHtml(heading)}</h1><p class="lead">${escapePageHtml(description)}</p>
  <p class="note">Menampilkan ${rows.length} kejadian yang tersedia pada feed saat ini. Data dapat berubah mengikuti pembaruan sumber.</p>
  <h2>Kejadian terbaru</h2>${incidentCards(rows)}
  <div class="link-grid"><a href="/">Buka peta nasional →</a><a href="/gempa-hari-ini">Gempa hari ini →</a><a href="/data-bencana-indonesia">Metodologi data →</a><a href="/panduan-gempa">Panduan keselamatan →</a></div></article>`;
  return pageShell({title,description,canonical,body,jsonLd:{"@context":"https://schema.org","@type":"CollectionPage",name:heading,description,url:canonical}});
}
async function archiveLanding(days,label,slug){
  const payload=await loadIncidents(); const cut=Date.now()-days*864e5;
  const rows=(payload.incidents||[]).filter(i=>{const t=new Date(i.occurredAt||i.updatedAt).getTime();return Number.isFinite(t)&&t>=cut});
  const canonical=`https://indonesia-disaster-monitor.vercel.app/arsip/${slug}`;
  const description=`Arsip kejadian bencana Indonesia ${label} dari data BMKG dan BNPB yang tersedia.`;
  const body=`<article><p class="kicker">ARSIP DATA</p><h1>Kejadian Bencana ${escapePageHtml(label)}</h1><p class="lead">${escapePageHtml(description)}</p><p class="note">${rows.length} kejadian tersedia dalam rentang ini.</p><h2>Daftar kejadian</h2>${incidentCards(rows)}<div class="link-grid"><a href="/arsip/7-hari">7 hari terakhir →</a><a href="/arsip/30-hari">30 hari terakhir →</a><a href="/">Dashboard utama →</a><a href="/data-bencana-indonesia">Tentang sumber data →</a></div></article>`;
  return pageShell({title:`Kejadian Bencana ${label} | Indonesia Disaster Monitor`,description,canonical,body,jsonLd:{"@context":"https://schema.org","@type":"CollectionPage",name:`Kejadian Bencana ${label}`,url:canonical}});
}

async function incidentPage(id) {
  const payload = await loadIncidents();
  const incident = (payload.incidents || []).find(item => item.id === id);
  if (!incident) return null;
  const canonical = `https://indonesia-disaster-monitor.vercel.app/kejadian/${encodeURIComponent(incident.id)}`;
  const m = incident.metrics || {};
  const metricRows = Object.entries(m).filter(([,v]) => v !== null && v !== undefined && v !== "").map(([k,v]) => `<tr><th>${escapePageHtml(k)}</th><td>${escapePageHtml(v)}</td></tr>`).join("");
  const body = `<article><p class="kicker">${escapePageHtml(incident.source)} · ${escapePageHtml(incident.type)}</p><h1>${escapePageHtml(incident.title)}</h1>
<p class="lead">${escapePageHtml(incident.summary || "Informasi kejadian bencana dari sumber resmi.")}</p>
<div class="facts"><div><span>Wilayah</span><strong>${escapePageHtml(incident.region || "Indonesia")}</strong></div><div><span>Waktu</span><strong>${escapePageHtml(incident.occurredAt || "-")}</strong></div><div><span>Level</span><strong>${escapePageHtml(incident.severity || "unknown")}</strong></div><div><span>Sumber</span><strong>${escapePageHtml(incident.source)}</strong></div></div>
${metricRows ? `<h2>Parameter kejadian</h2><table><tbody>${metricRows}</tbody></table>` : ""}
<p><a class="cta" href="/">Lihat di peta pemantauan</a> <a href="${escapePageHtml(incident.sourceUrl || "/")}" rel="nofollow noreferrer" target="_blank">Buka sumber resmi</a></p>
<section><h2>Tentang data ini</h2><p>Halaman ini dibuat dari feed sumber resmi dan diperbarui mengikuti ketersediaan data. Lokasi administratif tertentu dapat berupa titik perkiraan/centroid bila sumber tidak menyediakan koordinat rinci.</p></section></article>`;
  return pageShell({
    title: `${incident.title} | Indonesia Disaster Monitor`,
    description: `${incident.title}. ${incident.summary || ""}`.slice(0,155),
    canonical,
    body,
    jsonLd: { "@context":"https://schema.org", "@type":"Report", headline:incident.title, datePublished:incident.occurredAt || incident.updatedAt, dateModified:incident.updatedAt, about:incident.type, spatialCoverage:incident.region, isBasedOn:incident.sourceUrl }
  });
}

async function dynamicSitemap() {
  const base = "https://indonesia-disaster-monitor.vercel.app";
  const fixed = ["/","/gempa-hari-ini","/data-bencana-indonesia","/panduan-gempa","/tas-siaga-bencana","/arti-magnitudo","/regions.html","/arsip/7-hari","/arsip/30-hari",...Object.keys(TYPE_SLUGS).map(s=>`/jenis/${s}`),...PROVINCES.map(p=>`/wilayah/${slugify(p)}`)];
  let incidentUrls = [];
  try {
    const payload = await loadIncidents();
    incidentUrls = (payload.incidents || []).slice(0,200).map(i => `/kejadian/${encodeURIComponent(i.id)}`);
  } catch (_) {}
  const urls = [...fixed, ...incidentUrls];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls.map(u => `<url><loc>${base}${u}</loc></url>`).join("") + "</urlset>";
}

async function serveStatic(req,res){ const url=new URL(req.url,`http://${req.headers.host}`); let requested=url.pathname==="/"?"/index.html":decodeURIComponent(url.pathname); if(!path.extname(requested) && requested!=="/"){ requested += ".html"; } const filePath=path.normalize(path.join(PUBLIC_DIR,requested)); if(!filePath.startsWith(PUBLIC_DIR)){res.writeHead(403);res.end("Forbidden");return;} try{const body=await fs.readFile(filePath);res.writeHead(200,{"content-type":contentTypes[path.extname(filePath)]||"application/octet-stream","cache-control":"public, max-age=60"});res.end(body);}catch{res.writeHead(404);res.end("Not found");}}

http.createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host}`);if(url.pathname==="/api/incidents")return json(res,200,await loadIncidents());if(url.pathname==="/api/health")return json(res,200,{ok:true,at:new Date().toISOString()});if(url.pathname==="/sitemap.xml"){const xml=await dynamicSitemap();res.writeHead(200,{"content-type":"application/xml; charset=utf-8","cache-control":"public, max-age=300"});return res.end(xml);}if(url.pathname.startsWith("/jenis/")){const slug=decodeURIComponent(url.pathname.slice("/jenis/".length));const value=TYPE_SLUGS[slug];if(value){const html=await filteredLanding({kind:"type",value,slug});res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"public, max-age=300"});return res.end(html);}}if(url.pathname.startsWith("/wilayah/")){const slug=decodeURIComponent(url.pathname.slice("/wilayah/".length));const value=provinceBySlug(slug);if(value){const html=await filteredLanding({kind:"province",value,slug});res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"public, max-age=300"});return res.end(html);}}if(url.pathname==="/arsip/7-hari"){const html=await archiveLanding(7,"7 Hari Terakhir","7-hari");res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"public, max-age=300"});return res.end(html);}if(url.pathname==="/arsip/30-hari"){const html=await archiveLanding(30,"30 Hari Terakhir","30-hari");res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"public, max-age=300"});return res.end(html);}if(url.pathname.startsWith("/kejadian/")){const id=decodeURIComponent(url.pathname.slice("/kejadian/".length));const html=await incidentPage(id);if(!html){res.writeHead(404,{"content-type":"text/html; charset=utf-8"});return res.end(pageShell({title:"Kejadian tidak ditemukan",description:"Data kejadian tidak ditemukan.",canonical:"https://indonesia-disaster-monitor.vercel.app/",body:"<h1>Kejadian tidak ditemukan</h1><p><a href=\"/\">Kembali ke dashboard</a></p>"}));}res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"public, max-age=300"});return res.end(html);}return serveStatic(req,res);}catch(error){json(res,500,{error:error.message});}}).listen(PORT,()=>console.log(`Indonesia Disaster Monitor running at http://localhost:${PORT}`));
