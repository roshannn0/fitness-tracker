import { blankDay, newProfile, type DateKey, type Day, type Profile, type Records, type Session, type Unit } from './model.js'

const DB_NAME = 'dayline-fitness'
const DB_VERSION = 1
type Store = 'days' | 'sessions' | 'profile'

export function openStorage(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('days')) request.result.createObjectStore('days', { keyPath: 'date' })
      if (!request.result.objectStoreNames.contains('sessions')) {
        request.result.createObjectStore('sessions', { keyPath: 'id' }).createIndex('date', 'date')
      }
      if (!request.result.objectStoreNames.contains('profile')) request.result.createObjectStore('profile')
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Close other Dayline windows and reopen the tracker.'))
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
  })
}
function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('The save was interrupted.'))
  })
}
export async function readRecords(db: IDBDatabase): Promise<Records> {
  const tx = db.transaction(['days', 'sessions', 'profile'])
  const done = committed(tx)
  const days: IDBRequest<Day[]> = tx.objectStore('days').getAll()
  const sessions: IDBRequest<Session[]> = tx.objectStore('sessions').getAll()
  const profile: IDBRequest<Profile | undefined> = tx.objectStore('profile').get('main')
  await done
  return { days: days.result, sessions: sessions.result, profile: profile.result ?? newProfile() }
}
function change<T>(db: IDBDatabase, name: Store, key: string, update: (previous: T | undefined) => T) {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite')
    const store = tx.objectStore(name)
    const request: IDBRequest<T | undefined> = store.get(key)
    let updated: T
    let failure: unknown
    request.onsuccess = () => {
      try {
        updated = update(request.result)
        if (name === 'profile') store.put(updated, key)
        else store.put(updated)
      } catch (error) {
        failure = error
        tx.abort()
      }
    }
    tx.oncomplete = () => resolve(updated)
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('The save was interrupted.'))
  })
}
export const updateDay = (db: IDBDatabase, date: DateKey, update: (day: Day) => Day) =>
  change<Day>(db, 'days', date, day => update(day ?? blankDay(date)))
export function logDay(
  db: IDBDatabase, date: DateKey, update: (day: Day) => Day, preferred?: { id: string; unit: Unit },
) {
  if (!preferred) return updateDay(db, date, update)
  return new Promise<Day>((resolve, reject) => {
    const tx = db.transaction(['days', 'profile'], 'readwrite')
    const days = tx.objectStore('days')
    const profiles = tx.objectStore('profile')
    const dayRequest: IDBRequest<Day | undefined> = days.get(date)
    const profileRequest: IDBRequest<Profile | undefined> = profiles.get('main')
    let changed: Day
    let failure: unknown
    profileRequest.onsuccess = () => {
      try {
        const profile = profileRequest.result ?? newProfile()
        changed = update(dayRequest.result ?? blankDay(date))
        days.put(changed)
        profiles.put({ ...profile, preferredUnits: { ...profile.preferredUnits, [preferred.id]: preferred.unit } }, 'main')
      } catch (error) {
        failure = error
        tx.abort()
      }
    }
    tx.oncomplete = () => resolve(changed)
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('The save was interrupted.'))
  })
}
export const updateProfile = (db: IDBDatabase, update: (profile: Profile) => Profile) =>
  change<Profile>(db, 'profile', 'main', profile => update(profile ?? newProfile()))
export const updateSession = (db: IDBDatabase, id: string, update: (session: Session | undefined) => Session) =>
  change<Session>(db, 'sessions', id, update)
export async function restore(db: IDBDatabase, records: Records) {
  const tx = db.transaction(['days', 'sessions', 'profile'], 'readwrite')
  const done = committed(tx)
  try {
    const days = tx.objectStore('days')
    const sessions = tx.objectStore('sessions')
    days.clear()
    sessions.clear()
    for (const day of records.days) days.add(day)
    for (const session of records.sessions) sessions.add(session)
    tx.objectStore('profile').put(records.profile, 'main')
  } catch (error) {
    tx.abort()
    await done.catch(() => undefined)
    throw error
  }
  await done
}
