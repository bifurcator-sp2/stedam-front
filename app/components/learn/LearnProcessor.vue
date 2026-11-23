<!-- app/components/learn/LearnProcessor.vue -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { LessonModel, LessonBlockModel } from '~/types/lesson'
import type { SettingNode } from '~/utils/constructors'
import type {
  LearnSnapshotBlock,
  LearnSnapshotData,
  LearnSnapshotResponse
} from '~/composables/useLearnApi'
import type { LearnRecord } from '~/composables/useLearnDBcache'
import type { InkDocument } from '~/types/ink'
import { loadingPhrases } from '~/utils/loadingPhrases'

// Папка learn/ может конфликтовать с приватной директорией Nuxt,
// поэтому имя компонента задаём явно, чтобы не зависеть от авто-импорта.
defineOptions({ name: 'LearnProcessor' })

const props = defineProps<{
  lessonId: number
}>()

const router = useRouter()
const learnApi = useLearnApi()
const runtimeConfig = useRuntimeConfig()
const toast = useToast()

// Ref на ConstructorLesson: через него забираем штрихи всех белых досок урока.
const lessonRef = ref<{
  getWhiteboardStrokes?: () => InkDocument[]
  getWhiteboardHeights?: () => (number | null)[]
  /** Реальные ширины досок (px), порядок блоков. */
  getWhiteboardWidths?: () => (number | null)[]
  /** Позиции линий «Зона ответа» досок (px от верхнего края), порядок блоков. */
  getWhiteboardAnswerSizes?: () => number[]
  /** Отступы «полей тетради» досок (px от правого края), порядок блоков. */
  getWhiteboardMarginSizes?: () => number[]
  applyWhiteboardHeights?: (heights: (number | null)[] | null) => void
  /** Выставить доскам отступы «полей тетради» из сохранённого прохождения. */
  applyWhiteboardMargins?: (margins: (number | null)[] | null) => void
} | null>(null)

// Ответы прохождения (по документу штрихов на доску, в порядке блоков).
// ConstructorLesson раздаёт их доскам через реестр lesson-whiteboards.
const answers = ref<InkDocument[]>([])
// Высоты досок читаются у досок по событию ресайза (и перед сохранением) —
// отдельный массив высот не храним и событиями не прокидываем.

// Origin бэкенда: к нему приводим относительные '/storage/...' из снапшота.
const storageOrigin = computed(() => {
  const base = runtimeConfig.public.apiBase as string
  const baseUrl = import.meta.client
    ? new URL(base, window.location.href)
    : new URL(base, 'http://localhost')

  return baseUrl.origin
})

// ==================== Старт прохождения (POST /learn/begin) ====================

const beginPending = ref(false)
const beginResult = ref<unknown>(null)
const beginError = ref<unknown>(null)

// Сохранённый экземпляр learn (IndexedDB: user_id + learn_id после begin).
// Его answers[i].whiteboard_height — единственный источник высот досок:
// высоты из прохождения выставляются доскам перед снятием прелоадера.
const learnRecord = ref<LearnRecord | null>(null)

// Высоты досок из сохранённого learn. Уже проставленные высоты не перетираем
// пустым значением. Выставлены ли они хоть раз — помним, чтобы «реальные»
// высоты досок при сохранении (getHeight) их не заменили.
const lessonHeights = ref<(number | null)[]>([])
const heightsApplied = ref(false)

// Снимок прохождения: GET /learn/snapshot/{learn}
const snapshotPending = ref(false)
const snapshot = ref<LearnSnapshotResponse | null>(null)
const snapshotError = ref<unknown>(null)

function getStatus(e: unknown): number | undefined {
  const err = e as { status?: number, statusCode?: number, response?: { status?: number } } | null
  return err?.status ?? err?.statusCode ?? err?.response?.status
}

function errorMessage(e: unknown, fallback: string): unknown {
  const status = getStatus(e)
  if (status != null && status >= 500) return { message: 'Ошибка сервера' }
  return e ?? { message: fallback }
}

function messageOf(e: unknown, fallback: string): string {
  if (!e || typeof e !== 'object') return typeof e === 'string' ? e : fallback
  const err = e as { data?: { message?: string }, message?: string }
  return err.data?.message || err.message || fallback
}

