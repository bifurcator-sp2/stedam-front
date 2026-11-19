// app/composables/useLearnDBcache.ts
//
// Кэш данных прохождения в IndexedDB.
// БД: stedam
//   lesson_snapshots — ключ [user_id, learn_id]
//   learns           — ключ [user_id, id], индекс by_user_lesson по [user_id, lesson_id]
//
// Все операции "мягкие": если IndexedDB недоступен (приватный режим, ошибка
// открытия БД) — чтение возвращает null, запись молча пропускается.

import type { LearnSnapshotData } from '~/composables/useLearnApi'

const DB_NAME = 'stedam'
const DB_VERSION = 2
const SNAPSHOT_STORE = 'lesson_snapshots'
const LEARN_STORE = 'learns'
const USER_LESSON_INDEX = 'by_user_lesson'

export interface LessonSnapshotRecord {
  user_id: number
  lesson_id: number
  learn_id: number
  // Строка-хэш снапшота (как пришла с сервера)
  snapshot: string
  // JSON снапшота — 1:1 как его отдал сервер
  snapshot_data: LearnSnapshotData | string
}

export interface LearnQuestion {
  index: number
  question: string
  answer: string
  solution: string
  topic: string
  difficulty: number
  seed: number
}

export interface LearnAnswer {
  [key: string]: unknown
}

// Запись о прохождении — в точности объект, который отдал /learn/begin.
export interface LearnRecord {
  id: number
  user_id: number
  lesson_id: number
  status: string
  status_date: string
  schedule_date: string | null
  lesson_snapshot: string
  score: number | null
  graded_by: number | null
  questions: LearnQuestion[]
  answers: LearnAnswer[]
  complete_date: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          const store = db.createObjectStore(SNAPSHOT_STORE, {
            keyPath: ['user_id', 'learn_id'],
          })
          store.createIndex(USER_LESSON_INDEX, ['user_id', 'lesson_id'], { unique: false })
        }
        if (!db.objectStoreNames.contains(LEARN_STORE)) {
          const store = db.createObjectStore(LEARN_STORE, {
            keyPath: ['user_id', 'id'],
          })
          store.createIndex(USER_LESSON_INDEX, ['user_id', 'lesson_id'], { unique: false })
        }
      }

      request.onsuccess = () => {
        const db = request.result
        // Если БД закрыли извне — пересоздадим соединение при следующем обращении.
        db.onclose = () => {
          dbPromise = null
        }
        resolve(db)
      }
      request.onerror = () => {
        dbPromise = null
        reject(request.error)
      }
    })
  }
  return dbPromise
}

// Чтение записи по ключу [user_id, ...key].
async function readRecord<T>(storeName: string, key: [number, number]): Promise<T | null> {
  try {
    const db = await openDb()
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const request = tx.objectStore(storeName).get(key)
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null)
      request.onerror = () => reject(request.error)
    })
  } catch {
    return null
  }
}

// Чтение по вторичному индексу by_user_lesson ([user_id, lesson_id]).
async function readRecordByUserLesson<T>(
  storeName: string,
  userId: number,
  lessonId: number,
): Promise<T | null> {
  try {
    const db = await openDb()
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const request = tx
        .objectStore(storeName)
        .index(USER_LESSON_INDEX)
        .get([userId, lessonId])
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null)
      request.onerror = () => reject(request.error)
    })
  } catch {
    return null
  }
}

async function writeRecord(storeName: string, record: unknown): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      tx.objectStore(storeName).put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } catch {
    // Не смогли сохранить кэш — не мешаем отдать данные пользователю.
  }
}

export const useLearnDBcache = () => {
  function getSnapshot(
    userId: number,
    learnId: number,
  ): Promise<LessonSnapshotRecord | null> {
    return readRecord<LessonSnapshotRecord>(SNAPSHOT_STORE, [userId, learnId])
  }

  function putSnapshot(record: LessonSnapshotRecord): Promise<void> {
    return writeRecord(SNAPSHOT_STORE, record)
  }

  function getLearn(userId: number, lessonId: number): Promise<LearnRecord | null> {
    return readRecordByUserLesson<LearnRecord>(LEARN_STORE, userId, lessonId)
  }

  function putLearn(record: LearnRecord): Promise<void> {
    return writeRecord(LEARN_STORE, record)
  }

  // Ответы из записи learns по ключу [user_id, id]. Нет записи — пустой массив.
  async function getAnswers(userId: number, learnId: number): Promise<unknown[]> {
    const record = await readRecord<LearnRecord>(LEARN_STORE, [userId, learnId])
    return Array.isArray(record?.answers) ? record.answers : []
  }

  // Обновляет только поле answers в записи learns ([user_id, id]).
  // Если записи ещё нет — создаём её из переданного ответа /learn/begin.
  // Мягко: ошибки IndexedDB не всплывают наружу.
  async function updateLearnAnswers(
    userId: number,
    learnId: number,
    answers: unknown[],
  ): Promise<void> {
    try {
      const db = await openDb()
      const existing = await new Promise<LearnRecord | null>((resolve, reject) => {
        const tx = db.transaction(LEARN_STORE, 'readonly')
        const request = tx.objectStore(LEARN_STORE).get([userId, learnId])
        request.onsuccess = () => resolve((request.result as LearnRecord | undefined) ?? null)
        request.onerror = () => reject(request.error)
      })

      const record = (existing ?? {
        id: learnId,
        user_id: userId,
      } as LearnRecord)

      await writeRecord(LEARN_STORE, { ...record, user_id: userId, id: learnId, answers })
    } catch {
      // Не смогли обновить кэш — не мешаем сохранению.
    }
  }

  return { getSnapshot, putSnapshot, getLearn, putLearn, getAnswers, updateLearnAnswers }
}
