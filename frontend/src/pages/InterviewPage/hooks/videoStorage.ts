// frontend/src/pages/InterviewPage/hooks/videoStorage.ts

const DB_NAME = "interview-video";
const DB_VERSION = 1;
const STORE_NAME = "recording-chunks";

interface RecordingData {
  chunks: Array<{ seq: number; blob: Blob }>;
  accumulatedDuration: number;
  mimeType: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveChunk(
  sessionId: string,
  seq: number,
  blob: Blob
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const existing = await new Promise<RecordingData | undefined>((resolve) => {
    const req = store.get(sessionId);
    req.onsuccess = () => resolve(req.result);
  });

  const data: RecordingData = existing ?? {
    chunks: [],
    accumulatedDuration: 0,
    mimeType: blob.type || "video/webm",
  };
  data.chunks.push({ seq, blob });

  return new Promise((resolve, reject) => {
    const req = store.put(data, sessionId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getRecordingData(
  sessionId: string
): Promise<RecordingData | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve) => {
    const req = store.get(sessionId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function updateAccumulatedDuration(
  sessionId: string,
  durationSec: number
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const existing = await new Promise<RecordingData | undefined>((resolve) => {
    const req = store.get(sessionId);
    req.onsuccess = () => resolve(req.result);
  });
  if (existing) {
    existing.accumulatedDuration = durationSec;
    return new Promise((resolve, reject) => {
      const req = store.put(existing, sessionId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

export async function mergeAndClear(
  sessionId: string
): Promise<{ blob: Blob; mimeType: string } | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const data = await new Promise<RecordingData | undefined>((resolve) => {
    const req = store.get(sessionId);
    req.onsuccess = () => resolve(req.result);
  });

  if (!data || data.chunks.length === 0) return null;

  const sorted = [...data.chunks].sort((a, b) => a.seq - b.seq);
  const blob = new Blob(
    sorted.map((c) => c.blob),
    { type: data.mimeType || "video/webm" }
  );

  // 合并成功后清除 IndexedDB
  return new Promise((resolve, reject) => {
    const delReq = store.delete(sessionId);
    delReq.onsuccess = () => resolve({ blob, mimeType: data.mimeType });
    delReq.onerror = () => reject(delReq.error);
  });
}

export async function deleteRecordingData(
  sessionId: string
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve) => {
    const req = store.delete(sessionId);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}
