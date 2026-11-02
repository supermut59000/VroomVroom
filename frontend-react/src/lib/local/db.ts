// Minimal promise wrapper over IndexedDB — one database, five object stores.
// All rows share the same envelope (auto id + is_active soft delete).

export interface LocalRow {
  id: number
  is_active: boolean
  created_at: string
  updated_at: string | null
}

export type TableName =
  | 'vehicles'
  | 'fuel_entries'
  | 'maintenances'
  | 'flexfuel_conversions'
  | 'e10_prices'

const TABLES: TableName[] = [
  'vehicles',
  'fuel_entries',
  'maintenances',
  'flexfuel_conversions',
  'e10_prices',
]

const DB_NAME = 'vroomvroom-local'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const database = req.result
        for (const t of TABLES) {
          if (!database.objectStoreNames.contains(t)) {
            const store = database.createObjectStore(t, {
              keyPath: 'id',
              autoIncrement: true,
            })
            store.createIndex('vehicle_id', 'vehicle_id', { unique: false })
            store.createIndex('client_request_id', 'client_request_id', {
              unique: false,
            })
          }
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function tx<T>(
  database: IDBDatabase,
  table: TableName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = database.transaction(table, mode)
    const req = fn(t.objectStore(table))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function nowIso(): string {
  return new Date().toISOString()
}

export const db = {
  async all<T extends LocalRow>(table: TableName): Promise<T[]> {
    const d = await open()
    return tx(d, table, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
  },

  async get<T extends LocalRow>(table: TableName, id: number): Promise<T | undefined> {
    if (typeof id !== 'number' || Number.isNaN(id)) return undefined
    const d = await open()
    return tx(d, table, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>)
  },

  async put<T extends LocalRow>(
    table: TableName,
    value: Record<string, unknown> & { id?: number },
  ): Promise<T> {
    const d = await open()
    const stamp = nowIso()
    // Managed ids (max + 1) instead of IDB auto-increment: deterministic
    // across store clears (fake-indexeddb does not reset the counter).
    let id = value.id
    if (id === undefined) {
      const existing = await tx(d, table, 'readonly', (s) => s.getAll() as IDBRequest<LocalRow[]>)
      id = existing.length ? Math.max(...existing.map((r) => r.id)) + 1 : 1
    }
    const row = {
      ...value,
      id,
      created_at: stamp,
      updated_at: null,
    } as T
    await tx(d, table, 'readwrite', (s) => s.put(row) as IDBRequest<IDBValidKey>)
    return row
  },

  async patch<T extends LocalRow>(
    table: TableName,
    id: number,
    patch: Partial<T>,
  ): Promise<T | undefined> {
    const d = await open()
    const current = await tx(
      d,
      table,
      'readonly',
      (s) => s.get(id) as IDBRequest<T | undefined>,
    )
    if (current === undefined) return undefined
    const next = { ...current, ...patch, updated_at: nowIso() }
    await tx(d, table, 'readwrite', (s) => s.put(next) as IDBRequest<IDBValidKey>)
    return next
  },

  async byIndex<T extends LocalRow>(
    table: TableName,
    index: string,
    value: unknown,
  ): Promise<T[]> {
    const d = await open()
    return new Promise((resolve, reject) => {
      const t = d.transaction(table, 'readonly')
      const req = t.objectStore(table).index(index).getAll(value as IDBValidKey)
      req.onsuccess = () => resolve(req.result as T[])
      req.onerror = () => reject(req.error)
    })
  },

  /** Test helper — wipe every store. */
  async clearAll(): Promise<void> {
    const d = await open()
    await Promise.all(
      TABLES.map((t) =>
        tx(d, t, 'readwrite', (s) => s.clear() as IDBRequest<undefined>),
      ),
    )
  },
}
