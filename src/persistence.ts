// ---------------------------------------------------------------------------
// Persistence: IndexedDB cache (always) + File System Access API (optional).
// ---------------------------------------------------------------------------

import type { Worksheet } from './types';

const DB_NAME = 'pid-dojo';
const DB_VERSION = 2;
const STORE_WORKSHEETS = 'worksheets';
const STORE_SETTINGS = 'settings';
/** Store name used before the worksheet rename; migrated once on upgrade. */
const LEGACY_STORE = 'workbooks';
const DIR_KEY = 'storage-directory';

// --- minimal File System Access typings (not in lib.dom everywhere) ---------

interface PermissionCapableHandle {
  queryPermission?(descriptor: { mode: 'readwrite' | 'read' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'readwrite' | 'read' }): Promise<PermissionState>;
}

interface PickerWindow {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

function pickerWindow(): PickerWindow {
  return window as unknown as PickerWindow;
}

export function supportsFileSystemAccess(): boolean {
  return typeof pickerWindow().showDirectoryPicker === 'function';
}

// --- IndexedDB --------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const transaction = request.transaction;
      if (!db.objectStoreNames.contains(STORE_WORKSHEETS)) {
        db.createObjectStore(STORE_WORKSHEETS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS);
      }
      // v1 kept worksheets in a store named "workbooks": copy them over, then
      // drop the old store. Only ever runs once per browser profile.
      if (transaction && db.objectStoreNames.contains(LEGACY_STORE)) {
        const target = transaction.objectStore(STORE_WORKSHEETS);
        const cursorRequest = transaction.objectStore(LEGACY_STORE).openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) {
            db.deleteObjectStore(LEGACY_STORE);
            return;
          }
          target.put(cursor.value);
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = run(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
        transaction.oncomplete = () => db.close();
      }),
  );
}

function isWorksheet(value: unknown): value is Worksheet {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<Worksheet>;
  return (
    typeof v.id === 'string' &&
    typeof v.taskId === 'string' &&
    typeof v.seed === 'number' &&
    typeof v.formula === 'string' &&
    typeof v.plantParams === 'object' &&
    v.plantParams !== null
  );
}

/** Worksheets stored before the name field existed come back without one. */
function withDefaults(wb: Worksheet): Worksheet {
  return { ...wb, name: typeof wb.name === 'string' ? wb.name : '' };
}

// --- disk helpers -----------------------------------------------------------

async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await tx<FileSystemDirectoryHandle | undefined>(
      STORE_SETTINGS,
      'readonly',
      (s) => s.get(DIR_KEY) as IDBRequest<FileSystemDirectoryHandle | undefined>,
    );
    return handle ?? null;
  } catch {
    return null;
  }
}

async function ensureWritePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const permissioned = handle as unknown as PermissionCapableHandle;
  try {
    if (permissioned.queryPermission) {
      const state = await permissioned.queryPermission({ mode: 'readwrite' });
      if (state === 'granted') return true;
    }
    if (permissioned.requestPermission) {
      const state = await permissioned.requestPermission({ mode: 'readwrite' });
      return state === 'granted';
    }
  } catch {
    return false;
  }
  // No permission API: assume the picker already granted access.
  return true;
}

async function writeToDisk(wb: Worksheet): Promise<void> {
  const dir = await getDirectoryHandle();
  if (!dir) return;
  if (!(await ensureWritePermission(dir))) return;
  const file = await dir.getFileHandle(`${wb.id}.json`, { create: true });
  const writable = await file.createWritable();
  await writable.write(JSON.stringify(wb, null, 2));
  await writable.close();
}

async function removeFromDisk(id: string): Promise<void> {
  const dir = await getDirectoryHandle();
  if (!dir) return;
  if (!(await ensureWritePermission(dir))) return;
  try {
    await dir.removeEntry(`${id}.json`);
  } catch {
    // File was never written — nothing to do.
  }
}

// --- public API -------------------------------------------------------------

export async function listWorksheets(): Promise<Worksheet[]> {
  try {
    const all = await tx<Worksheet[]>(STORE_WORKSHEETS, 'readonly', (s) => s.getAll() as IDBRequest<Worksheet[]>);
    return all.filter(isWorksheet).map(withDefaults).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function getWorksheet(id: string): Promise<Worksheet | null> {
  try {
    const wb = await tx<Worksheet | undefined>(
      STORE_WORKSHEETS,
      'readonly',
      (s) => s.get(id) as IDBRequest<Worksheet | undefined>,
    );
    return wb && isWorksheet(wb) ? withDefaults(wb) : null;
  } catch {
    return null;
  }
}

/** Save to the IndexedDB cache and (when a folder was picked) to disk. */
export async function saveWorksheet(wb: Worksheet): Promise<void> {
  await tx(STORE_WORKSHEETS, 'readwrite', (s) => s.put(wb) as IDBRequest<IDBValidKey>);
  try {
    await writeToDisk(wb);
  } catch {
    // Disk write is best effort; the IndexedDB copy always succeeded.
  }
}

export async function deleteWorksheet(id: string): Promise<void> {
  await tx(STORE_WORKSHEETS, 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>);
  try {
    await removeFromDisk(id);
  } catch {
    // ignore
  }
}

/** Ask the user for a folder and remember it for silent saves. */
export async function pickStorageDirectory(): Promise<string | null> {
  const picker = pickerWindow().showDirectoryPicker;
  if (!picker) throw new Error('This browser has no File System Access API.');
  const handle = await picker({ mode: 'readwrite' });
  await tx(STORE_SETTINGS, 'readwrite', (s) => s.put(handle, DIR_KEY) as IDBRequest<IDBValidKey>);
  // Write every known worksheet so the folder is immediately useful.
  const worksheets = await listWorksheets();
  for (const wb of worksheets) {
    try {
      await writeToDisk(wb);
    } catch {
      // ignore individual failures
    }
  }
  return handle.name;
}

export async function getStoredDirectoryName(): Promise<string | null> {
  const dir = await getDirectoryHandle();
  return dir ? dir.name : null;
}

/** Download a worksheet as JSON (works in every browser). */
export function exportWorksheet(wb: Worksheet): void {
  const blob = new Blob([JSON.stringify(wb, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const slug = wb.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  a.download = `${slug || wb.taskId}-${wb.id.slice(0, 8)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Parse a worksheet from a dropped / picked file and cache it. */
export async function importWorksheetFile(file: File): Promise<Worksheet> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!isWorksheet(parsed)) throw new Error('That JSON does not look like a PID Dojo worksheet.');
  const worksheet = withDefaults(parsed);
  await saveWorksheet(worksheet);
  return worksheet;
}
