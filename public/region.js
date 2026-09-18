/* Phase 3 — Regional Intelligence + SEO-friendly client routing */
(() => {
  const PROVINCES = {
    'aceh':'Aceh','sumatera-utara':'Sumatera Utara','sumatera-barat':'Sumatera Barat','riau':'Riau','kepulauan-riau':'Kepulauan Riau','jambi':'Jambi','sumatera-selatan':'Sumatera Selatan','kepulauan-bangka-belitung':'Kepulauan Bangka Belitung','bengkulu':'Bengkulu','lampung':'Lampung','dki-jakarta':'DKI Jakarta','jawa-barat':'Jawa Barat','jawa-tengah':'Jawa Tengah','di-yogyakarta':'DI Yogyakarta','jawa-timur':'Jawa Timur','banten':'Banten','bali':'Bali','nusa-tenggara-barat':'Nusa Tenggara Barat','nusa-tenggara-timur':'Nusa Tenggara Timur','kalimantan-barat':'Kalimantan Barat','kalimantan-tengah':'Kalimantan Tengah','kalimantan-selatan':'Kalimantan Selatan','kalimantan-timur':'Kalimantan Timur','kalimantan-utara':'Kalimantan Utara','sulawesi-utara':'Sulawesi Utara','sulawesi-tengah':'Sulawesi Tengah','sulawesi-selatan':'Sulawesi Selatan','sulawesi-tenggara':'Sulawesi Tenggara','gorontalo':'Gorontalo','sulawesi-barat':'Sulawesi Barat','maluku':'Maluku','maluku-utara':'Maluku Utara','papua-barat':'Papua Barat','papua':'Papua','papua-tengah':'Papua Tengah','papua-pegunungan':'Papua Pegunungan','papua-selatan':'Papua Selatan','papua-barat-daya':'Papua Barat Daya'
  };
  const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  const path = location.pathname.split('/').filter(Boolean);
  const regionSlug = path[0] === 'provinsi' ? path[1] : '';
  const regionName = PROVINCES[regionSlug];

  function ensureMeta(name, content) {
    let el = document.querySelector(`meta[name="${name}"]`); if (!el) { el=document.createElement('meta'); el.name=name; document.head.appendChild(el); } el.content=content;
  }
  if (!regionName) return;

  document.title = `Bencana ${regionName} — Indonesia Disaster Monitor`;
  ensureMeta('description', `Pantau kejadian bencana terbaru di ${regionName}: lokasi, jenis bencana, waktu pembaruan, dan statistik regional.`);
  ensureMeta('robots','index,follow');
  const main = document.querySelector('.side-panel');
  if (!main) return;
  const hero = document.createElement('section'); hero.className='regional-hero'; hero.innerHTML=`<p class="eyebrow">REGIONAL MONITOR</p><h2>Bencana ${regionName}</h2><p>Pantau kejadian bencana dan statistik wilayah ${regionName}.</p><a href="/">← Kembali ke Indonesia</a>`;
  main.insertBefore(hero, main.firstChild);
  const title = document.querySelector('.topbar h1'); if (title) title.textContent = regionName;
  const province = document.getElementById('provinceFilter');
  if (province) { const option=[...province.options].find(o => slug(o.textContent)===regionSlug); if(option){province.value=option.value; province.dispatchEvent(new Event('change'));} }
  const canonical = document.createElement('link'); canonical.rel='canonical'; canonical.href=`${location.origin}/provinsi/${regionSlug}`; document.head.appendChild(canonical);
  const ld=document.createElement('script'); ld.type='application/ld+json'; ld.textContent=JSON.stringify({ '@context':'https://schema.org','@type':'Dataset','name':`Data Bencana ${regionName}`,'description':`Pemantauan kejadian bencana di ${regionName}.`,'url':location.href }); document.head.appendChild(ld);
})();
