/// <reference lib="webworker" />
/// <reference types="next" />

const CACHE_NAME = "teammamba-v1";
const STATIC_ASSETS = [
  "/",
  "/dashboard",
  "/login",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

// Install: cache static shell
self.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static
self.addEventListener("fetch", (event: FetchEvent) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension requests
  if (request.method !== "GET") return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // API calls: network-first with cache fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || new Response("Offline", { status: 503 })))
    );
    return;
  }

  // Static assets & pages: cache-first, network fallback
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
        }
        return response;
      }).catch(() => {
        // Offline page fallback for navigation requests
        if (request.mode === "navigate") {
          return caches.match("/dashboard") || new Response(
            `<!DOCTYPE html><html><head><meta charset="utf-8"><title>TeamMamba — Offline</title>
            <style>body{font-family:system-ui;background:#0f0f11;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
            .msg{text-align:center}h1{font-size:2rem;margin-bottom:0.5rem}p{color:#999}</style></head>
            <body><div class="msg"><h1>📡 You're Offline</h1><p>Check your internet connection and try again.</p></div></body></html>`,
            { headers: { "Content-Type": "text/html" }, status: 503 }
          );
        }
        return new Response("Offline", { status: 503 });
      });
    })
  );
});

// Background sync for offline mutations
self.addEventListener("sync", (event: SyncEvent) => {
  if (event.tag === "sync-mutations") {
    event.waitUntil(syncMutations());
  }
});

async function syncMutations() {
  const db = await openOfflineDB();
  const tx = db.transaction("mutations", "readonly");
  const store = tx.objectStore("mutations");
  const mutations = await store.getAll();

  for (const mutation of mutations) {
    try {
      await fetch(mutation.url, {
        method: mutation.method,
        headers: mutation.headers,
        body: mutation.body,
      });
      // Remove successful mutation
      const deleteTx = db.transaction("mutations", "readwrite");
      deleteTx.objectStore("mutations").delete(mutation.id);
    } catch {
      // Will retry on next sync
      break;
    }
  }
}

function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("teammamba-offline", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("mutations")) {
        db.createObjectStore("mutations", { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Push notifications
self.addEventListener("push", (event: PushEvent) => {
  const data = event.data?.json() ?? { title: "TeamMamba", body: "New notification" };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: data.data,
      vibrate: [100, 50, 100],
      actions: data.actions,
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
