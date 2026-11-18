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

async function beginLesson() {
  const key = ++runKey
  const isCurrent = () => runKey === key

  // Фразы предыдущего прогона больше не нужны.
  stopPhrases()
  loadingStatus.value = ''

  // Сброс предыдущего состояния.
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
    if (learnId == null) {
      failed = true
      if (isCurrent()) beginError.value = { message: 'Не удалось загрузить урок' }
    }
  } catch (e) {
    failed = true
    if (isCurrent()) beginError.value = errorMessage(e, 'Не удалось начать урок')
  }

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
    type: null,
    saved: false,
    published: false,
    taxonomy_ids: null,
    complexity: null,
    blocks: (data.blocks ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(b => toBlockModel(b, origin))
  }
})

const loadError = computed(() => beginError.value || snapshotError.value)
const canRetry = computed(() => {
  const status = getStatus(loadError.value)
  return status != null && status < 500
})

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
          :model-value="lessonModel"
          :struct-items="[]"
          :is-read-only="false"
          mode="learn"
        />
      </div>
    </main>
  </div>
</template>
