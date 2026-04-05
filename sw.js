const CACHE_NAME = 'pro-exam-v7.5-cache';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/logo.jpg',
  '/bino.png',
  '/musiqa_nazariyasi.json',
  '/cholgu_ijrochiligi.json',
  '/vokal_ijrochiligi.json',
  '/metodika_repertuar.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});