const CACHE='idm-v17';
const APP=['/','/offline.html','/styles.css','/ui-overhaul.css','/dashboard.css','/phase2.css','/region.css','/history.css','/phase1.css','/phase3.css','/phase4.css','/map-markers.css','/map-clusters.css','/app.js','/map-clusters.js','/dashboard.js','/phase2.js','/region.js','/phase1.js','/phase1-bridge.js','/phase3.js','/phase4.js','/sidebar-toggle.js','/health.js','/history.js','/manifest.webmanifest'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin) return;

  if(url.pathname.startsWith('/api/')){
    event.respondWith(fetch(event.request));
    return;
  }

  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));
    return;
  }

  if(APP.includes(url.pathname)){
    event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
  }
});
