/// <reference lib="webworker" />

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_NAME = "teammamba-v1";
const STATIC_ASSETS = [
  "/",
  "/dashboard",
  "/login",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

type MutationRecord = {
  id: number;
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
};

type SyncEventLike = ExtendableEvent & { tag: string };

type PushPayload = {
  title?: string;
  body?: string;
  data?: { url?: string };
  actions?: Array<{ action: string; title: string; icon?: string }>;
};

sw.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  sw.skipWaiting();
});

sw.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  sw.clients.claim();
});

sw.addEventListener("fetch", (event: FetchEvent) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone).catch(() => {});
            });
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response("Offline", { status: 503 });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone).catch(() => {});
            });
          }
          return response;
        })
        .catch(async () => {
          if (request.mode === "navigate") {
            const dashboard = await caches.match("/dashboard");
            if (dashboard) return dashboard;
            return new Response(
              "<!DOCTYPE html><html><head><meta charset='utf-8'><title>TeamMamba — Offline</title></head><body><h1>Offline</h1><p>Reconnect and try again.</p></body></html>",
              { headers: { "Content-Type": "text/html" }, status: 503 }
            );
          }
          return new Response("Offline", { status: 503 });
        });
    })
  );
});

sw.addEventListener("sync", (event: Event) => {
  const syncEvent = event as SyncEventLike;
  if (syncEvent.tag !== "sync-mutations") return;
  syncEvent.waitUntil(syncMutations());
});

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function syncMutations() {
  const db = await openOfflineDB();
  try {
    const tx = db.transaction("mutations", "readonly");
    const store = tx.objectStore("mutations");
    const mutations = (await requestToPromise(store.getAll())) as MutationRecord[];

    for (const mutation of mutations) {
      try {
        await fetch(mutation.url, {
          method: mutation.method,
          headers: mutation.headers,
          body: mutation.body,
        });

        const deleteTx = db.transaction("mutations", "readwrite");
        deleteTx.objectStore("mutations").delete(mutation.id);
      } catch {
        break;
      }
    }
  } finally {
    db.close();
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

sw.addEventListener("push", (event: PushEvent) => {
  const payload = (event.data?.json() as PushPayload | null) ?? {};
  event.waitUntil(
    sw.registration.showNotification(payload.title ?? "TeamMamba", {
      body: payload.body ?? "New notification",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: payload.data,
    })
  );
});

sw.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/dashboard";

  event.waitUntil(
    sw.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "url" in client && client.url.includes(targetUrl));
      if (existing && "focus" in existing) {
        return (existing as WindowClient).focus();
      }
      return sw.clients.openWindow(targetUrl);
    })
  );
});

export {};
