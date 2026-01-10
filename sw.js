const CACHE = "dnd-express-v5";
const FILES = [
  "./",
  "index.html",
  "styles.css",
  "engine.js",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "adventures/jailbreak.json",
  "adventures/casino.json",
  "images/scenes/cell.png",
  "images/scenes/cell-action.png",
  "images/scenes/cell-around.png",
  "images/scenes/corridor.png",
  "images/scenes/barracks.png",
  "images/scenes/barracks-alarm.png",
  "images/scenes/sewer.png",
  "images/scenes/sewer-tunnel.png",
  "images/scenes/sewer-escape.png",
  "images/scenes/slime.png",
  "images/scenes/gate-escape.png",
  "images/scenes/blank-escape.png",
  "images/scenes/victory.png",
  "images/scenes/defeat.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});