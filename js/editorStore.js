// Small IndexedDB helper for editor state that must survive a reload.
//
// localStorage is deliberately not used here: drafts and autosaves grow past
// its ~5 MB quota on large courses, and a failed write would silently lose
// work. Everything in this module degrades to a no-op when storage is
// unavailable (private windows, blocked cookies) so the editor still runs.

const DB_NAME = "golfpocket.editor.store";
const DB_VERSION = 1;
const STORE = "kv";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Storage unavailable."));
    request.onblocked = () => reject(new Error("Storage is blocked by another tab."));
  });
}

async function withStore(mode, run) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let result;
      const request = run(tx.objectStore(STORE));
      if (request) {
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => reject(request.error);
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Storage write was aborted."));
    });
  } finally {
    db.close();
  }
}

export async function getItem(key) {
  try {
    return await withStore("readonly", (store) => store.get(key));
  } catch (err) {
    console.warn("Editor storage read failed", err);
    return undefined;
  }
}

export async function setItem(key, value) {
  try {
    await withStore("readwrite", (store) => store.put(value, key));
    return true;
  } catch (err) {
    console.warn("Editor storage write failed", err);
    return false;
  }
}

export async function removeItem(key) {
  try {
    await withStore("readwrite", (store) => store.delete(key));
    return true;
  } catch (err) {
    return false;
  }
}
