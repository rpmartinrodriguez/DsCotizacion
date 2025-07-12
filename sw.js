// sw.js (Final, Simplified, and Robust Version)

const CACHE_NAME = 'dulce-app-cache-v4.2'; // A new version to force the update

// Only the essential "shell" of the app is cached on install.
const APP_SHELL_URLS = [
  '/',
  'index.html',
  'css/style.css',
  'js/menu.js',
  'assets/logo.png',
  'assets/apple-touch-icon.png'
];

// This event runs when the service worker is first installed.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache opened, caching app shell.');
        return cache.addAll(APP_SHELL_URLS);
      })
      .catch(error => {
        console.error('Failed to cache app shell:', error);
      })
  );
});

// This event cleans up old caches from previous versions.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// This event handles all network requests.
self.addEventListener('fetch', event => {
  // We don't cache requests to Firebase.
  if (event.request.url.includes('firestore.googleapis.com')) {
    return;
  }

  // Use the "Stale-While-Revalidate" strategy for all other assets.
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cachedResponse => {
        // Make the network request in the background.
        const fetchPromise = fetch(event.request).then(networkResponse => {
          // If successful, update the cache.
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });

        // Return the cached response immediately if it exists, otherwise wait for the network.
        return cachedResponse || fetchPromise;
      });
    })
  );
});
