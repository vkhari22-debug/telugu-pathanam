import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_SETTINGS, type Bookmark, type DocumentSummary, type ParsedDocument, type ReadingProgress, type Settings, type StoredDocument } from '../types';

interface ReaderDB extends DBSchema {
  documents: { key: string; value: StoredDocument };
  summaries: { key: string; value: DocumentSummary; indexes: { byCreated: number } };
  progress: { key: string; value: ReadingProgress };
  bookmarks: { key: number; value: Bookmark; indexes: { byDoc: string } };
  settings: { key: string; value: { key: string; value: Settings } };
}

const DB_NAME = 'telugu-pathanam';
let dbPromise: Promise<IDBPDatabase<ReaderDB>> | null = null;

function db(): Promise<IDBPDatabase<ReaderDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ReaderDB>(DB_NAME, 1, {
      upgrade(database) {
        database.createObjectStore('documents', { keyPath: 'id' });
        database.createObjectStore('summaries', { keyPath: 'id' }).createIndex('byCreated', 'createdAt');
        database.createObjectStore('progress', { keyPath: 'docId' });
        database.createObjectStore('bookmarks', { keyPath: 'id', autoIncrement: true }).createIndex('byDoc', 'docId');
        database.createObjectStore('settings', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function saveDocument(parsed: ParsedDocument, file: { name: string; size: number }): Promise<StoredDocument> {
  const stored: StoredDocument = { ...parsed, id: newId(), fileName: file.name, fileSize: file.size, createdAt: Date.now() };
  const database = await db();
  const tx = database.transaction(['documents', 'summaries'], 'readwrite');
  await tx.objectStore('documents').put(stored);
  await tx.objectStore('summaries').put({
    id: stored.id,
    title: stored.title,
    fileName: stored.fileName,
    format: stored.format,
    paragraphCount: stored.paragraphs.length,
    createdAt: stored.createdAt,
  });
  await tx.done;
  return stored;
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  const all = await (await db()).getAllFromIndex('summaries', 'byCreated');
  return all.reverse();
}

export async function getDocument(id: string): Promise<StoredDocument | undefined> {
  return (await db()).get('documents', id);
}

export async function deleteDocument(id: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(['documents', 'summaries', 'progress', 'bookmarks'], 'readwrite');
  await tx.objectStore('documents').delete(id);
  await tx.objectStore('summaries').delete(id);
  await tx.objectStore('progress').delete(id);
  const bookmarkStore = tx.objectStore('bookmarks');
  for (const key of await bookmarkStore.index('byDoc').getAllKeys(id)) await bookmarkStore.delete(key);
  await tx.done;
}

export async function getProgress(docId: string): Promise<ReadingProgress | undefined> {
  return (await db()).get('progress', docId);
}

export async function getAllProgress(): Promise<ReadingProgress[]> {
  return (await db()).getAll('progress');
}

export async function saveProgress(docId: string, paragraphIndex: number): Promise<void> {
  await (await db()).put('progress', { docId, paragraphIndex, updatedAt: Date.now() });
}

export async function listBookmarks(docId: string): Promise<Bookmark[]> {
  const items = await (await db()).getAllFromIndex('bookmarks', 'byDoc', docId);
  return items.sort((a, b) => a.paragraphIndex - b.paragraphIndex);
}

export async function addBookmark(bookmark: Omit<Bookmark, 'id'>): Promise<Bookmark> {
  const id = await (await db()).add('bookmarks', bookmark as Bookmark);
  return { ...bookmark, id };
}

export async function deleteBookmark(id: number): Promise<void> {
  await (await db()).delete('bookmarks', id);
}

export async function loadSettings(): Promise<Settings> {
  const row = await (await db()).get('settings', 'settings');
  return { ...DEFAULT_SETTINGS, ...(row?.value ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await (await db()).put('settings', { key: 'settings', value: settings });
}

export async function clearAllData(): Promise<void> {
  const database = await db();
  const tx = database.transaction(['documents', 'summaries', 'progress', 'bookmarks', 'settings'], 'readwrite');
  await Promise.all([
    tx.objectStore('documents').clear(),
    tx.objectStore('summaries').clear(),
    tx.objectStore('progress').clear(),
    tx.objectStore('bookmarks').clear(),
    tx.objectStore('settings').clear(),
  ]);
  await tx.done;
}

export async function storageEstimate(): Promise<{ usage?: number; quota?: number; persisted?: boolean }> {
  if (typeof navigator === 'undefined' || !navigator.storage) return {};
  const [estimate, persisted] = await Promise.all([
    navigator.storage.estimate?.().catch(() => undefined),
    navigator.storage.persisted?.().catch(() => undefined),
  ]);
  return { usage: estimate?.usage, quota: estimate?.quota, persisted };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** For tests only. */
export function resetDbConnection(): void {
  dbPromise = null;
}
