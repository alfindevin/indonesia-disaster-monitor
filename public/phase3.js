(() => {
  const side = document.querySelector('.side-panel');
  if (!side) return;
  const box = document.createElement('section');
  box.className = 'phase3-box';
  box.innerHTML = `
    <div class="section-heading"><div><strong>🛟 Pusat Informasi & Keselamatan</strong><small>Sumber resmi untuk verifikasi dan tindakan darurat</small></div></div>
    <div class="official-grid">
      <a href="https://www.bmkg.go.id/" target="_blank" rel="noreferrer"><b>BMKG</b><span>Gempa, tsunami & cuaca</span></a>
      <a href="https://data.bnpb.go.id/" target="_blank" rel="noreferrer"><b>BNPB</b><span>Data kejadian bencana</span></a>
      <a href="https://inarisk.bnpb.go.id/" target="_blank" rel="noreferrer"><b>InaRISK</b><span>Risiko & paparan wilayah</span></a>
      <a href="https://kemkes.go.id/" target="_blank" rel="noreferrer"><b>Kemenkes</b><span>Informasi krisis kesehatan</span></a>
    </div>
    <div class="emergency-strip"><div><b>🚨 Darurat nasional</b><span>Hubungi <strong>112</strong> jika layanan tersedia di daerah Anda.</span></div><button type="button" id="phase3CopyEmergency">Salin 112</button></div>
    <p class="phase3-note">Dashboard ini menyajikan data pemantauan, bukan pengganti instruksi evakuasi. Untuk keputusan keselamatan, ikuti peringatan dan arahan resmi pemerintah/otoritas setempat.</p>`;
  const target = document.querySelector('.source-note') || document.querySelector('.incident-section');
  target?.after(box);
  document.querySelector('#phase3CopyEmergency')?.addEventListener('click', async (e) => { try { await navigator.clipboard.writeText('112'); e.currentTarget.textContent='Tersalin ✓'; setTimeout(()=>e.currentTarget.textContent='Salin 112',1500); } catch { e.currentTarget.textContent='112'; } });
})();