// Сколько шаг загрузки висит сверх реального времени ответа.
const MIN_STAGE_MS = 1000

// Что показываем в прелоадере. Объявлено до beginLesson: первые значения
// должны существовать к моменту вызова из watch, иначе TDZ-ошибка на старте.
const loading = ref(false)
const loadingAction = ref('')
// Меняющаяся строка под логотипом: фразы из loadingPhrases.
const loadingStatus = ref('')

// Темп смены фраз и сколько последняя надпись висит перед снятием оверлея.
const PHRASE_MS = 100
const FINAL_PHRASE_MS = 350

// Минимальная видимость индикатора фонового сохранения в кнопке.
const SILENT_INDICATOR_MS = 100

function setStage(action: string) {
  loadingAction.value = action
  loading.value = true
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Отдельный тик: Vue успевает применить патч, и директива получает
// value=false раньше, чем loading поднимется с новой подписью.
function tick(): Promise<void> {
  return delay(0)
}

// Номер прогона: действия устаревших запросов после рестарта игнорируются.
let runKey = 0

// id текущего прохождения (из POST /learn/begin) — нужен для сохранения.
// ref, а не let: writeLearnId меняет его позже, после await в beginLesson,
// и «сырая» переменная в шаблоне/обработчиках осталась бы null.
const currentLearnId = ref<number | null>(null)

// Защита от повторного нажатия «Сохранить», пока идёт сохранение.
const savePending = ref(false)
// Фоновая (тихая) запись ответов: индикация в кнопке, без оверлея.
const silentPending = ref(false)

// Гасим цикл фраз, когда шаг закончился (или его сменил новый прогон).
let phraseTimer: ReturnType<typeof setTimeout> | null = null

function stopPhrases() {
  if (phraseTimer == null) return
  clearTimeout(phraseTimer)
  phraseTimer = null
}

// Крутит фразы загрузчика, пока шаг идёт. Последняя фраза в цикле не показывается:
// она отдаётся отдельно на FINAL_PHRASE_MS уже после основного таймера шага,
// чтобы «загрузка завершена» совпала с финалом.
function startPhrases(isCurrent: () => boolean) {
  stopPhrases()
  const phrases = loadingPhrases.slice(0, -1)
  let i = 0

  const step = () => {
    if (!isCurrent() || !loading.value) {
      phraseTimer = null
      return
    }

    loadingStatus.value = phrases[i % phrases.length]!
    i++
    phraseTimer = setTimeout(step, PHRASE_MS)
  }

  step()
}

// Достаёт id прохождения из ответа POST /learn/begin.
// StartLearnAction возвращает LearnResource: { id, ... }
function learnIdFrom(res: Awaited<ReturnType<typeof learnApi.begin>> | null): number | null {
  const body = res?.data ?? res
  const raw = body?.learn_id ?? body?.learn ?? body?.id ?? res?.id
  const n = Number(raw)
  return raw != null && Number.isFinite(n) ? n : null
}

function currentUserId(): number | null {
  const { user } = useSanctumAuth<{ id: number }>()
  return user.value?.id ?? null
}

// Ответы из кэша приводит к массиву InkDocument: пустые/битые пропускаем,
// а строку (если пришла JSON-строкой) разбираем.
function toAnswers(raw: unknown[]): InkDocument[] {
  return raw
    .map(item => {
      if (typeof item === 'string') {
        try { return JSON.parse(item) as InkDocument } catch { return null }
      }
      return item as InkDocument
    })
    .filter((d): d is InkDocument => !!d && Array.isArray((d as InkDocument).strokes))
}

// Высота доски лежит в самом документе ответа: answers[i].whiteboard_height.
function heightOf(doc: InkDocument | undefined): number | null {
  const raw = (doc as { whiteboard_height?: unknown } | undefined)?.whiteboard_height
  const n = Number(raw)
  return raw != null && Number.isFinite(n) ? n : null
}

// Отступ «полей тетради» лежит в документе ответа: answers[i].margin_size.
function marginOf(doc: InkDocument | undefined): number | null {
  const raw = (doc as { margin_size?: unknown } | undefined)?.margin_size
  const n = Number(raw)
  return raw != null && Number.isFinite(n) ? n : null
}

// Ширина доски лежит в самом документе ответа: answers[i].whiteboard_width.
// Нужна как запасное значение: живой замер ширины берём у самой доски.
function widthOf(doc: InkDocument | undefined): number | null {
  const raw = (doc as { whiteboard_width?: unknown } | undefined)?.whiteboard_width
  const n = Number(raw)
  return raw != null && Number.isFinite(n) ? n : null
}

async function loadAnswers(userId: number, learnId: number): Promise<InkDocument[]> {
  try {
    return toAnswers(await learnApi.getAnswers(userId, learnId))
  } catch {
    return []
  }
}

// Сохранённый экземпляр learn (после begin он уже лежит в IndexedDB).
// Ключ поиска в кэше — [user_id, lesson_id], поэтому передаём id урока,
// а не id прохождения (learn_id).
async function loadLearnRecord(userId: number, lessonId: number): Promise<LearnRecord | null> {
  try {
    return await useLearnDBcache().getLearn(userId, lessonId)
  } catch {
    return null
  }
}

// Высоты досок из сохранённого экземпляра learn (источник — whiteboard_height
// документов ответов, в порядке блоков). Пустые значения не затирают уже известные.
function heightsFromRecord(record: LearnRecord | null): (number | null)[] {
  const docs = toAnswers(record?.answers ?? [])
  return docs.map((doc, i) => heightOf(doc) ?? lessonHeights.value[i] ?? null)
}

// Выставить высоты из сохранённого learn всем доскам ConstructorLesson.
// Каждая доска получает свою высоту напрямую (Whiteboard.setHeight) — без эмита
// 'resize', поэтому это не считается жестом пользователя и не запускает
// тихое сохранение. Порядок — как у урока: доски ConstructorLesson отдаёт
// по порядку блоков, индекс совпадает с индексом документа ответа.
function applyLessonHeights() {
  const heights = heightsFromRecord(learnRecord.value)
  lessonRef.value?.applyWhiteboardHeights?.(heights)
  heightsApplied.value = true
}

// Отступы «полей тетради» из сохранённого прохождения (margin_size документов
// ответов, порядок блоков). Доскам ставятся напрямую, без эмита 'marginSizeChange':
// это не жест пользователя и не должно запускать тихое сохранение.
function applyLessonMargins() {
  const docs = toAnswers(learnRecord.value?.answers ?? [])
  if (!docs.length) return
  lessonRef.value?.applyWhiteboardMargins?.(docs.map(marginOf))
}

// Ответы с позициями линий «Зона ответа» и отступами «полей тетради»:
// доски спрашиваем напрямую (Whiteboard.getAnswerSize / getMarginSize) в том же
// порядке, что и штрихи, и пишем их рядом со strokes — answers[i].answer_size и
// answers[i].margin_size. Остальные поля документа не трогаем.
function withAnswerSizes(docs: InkDocument[]): InkDocument[] {
  const sizes = lessonRef.value?.getWhiteboardAnswerSizes?.() ?? []
  const margins = lessonRef.value?.getWhiteboardMarginSizes?.() ?? []
  return docs.map((doc, i) => {
    const size = Number(sizes[i])
    const margin = Number(margins[i])
    const next: InkDocument = { ...doc }
    if (Number.isFinite(size)) next.answer_size = size
    if (Number.isFinite(margin)) next.margin_size = margin
    return next
  })
}

// Высоты досок для сохранения. Доски спрашиваем напрямую (Whiteboard.getHeight)
// в порядке блоков — одинаковом с порядком штрихов. Но пока неинициализированные
// доски не отрисованы, getHeight может вернуть 0 (или высоту не по прохождению):
// такие значения берём из сохранённого learn / документа ответа, чтобы
// выставленная при загрузке высота не затёрлась пустой.
function currentWhiteboardHeights(docs: InkDocument[]): (number | null)[] {
  const actual = lessonRef.value?.getWhiteboardHeights?.() ?? []
  if (!actual.length && !heightsApplied.value) return docs.map(heightOf)

  return docs.map((doc, i) => {
    const measured = Number(actual[i])
    if (Number.isFinite(measured) && measured > 0) return measured
    return lessonHeights.value[i] ?? heightOf(doc)
  })
}

// Ширины досок для сохранения: реальная ширина каждой доски (getWidth) на
// момент сохранения/отправки, порядок блоков. Если доска ещё не отрисована
// (getWidth вернул 0) — берём ширину из документа ответа, чтобы не затереть
// сохранённое значение пустым.
function currentWhiteboardWidths(docs: InkDocument[]): (number | null)[] {
  const actual = lessonRef.value?.getWhiteboardWidths?.() ?? []
  return docs.map((doc, i) => {
    const measured = Number(actual[i])
    if (Number.isFinite(measured) && measured > 0) return measured
    return widthOf(doc)
  })
}

// begin мог не вернуть learn_id (например, сервер недоступен): ответы всё равно
// лежат локально — берём их из кэша по последнему известному прохождению урока.
async function loadCachedAnswers(): Promise<InkDocument[]> {
  return toAnswers((await cachedLearnRecord())?.answers ?? [])
}

// Последняя сохранённая запись прохождения этого урока (IndexedDB).
async function cachedLearnRecord(): Promise<LearnRecord | null> {
  const userId = currentUserId()
  if (userId === null) return null
  try {
    return await useLearnDBcache().getLearn(userId, props.lessonId)
  } catch {
    return null
  }
}

// id прохождения без begin: из последней записи урока в кэше.
async function cachedLearnId(): Promise<number | null> {
  return (await cachedLearnRecord())?.id ?? null
}

async function beginLesson() {
  const key = ++runKey
  const isCurrent = () => runKey === key

  // Фразы предыдущего прогона больше не нужны.
  stopPhrases()
  loadingStatus.value = ''

  // Сброс предыдущего состояния.
  currentLearnId.value = null
  answers.value = []
  learnRecord.value = null
  lessonHeights.value = []
  heightsApplied.value = false
  snapshot.value = null
  snapshotError.value = null
  beginError.value = null
  beginResult.value = null

  // Шаг «Обработка данных»: поднимаем прелоадер и сразу идём в запрос.
  setStage('Обработка данных')
  beginPending.value = true

  let learnId: number | null = null
  let failed = false
  const startedAt = Date.now()

  try {
    learnId = learnIdFrom(await learnApi.begin(props.lessonId))
    currentLearnId.value = learnId
    if (learnId == null) {
      failed = true
      if (isCurrent()) beginError.value = { message: 'Не удалось загрузить урок' }
    }
  } catch (e) {
    failed = true
    if (isCurrent()) beginError.value = errorMessage(e, 'Не удалось начать урок')
  }

  // Ответы грузим только после успешного begin: нужен learn_id.
  // Ждём тик и читаем из локального кэша (IndexedDB).
  await tick()
  if (!isCurrent()) return

  // id прохождения: из begin, а если он его не вернул — из последней записи урока.
  const userId = currentUserId()
  const savedLearnId = learnId ?? await cachedLearnId()

  if (!failed && learnId != null) {
    answers.value = userId !== null
      ? await loadAnswers(userId, learnId)
      : []
  } else {
    // Урока нет, но нарисованное могло сохраниться локально раньше.
    answers.value = await loadCachedAnswers()
  }
  if (!isCurrent()) return

  // Сохранённый экземпляр learn: высоты досок (whiteboard_height ответов)
  // проставим доскам перед снятием прелоадера. Ключ кэша — [user_id, lesson_id]
  // (id урока из URL), а не learn_id.
  learnRecord.value = userId !== null
    ? await loadLearnRecord(userId, props.lessonId)
    : null
  lessonHeights.value = heightsFromRecord(learnRecord.value)
  if (!isCurrent()) return

  // Прелоадер шага живёт реальное время ответа + секунду.
  await delay(MIN_STAGE_MS - (Date.now() - startedAt))
  if (!isCurrent()) return

  beginPending.value = false
  if (failed) {
    stopPhrases()
    loadingStatus.value = ''
    loading.value = false
    return
  }

  // Шаг «Загрузка урока»: сначала гасим прелоадер с уже отрисованным первым
  // шагом и отдаём директиве value=false, и только следующим тиком поднимаем
  // новый — иначе смена подписи и value=true схлопнутся в один патч,
  // и в оверлее останется старый текст.
  loading.value = false
  await tick()

  setStage('Загрузка урока')
  await tick()
  snapshot.value = null
  snapshotPending.value = true
  // Фразы идут параллельно запросу снапшота.
  startPhrases(isCurrent)
  const snapshotStartedAt = Date.now()

  try {
    // Без id из begin снимок берём по id сохранённого прохождения.
    snapshot.value = await learnApi.snapshot((learnId ?? savedLearnId)!)
  } catch (e) {
    if (isCurrent()) snapshotError.value = errorMessage(e, 'Не удалось загрузить урок')
  }

  // Прелоадер шага живёт реальное время ответа + секунду.
  await delay(MIN_STAGE_MS - (Date.now() - snapshotStartedAt))
  if (!isCurrent()) return

  // Финальная надпись из списка — на последние 350 мс перед снятием оверлея.
  stopPhrases()
  loadingStatus.value = loadingPhrases[loadingPhrases.length - 1]!
  await delay(FINAL_PHRASE_MS)
  if (!isCurrent()) return

  snapshotPending.value = false

  // Последний шаг закончился: даём готовому уроку/ошибке отрисоваться
  // под оверлеем, затем снимаем прелоадер: в одном патче директива
  // не получает value=false вместе со сменой содержимого.
  await tick()
  if (!isCurrent()) return

  // Строго перед снятием прелоадера: доски ConstructorLesson (и вложенные
  // Whiteboard) получают высоты из сохранённого экземпляра learn.
  // Тик — доски уже отрисованы; во время задержки перед снятием оверлея
  // дорисовываем высоты ещё раз для досок, смонтированных позже.
  applyLessonHeights()
  await tick()
  if (!isCurrent()) return
  applyLessonHeights()

  // Розовая полоса «полей тетради» встаёт на сохранённый отступ (margin_size).
  applyLessonMargins()
  await tick()
  if (!isCurrent()) return
  applyLessonMargins()

  loading.value = false
}

watch(() => props.lessonId, beginLesson, { immediate: true })

// ==================== Модель для Lesson.vue ====================

// Снапшот приходит строкой, если json_decode на бэке не удался.
function parseSnapshot(raw: unknown): LearnSnapshotData | null {
  if (!raw) return null
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as LearnSnapshotData
    } catch {
      return null
    }
  }
  return raw as LearnSnapshotData
}

