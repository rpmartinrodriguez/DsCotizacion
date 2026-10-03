const CACHE_NAME = 'dulce-sall-admin-v2.15';

const CORE_ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/css/style.css',
    '/css/app-v2.css',
    '/js/menu.js',
    '/js/shell-v2.js',
    '/manifest.json',
    '/assets/logo.png',
    '/assets/logo-192.png',
    '/assets/logo-512.png',
    '/assets/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(CORE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(
                names
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            ))
            .then(() => self.clients.claim())
    );
});

const isSameOrigin = (request) => {
    try {
        return new URL(request.url).origin === self.location.origin;
    } catch {
        return false;
    }
};

const shouldCacheResponse = (response) => {
    return response && response.ok && response.type === 'basic';
};

self.addEventListener('fetch', (event) => {
    const { request } = event;

    if (request.method !== 'GET' || !isSameOrigin(request)) {
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (shouldCacheResponse(response)) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(async () => {
                    const cachedPage = await caches.match(request);
                    if (cachedPage) return cachedPage;

                    return caches.match('/login.html');
                })
        );
        return;
    }

    event.respondWith(
        fetch(request)
            .then((response) => {
                if (shouldCacheResponse(response)) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                }
                return response;
            })
            .catch(() => caches.match(request))
    );
});
