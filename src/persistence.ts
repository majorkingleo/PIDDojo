// ---------------------------------------------------------------------------
// Persistence: IndexedDB cache (always) + File System Access API (optional).
// ---------------------------------------------------------------------------

import type { Workbook } from './types';

const DB_NAME = 'pid-dojo';
const DB_VERSION = 1;
const STORE_WORKBOOKS = 'workbooks';
const STORE_SETTINGS = 'settings';
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
      if (!db.objectStoreNames.contains(STORE_WORKBOOKS)) {
        db.createObjectStore(STORE_WORKBOOKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS);
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

function isWorkbook(value: unknown): value is Workbook {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<Workbook>;
  return (
    typeof v.id === 'string' &&
    typeof v.taskId === 'string' &&
    typeof v.seed === 'number' &&
    typeof v.formula === 'string' &&
    typeof v.plantParams === 'object' &&
    v.plantParams !== null
  );
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

async function writeToDisk(wb: Workbook): Promise<void> {
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

export async function listWorkbooks(): Promise<Workbook[]> {
  try {
    const all = await tx<Workbook[]>(STORE_WORKBOOKS, 'readonly', (s) => s.getAll() as IDBRequest<Workbook[]>);
    return all.filter(isWorkbook).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function getWorkbook(id: string): Promise<Workbook | null> {
  try {
    const wb = await tx<Workbook | undefined>(
      STORE_WORKBOOKS,
      'readonly',
      (s) => s.get(id) as IDBRequest<Workbook | undefined>,
    );
    return wb && isWorkbook(wb) ? wb : null;
  } catch {
    return null;
  }
}

/** Save to the IndexedDB cache and (when a folder was picked) to disk. */
export async function saveWorkbook(wb: Workbook): Promise<void> {
  await tx(STORE_WORKBOOKS, 'readwrite', (s) => s.put(wb) as IDBRequest<IDBValidKey>);
  try {
    await writeToDisk(wb);
  } catch {
    // Disk write is best effort; the IndexedDB copy always succeeded.
  }
}

export async function deleteWorkbook(id: string): Promise<void> {
  await tx(STORE_WORKBOOKS, 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>);
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
  // Write every known workbook so the folder is immediately useful.
  const workbooks = await listWorkbooks();
  for (const wb of workbooks) {
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

/** Download a workbook as JSON (works in every browser). */
export function exportWorkbook(wb: Workbook): void {
  const blob = new Blob([JSON.stringify(wb, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${wb.taskId}-${wb.id}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Parse a workbook from a dropped / picked file and cache it. */
export async function importWorkbookFile(file: File): Promise<Workbook> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!isWorkbook(parsed)) throw new Error('That JSON does not look like a PID Dojo workbook.');
  await saveWorkbook(parsed);
  return parsed;
}
