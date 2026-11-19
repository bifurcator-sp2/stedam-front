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
} | null>(null)

// Ответы прохождения (по документу штрихов на доску, в порядке блоков).
// ConstructorLesson раздаёт их доскам через реестр lesson-whiteboards.
const answers = ref<InkDocument[]>([])
// Высоты досок ответов (px) в том же порядке; null — высота неизвестна.
const whiteboardHeights = ref<(number | null)[]>([])

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

function toHeights(answers: InkDocument[]): (number | null)[] {
  return answers.map(heightOf)
}

async function loadAnswers(userId: number, learnId: number): Promise<InkDocument[]> {
  try {
    return toAnswers(await learnApi.getAnswers(userId, learnId))
  } catch {
    return []
  }
}

// Высоты досок текущего урока — параллельно штрихам (индекс = порядок блоков).
function currentWhiteboardHeights(): (number | null)[] {
  return lessonRef.value?.getWhiteboardHeights?.() ?? []
}

// begin мог не вернуть learn_id (например, сервер недоступен): ответы всё равно
// лежат локально — берём их из кэша по последнему известному прохождению урока.
async function loadCachedAnswers(): Promise<InkDocument[]> {
  const userId = currentUserId()
  if (userId === null) return []
  try {
    const record = await useLearnDBcache().getLearn(userId, props.lessonId)
    return toAnswers(record?.answers ?? [])
  } catch {
    return []
  }
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
  whiteboardHeights.value = []
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

  if (!failed && learnId != null) {
    const userId = currentUserId()
    answers.value = userId !== null
      ? await loadAnswers(userId, learnId)
      : []
  } else {
    // Урока нет, но нарисованное могло сохраниться локально раньше.
    answers.value = await loadCachedAnswers()
  }
  whiteboardHeights.value = toHeights(answers.value)
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
    snapshot.value = await learnApi.snapshot(learnId!)
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
  const savedAnswers: InkDocument[] = lessonRef.value?.getWhiteboardStrokes?.() ?? []
  const savedHeights = currentWhiteboardHeights()
  const startedAt = Date.now()

  try {
    await learnApi.saveLearn(learnId, savedAnswers, true, savedHeights)
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

  const savedAnswers: InkDocument[] = lessonRef.value?.getWhiteboardStrokes?.() ?? []
  const savedHeights = currentWhiteboardHeights()
  const startedAt = Date.now()
  let failed = false

  try {
    if (learnId == null) throw new Error('Не удалось определить прохождение урока')
    await learnApi.saveLearn(learnId, savedAnswers, silent, savedHeights)
  } catch (e) {
    failed = true
    toast.add({
      title: 'Не удалось сохранить урок',
      description: String(messageOf(e, 'Не удалось сохранить урок')),
      color: 'error',
    })
  }

  // Прелоадер шага живёт реальное время ответа + секунду.
  await delay(MIN_STAGE_MS - (Date.now() - startedAt))

  savePending.value = false
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
          :whiteboard-heights="whiteboardHeights"
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
            :disabled="loading || savePending"
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
          >
            Отправить на проверку
          </UButton>
        </div>
      </div>
    </main>
  </div>
</template>