// Бэкенд хранит пути к файлам относительными ('/storage/...'), а раздаёт их сам,
// поэтому в уроке (SPA живёт на другом хосте) такие пути переводим на его origin.
function withStorageOrigin<T>(value: T, origin: string): T {
  if (!origin) return value

  if (typeof value === 'string') {
    return (value.startsWith('/storage/') ? origin + value : value) as T
  }

  if (Array.isArray(value)) {
    return value.map(item => withStorageOrigin(item, origin)) as T
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => [k, withStorageOrigin(v, origin)])
    ) as T
  }

  return value
}

function toBlockModel(b: LearnSnapshotBlock, origin: string): LessonBlockModel {
  const settings = withStorageOrigin(b.settings as SettingNode | null, origin)
  const node = settings && !Array.isArray(settings) ? settings : null
  const hasTestNode = node?.children?.some(
    c => c.key === 'testLabel' || c.key === 'test'
  ) ?? false

  return {
    localId: crypto.randomUUID(),
    id: b.id,
    blockId: null,
    blockTypeCode: b.code ?? '',
    settings,
    images: [],
    files: [],
    // is_proc — генеративная (процедурная) задача; наличие test — блок с заданием.
    isTest: b.is_proc || hasTestNode,
    isProc: b.is_proc,
    complexity: b.complexity ?? null
  }
}

