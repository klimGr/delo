// Офлайн-режим: файлы приложения и фото хранятся на телефоне, чтобы «Плинтус» открывался без интернета.
// Файлы приложения берём из сети, если она есть (так всегда свежая версия), а без сети — из кэша.
// Фото не меняются, поэтому их сразу отдаём из кэша.
const CACHE = 'plintus-v1';
const APP_FILES = ['./', './index.html', './styles.css', './app.js'];
const TG_SCRIPT = 'https://telegram.org/js/telegram-web-app.js';
const NETWORK_WAIT = 2500; // сколько ждём сеть, прежде чем открыть сохранённую версию

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_FILES);
    try { await cache.add(new Request(TG_SCRIPT, { mode: 'no-cors' })); } catch { /* закэшируем при следующем запуске */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  // Telegram добавляет к адресу свои параметры — храним одну копию без них
  const url = new URL(request.url);
  const key = url.origin === location.origin ? url.origin + url.pathname : request;
  const fromNetwork = fetch(request).then(res => {
    if (res.ok || res.type === 'opaque') cache.put(key, res.clone());
    return res;
  });
  const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_WAIT));
  try {
    const res = await Promise.race([fromNetwork, timeout]);
    if (res) return res;
  } catch { /* сети нет — берём из кэша */ }
  const cached = await cache.match(request, { ignoreSearch: true });
  return cached || fromNetwork;
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return; // запросы к серверу с данными не трогаем
  const url = new URL(request.url);
  if (url.origin === location.origin || url.href.startsWith(TG_SCRIPT)) {
    event.respondWith(networkFirst(request));
  } else if (url.hostname.endsWith('.supabase.co') && url.pathname.includes('/storage/')) {
    event.respondWith(cacheFirst(request));
  }
});
