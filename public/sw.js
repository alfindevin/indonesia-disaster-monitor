const CACHE='idm-v12';
const APP=['/','/styles.css','/dashboard.css','/phase2.css','/region.css','/history.css','/phase1.css','/phase3.css','/phase4.css','/map-markers.css','/app.js','/dashboard.js','/phase2.js','/region.js','/phase1.js','/phase1-bridge.js','/phase3.js','/phase4.js','/health.js','/history.js','/manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match('/')))});
