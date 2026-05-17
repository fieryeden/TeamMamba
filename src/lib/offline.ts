"use client";

import { useState, useEffect } from "react";

interface ServiceWorkerRegistrationWithSync extends ServiceWorkerRegistration {
  sync: {
    register: (tag: string) => Promise<void>;
  };
}

export function useOffline() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingMutations, setPendingMutations] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Check pending mutations in IndexedDB
    checkPendingMutations().then(setPendingMutations);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline, pendingMutations };
}

async function checkPendingMutations(): Promise<number> {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction("mutations", "readonly");
    const store = tx.objectStore("mutations");
    const count = await new Promise<number>((resolve) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
    db.close();
    return count;
  } catch {
    return 0;
  }
}

export async function queueMutation(mutation: {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
}) {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction("mutations", "readwrite");
    tx.objectStore("mutations").add(mutation);
    db.close();

    // Register for background sync if available
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistrationWithSync;
      if (reg.sync?.register) {
        await reg.sync.register("sync-mutations");
      }
    }
  } catch {
    // Fallback: just try the request directly
  }
}

export async function queueFetch(url: string, options: RequestInit): Promise<Response> {
  try {
    const response = await fetch(url, options);
    return response;
  } catch (err) {
    if (!navigator.onLine) {
      await queueMutation({
        url,
        method: options.method ?? "GET",
        headers: options.headers as Record<string, string> | undefined,
        body: options.body?.toString(),
      });
    }
    throw err;
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
