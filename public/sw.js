// PWA Service Worker — 정적 자산만 캐시. /api/* 와 외부 CDN 은 network-only (결정 4)
const CACHE_VERSION = 'ecams-ai-v3'; // v3: index.html no-store fetch (항상 최신 파일)
const PRECACHE_URLS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 외부 도메인은 SW 우회 (fonts.googleapis.com, cdnjs 등)
  if (url.origin !== self.location.origin) return;

  // /api/* 는 절대 캐시 안 함 (LLM 응답 fresh 보장 + 결정 26 Stop 충돌 회피)
  if (url.pathname.startsWith('/api/')) return;

  // index.html (네비게이션) 은 network-first + no-store — HTTP 캐시 우회해서 항상 최신 파일
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 정적 자산은 cache-first
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});

// ===== Web Push 핸들러 (web-push 결정 7, 10) =====

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'eCAMS AI', body: '답변이 완료되었습니다.' };
  }
  const title = payload.title || 'eCAMS AI';
  const options = {
    body: payload.body || '답변이 완료되었습니다.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { jobId: payload.jobId, chatId: payload.chatId },
    tag: payload.jobId || 'ecams-default', // 결정 7: 동일 job 중복 알림 방지
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 알림 클릭 → 기존 PWA 윈도우 focus + postMessage, 없으면 새로 open (결정 6)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { jobId, chatId } = event.notification.data || {};
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if (client.url.startsWith(self.location.origin)) {
        client.postMessage({ type: 'resumeJob', jobId, chatId });
        return client.focus();
      }
    }
    return self.clients.openWindow('/?resumeJob=' + encodeURIComponent(jobId || ''));
  })());
});