const lessonModel = computed<LessonModel | null>(() => {
  const data = parseSnapshot(snapshot.value?.snapshot_data)
  if (!data) return null

  const origin = storageOrigin.value

  return {
    id: data.lesson_id ?? null,
    title: data.title ?? '',
    description: '',
    locale: data.locale || 'ru',
    type: data.type ?? null,
    saved: false,
    published: false,
    taxonomy_ids: data.taxonomy_ids ?? null,
    complexity: data.complexity ?? null,
    blocks: (data.blocks ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(b => toBlockModel(b, origin))
  }
})

// Справочник типов урока нужен ConstructorLesson, чтобы подписать type (код)
// человекочитаемым названием и цветом (см. currentType в Constructor/Lesson.vue).
const lessonTypes = computed(() => parseSnapshot(snapshot.value?.snapshot_data)?.lesson_types ?? [])

const loadError = computed(() => beginError.value || snapshotError.value)
const canRetry = computed(() => {
  const status = getStatus(loadError.value)
  return status != null && status < 500
})

// ==================== Сохранение ====================

// Тихая запись (сработала доска): фоном, без оверлея и без MIN_STAGE_MS —
// пользователь продолжает рисовать, индикация только в кнопке «Сохранить».
// Ошибки не показываем: следующая тихая запись или обычное сохранение повторит.
async function saveSilently() {
  const learnId = currentLearnId.value
  if (learnId == null || silentPending.value) return

  silentPending.value = true
  const savedAnswers = withAnswerSizes(lessonRef.value?.getWhiteboardStrokes?.() ?? [])
  const savedHeights = currentWhiteboardHeights(savedAnswers)
  const savedWidths = currentWhiteboardWidths(savedAnswers)
  const startedAt = Date.now()

  try {
    await learnApi.saveLearn(learnId, savedAnswers, true, savedHeights, savedWidths)
  } catch {
    // Молча: локальная запись saveLearn выполняется сама, оверлей не поднимаем.
  }

  // Запись в IndexedDB занимает миллисекунды — держим индикацию чуть дольше,
  // чтобы её вообще можно было заметить в кнопке.
  const elapsed = Date.now() - startedAt
  if (elapsed < SILENT_INDICATOR_MS) await delay(SILENT_INDICATOR_MS - elapsed)

  silentPending.value = false
}

// Сохраняет прохождение: собирает штрихи всех белых досок урока
// (в натуральном порядке — ConstructorLesson отдаёт их по порядку блоков)
// и отправляет в saveLearn.
// silent = true — сохраняем только локально, без запроса на сервер.
async function save(silent = false) {
  // Тихая запись не блокирует пользователя и не ждёт окончания загрузки урока.
  if (silent) {
    await saveSilently()
    return
  }

  if (loading.value || savePending.value) return

  const learnId = currentLearnId.value

  // Шаг «Сохранение урока»: поднимаем прелоадер и сразу идём в запрос.
  setStage('идет сохранение урока')
  loadingStatus.value = ''
  savePending.value = true

  const savedAnswers = withAnswerSizes(lessonRef.value?.getWhiteboardStrokes?.() ?? [])
  const savedHeights = currentWhiteboardHeights(savedAnswers)
  const savedWidths = currentWhiteboardWidths(savedAnswers)
  const startedAt = Date.now()

  try {
    if (learnId == null) throw new Error('Не удалось определить прохождение урока')
    await learnApi.saveLearn(learnId, savedAnswers, silent, savedHeights, savedWidths)
  } catch (e) {
    toast.add({
      title: 'Не удалось сохранить урок',
      description: String(messageOf(e, 'Не удалось сохранить урок')),
      color: 'error'
    })
  }

  // Прелоадер шага живёт реальное время ответа + секунду.
  await delay(MIN_STAGE_MS - (Date.now() - startedAt))

  savePending.value = false
  loadingStatus.value = ''
  await tick()
  loading.value = false
}

// ==================== Отправка на проверку ====================

// POST /learns/{learn}/done: переводит прохождение в статус done.
// Локальный кэш (IndexedDB) при этом не трогаем: статус в нём стареет,
// а актуальный сервер отдаёт в ответе LearnResource.
const donePending = ref(false)

async function submitForReview() {
  if (loading.value || savePending.value || donePending.value) return

  const learnId = currentLearnId.value

  // Шаг «Идет отправка задания на проверку»: поднимаем прелоадер и сразу идём в запрос.
  setStage('Идет отправка задания на проверку')
  loadingStatus.value = ''
  donePending.value = true

  // Тело запроса — то же, что уходит в save(): штрихи + позиции/поля, высоты и ширины досок.
  const savedAnswers = withAnswerSizes(lessonRef.value?.getWhiteboardStrokes?.() ?? [])
  const savedHeights = currentWhiteboardHeights(savedAnswers)
  const savedWidths = currentWhiteboardWidths(savedAnswers)
  const startedAt = Date.now()

  try {
    if (learnId == null) throw new Error('Не удалось определить прохождение урока')
    await learnApi.markDone(learnId, savedAnswers, savedHeights, savedWidths)
    toast.add({
      title: 'Задание отправлено на проверку',
      color: 'success'
    })
  } catch (e) {
    toast.add({
      title: 'Не удалось отправить задание на проверку',
      description: String(messageOf(e, 'Не удалось отправить задание на проверку')),
      color: 'error'
    })
  }

  // Прелоадер шага живёт реальное время ответа + секунду.
  await delay(MIN_STAGE_MS - (Date.now() - startedAt))

  donePending.value = false
  loadingStatus.value = ''
  await tick()
  loading.value = false
}

// ==================== Навигация ====================

function goBack() {
  router.push('/learn/select-lesson')
}
</script>

<template>
  <!-- Не короче вьюпорта, даже когда контента нет или идёт загрузка -->
  <div class="flex flex-col min-h-dvh bg-[var(--ui-bg,#ffffff)]">
    <!-- Шапка -->
    <header class="shrink-0 h-12 px-4 flex items-center justify-center border-b border-[var(--ui-border,#e5e7eb)]">
      <UButton
        icon="i-lucide-arrow-left"
        size="sm"
        color="neutral"
        variant="ghost"
        @click="goBack"
      >
        К списку уроков
      </UButton>
    </header>

    <!-- Контент -->
    <main class="flex-1 flex flex-col">
      <div
        v-stedam-loading="{ value: loading, action: loadingAction, statusText: loadingStatus }"
        class="relative flex-1 max-w-4xl w-full mx-auto p-4"
      >
        <!-- Ошибка старта / загрузки снимка -->
        <div
          v-if="loadError"
          class="flex flex-col items-center justify-center gap-2 min-h-[60vh] text-center"
        >
          <UIcon
            name="i-lucide-alert-triangle"
            class="size-8 text-error"
          />
          <p class="text-sm text-[var(--ui-text-muted,#6b7280)]">
            <!-- messageOf возвращает string, но страхуемся: объект в интерполяции дал бы "[object Object]" -->
            {{ String(messageOf(loadError, 'Не удалось загрузить урок')) || 'Не удалось загрузить урок' }}
          </p>
          <UButton
            v-if="canRetry"
            size="xs"
            color="neutral"
            variant="ghost"
            @click="beginLesson"
          >
            Попробовать снова
          </UButton>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            @click="goBack"
          >
            Вернуться к списку
          </UButton>
        </div>

        <!-- Урок -->
        <ConstructorLesson
          v-else-if="lessonModel"
          ref="lessonRef"
          :model-value="lessonModel"
          :answers="answers"
          :struct-items="[]"
          :lesson-types="lessonTypes"
          :is-read-only="false"
          mode="learn"
          @whiteboard-stroke-complete="save(true)"
        />

        <!-- Действия с уроком -->
        <div
          v-if="lessonModel"
          class="grid grid-cols-2 gap-3 mt-4"
        >
          <UButton
            :icon="silentPending ? 'i-lucide-loader-circle animate-spin' : 'i-lucide-save'"
            color="neutral"
            variant="soft"
            size="lg"
            block
            :disabled="loading || savePending || donePending"
            @click="save()"
          >
            {{ silentPending ? 'Сохранение…' : 'Сохранить' }}
          </UButton>
          <UButton
            icon="i-lucide-send"
            color="success"
            variant="solid"
            size="lg"
            block
            :disabled="loading || savePending || donePending"
            @click="submitForReview"
          >
            Отправить на проверку
          </UButton>
        </div>
      </div>
    </main>
  </div>
</template>
