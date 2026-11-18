<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import ConstructPanels from '~/components/Constructor/ConstructPanels.vue'
import CourseTheme, { lessonDragState } from '~/components/Constructor/CourseTheme.vue'
import LoadingOverlay from '~/components/LoadingOverlay.vue'
import type { LessonTypeOption } from '~/types/lesson'
import type { ThemeLesson, ThemeLessonDrag, ThemeModel } from '~/types/course'

// ==================== Зависимости ====================

const api = useApi()
const route = useRoute()
const toast = useToast()

// ==================== Константы контракта ====================

const TITLE_MAX = 255
const DESCRIPTION_MAX = 5000

// Множитель порога (threshold_multipler): доля > 0, дефолт 1.0.
// В UI показываем как есть, допустимый ввод: [0, 100).
const THRESHOLD_MIN = 0
const THRESHOLD_MAX = 100
const THRESHOLD_STEP = 0.1

// Время между уроками (time_gap_multipler): float, дефолт 1.0, допустимый ввод: [0, 100].
const TIME_GAP_MIN = 0
const TIME_GAP_MAX = 100
const TIME_GAP_STEP = 0.1
const TIME_GAP_DEFAULT = 1.0

interface TaxonomyNode {
  id: number
  parent_id: number | null
  title: string | null
  description: string | null
  children: TaxonomyNode[]
}

interface CourseDetail {
  id: number
  title: string
  description: string
  locale: string
  threshold_multipler: number
  time_gap_multipler: number
  tax_id: number | null
  published: boolean
  updated_at: string | null
  themes: unknown[]
  can?: {
    edit: boolean
    delete: boolean
    assign: boolean
    see_progress: boolean
  }
}

// ==================== Курс по ?id ====================

const courseId = computed<number | null>(() => {
  const raw = route.query.id
  const v = Array.isArray(raw) ? raw[0] : raw
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
})

async function fetchCourse(): Promise<CourseDetail | null> {
  if (courseId.value === null) return null
  const res = await api.get<{ data?: CourseDetail } | CourseDetail>(
    `/courses/${courseId.value}`,
    { silent: true }
  )
  return (res as { data?: CourseDetail })?.data ?? (res as CourseDetail)
}

const course = ref<CourseDetail | null>(null)
const coursePending = ref(false)
const courseError = ref<unknown>(null)

// Защита от гонки: обрабатываем только ответ последнего запроса
let courseRequestSeq = 0

async function loadCourse() {
  if (courseId.value === null) {
    courseRequestSeq++
    course.value = null
    coursePending.value = false
    return
  }

  const seq = ++courseRequestSeq
  coursePending.value = true
  courseError.value = null

  try {
    const res = await fetchCourse()
    if (seq === courseRequestSeq) course.value = res
  } catch (e) {
    if (seq === courseRequestSeq) courseError.value = e
  } finally {
    if (seq === courseRequestSeq) coursePending.value = false
  }
}

const refreshCourse = () => loadCourse()

watch(courseId, () => loadCourse(), { immediate: true })

const courseTaxId = computed<number | null>(() => course.value?.tax_id ?? null)

const centerTitle = computed(() =>
  course.value?.title
    ? `Курс №${courseId.value}: ${course.value.title}`
    : `Курс №${courseId.value ?? '—'}`
)

// ==================== Таксономия (крошки, только чтение) ====================

const taxonomyData = ref<TaxonomyNode[] | null>(null)

async function loadTaxonomy() {
  const res = await api.get<{ data: TaxonomyNode[] }>('/taxonomies/tree', { silent: true })
  taxonomyData.value = res.data
}

onMounted(() => {
  loadTaxonomy()
})

function findPath(nodes: TaxonomyNode[], targetId: number): TaxonomyNode[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return [node]
    if (node.children) {
      const path = findPath(node.children, targetId)
      if (path) return [node, ...path]
    }
  }
  return null
}

const currentTaxPath = computed<TaxonomyNode[]>(() => {
  if (courseTaxId.value === null || !taxonomyData.value?.length) return []
  return findPath(taxonomyData.value, courseTaxId.value) ?? []
})

// ==================== Форма редактирования ====================

interface CourseForm {
  title: string
  description: string
  threshold_multipler: number
  time_gap_multipler: number
}

const form = reactive<CourseForm>({
  title: '',
  description: '',
  threshold_multipler: 1.0,
  time_gap_multipler: TIME_GAP_DEFAULT
})

const snapshot = ref<CourseForm>({ ...form })

// Целевое состояние публикации (меняется переключателем, применяется основным сохранением).
const published = ref(false)

watch(course, (c) => {
  if (!c) return
  form.title = c.title ?? ''
  form.description = c.description ?? ''
  form.threshold_multipler = c.threshold_multipler ?? 1.0
  form.time_gap_multipler = c.time_gap_multipler ?? TIME_GAP_DEFAULT
  published.value = c.published === true
  snapshot.value = { ...form }
}, { immediate: true })

// Опубликованный курс — только для чтения (как и опубликованный урок).
const isReadOnly = computed(() => published.value)

const canEdit = computed(() => course.value?.can?.edit !== false && !isReadOnly.value)

// Изменения шапки формы (без тем: их состав считается отдельно, см. themesDirty).
const headerDirty = computed(() =>
  form.title !== snapshot.value.title
  || form.description !== snapshot.value.description
  || form.threshold_multipler !== snapshot.value.threshold_multipler
  || form.time_gap_multipler !== snapshot.value.time_gap_multipler
)

// Любое изменение курса — шапка или темы — разблокирует сохранение.
const isDirty = computed(() => headerDirty.value || themesDirty.value)

// ==================== Валидация ====================

const titleError = computed(() => {
  const t = form.title.trim()
  if (t.length === 0) return 'Укажите название курса'
  if (t.length > TITLE_MAX) return `Не больше ${TITLE_MAX} символов`
  return null
})

const descriptionError = computed(() => {
  const d = form.description.trim()
  if (d.length === 0) return 'Укажите описание курса'
  if (d.length > DESCRIPTION_MAX) return `Не больше ${DESCRIPTION_MAX} символов`
  return null
})

const thresholdError = computed(() => {
  const v = form.threshold_multipler
  if (!Number.isFinite(v)) return 'Введите число'
  if (v < THRESHOLD_MIN || v >= THRESHOLD_MAX) {
    return `Значение не меньше ${THRESHOLD_MIN} и меньше ${THRESHOLD_MAX}`
  }
  return null
})

const timeGapError = computed(() => {
  const v = form.time_gap_multipler
  if (!Number.isFinite(v)) return 'Введите число'
  if (v < TIME_GAP_MIN || v > TIME_GAP_MAX) {
    return `Значение от ${TIME_GAP_MIN} до ${TIME_GAP_MAX}`
  }
  return null
})

const validationHint = computed(() => {
  if (titleError.value) return 'Укажите название курса'
  if (descriptionError.value) return 'Укажите описание курса'
  if (thresholdError.value) return 'Проверьте множитель порога допуска'
  if (timeGapError.value) return 'Проверьте время между уроками'
  return null
})

// ==================== Сохранение ====================

const saving = ref(false)

// Объявления порядка сохранения: снимок тем фиксируется ниже, когда themes
// уже инициализированы (иначе TDZ — обращение к const до инициализации).
interface SaveOptions {
  /** Полное сохранение всей шапки (все поля), а не только изменённых. */
  full?: boolean
  /** Кастомные сообщения об успехе. */
  successToast?: { title: string, description: string, icon: string }
}

async function saveCourse(options: SaveOptions = {}): Promise<boolean> {
  if (saving.value || courseId.value === null) return false

  // Валидация нужна только для полей, которые реально отправляются.
  const validateAll = options.full === true || headerDirty.value

  if (validateAll && validationHint.value) {
    toast.add({
      title: 'Проверьте форму',
      description: validationHint.value,
      color: 'warning',
      icon: 'i-lucide-triangle-alert'
    })
    return false
  }

  saving.value = true

  try {
    // PATCH шапки: locale и таксономия не меняются.
    const payload: Record<string, unknown> = {}
    const wasPublished = course.value?.published === true

    if (options.full) {
      // Полное сохранение: все поля шапки + статус публикации.
      payload.title = form.title.trim()
      payload.description = form.description.trim()
      payload.threshold_multipler = form.threshold_multipler
      payload.time_gap_multipler = form.time_gap_multipler
      payload.published = published.value
      payload.themes = buildThemesPayload()
    } else {
      // Частичное сохранение: только изменённые поля.
      if (form.title !== snapshot.value.title) payload.title = form.title.trim()
      if (form.description !== snapshot.value.description) payload.description = form.description.trim()
      if (form.threshold_multipler !== snapshot.value.threshold_multipler) {
        payload.threshold_multipler = form.threshold_multipler
      }
      if (form.time_gap_multipler !== snapshot.value.time_gap_multipler) {
        payload.time_gap_multipler = form.time_gap_multipler
      }
      if (published.value !== wasPublished) payload.published = published.value
      if (themesDirty.value) payload.themes = buildThemesPayload()
    }

    if (!options.full && Object.keys(payload).length === 0) return true

    const res = await api.patch<{ data?: CourseDetail } | CourseDetail>(
      `/courses/${courseId.value}`,
      payload,
      { silent: true }
    )

    // Обновляем представление данными, которые вернул бэкенд.
    const saved = (res as { data?: CourseDetail })?.data ?? (res as CourseDetail)

    if (saved && typeof saved === 'object' && 'id' in saved) {
      course.value = saved
    } else {
      // Бэкенд не вернул объект курса — перечитываем его.
      await refreshCourse()
    }

    snapshot.value = { ...form }
    themesSnapshot.value = JSON.stringify(buildThemesPayload())

    toast.add({
      color: 'success',
      ...{
        title: 'Сохранено',
        description: 'Курс сохранен.',
        icon: 'i-lucide-check-circle',
        ...options.successToast,
      },
    })

    return true
  } catch (e: unknown) {
    console.error('[saveCourse] failed', e)

    const data = (e as { data?: { errors?: Record<string, string[]>, message?: string } })?.data
    const message = data?.errors
      ? Object.values(data.errors).flat().filter(Boolean).map(String)[0]
      : data?.message

    toast.add({
      title: 'Ошибка',
      description: message || 'Не удалось сохранить курс',
      color: 'error',
      icon: 'i-lucide-triangle-alert'
    })

    return false
  } finally {
    saving.value = false
  }
}

function resetForm() {
  form.title = snapshot.value.title
  form.description = snapshot.value.description
  form.threshold_multipler = snapshot.value.threshold_multipler
  form.time_gap_multipler = snapshot.value.time_gap_multipler
}

// ==================== Статус публикации ====================

async function togglePublished() {
  if (saving.value || courseId.value === null) return

  const next = !published.value

  // Меняем целевое состояние и вызываем полноценное сохранение (вся шапка + published).
  published.value = next

  const ok = await saveCourse({
    full: true,
    successToast: {
      title: next ? 'Курс опубликован' : 'Курс снят с публикации',
      description: next
        ? 'Курс стал доступен для назначения.'
        : 'Курс снова доступен для редактирования.',
      icon: next ? 'i-lucide-check-circle' : 'i-lucide-lock-open'
    }
  })

  // Если сохранение не удалось — откатываем переключатель.
  if (!ok) {
    published.value = course.value?.published === true
  }
}

// ==================== Превью урока в правой панели ====================

const selectedLessonId = ref<number | null>(null)

function onSelectLesson(id: number) {
  selectedLessonId.value = selectedLessonId.value === id ? null : id
}

// ==================== Темы курса (drop-area) ====================

interface DraggedLessonSource {
  id: number
  title: string | null
  description: string | null
  blocks_count: number
  saved: boolean
  published: boolean
  created_at: string | null
  updated_at: string | null
  taxonomy_ids?: number[]
  type?: string | null
}

const themes = ref<ThemeModel[]>([])

// Тело темы для PATCH: уроки — массив id, time_gaps — интервалы параллельно урокам.
interface ThemePayload {
  id: number | null
  title: string
  lessons: number[]
  time_gaps: number[]
}

// Состав тем в том виде, в котором он уходит на сервер (для сравнения изменений).
function buildThemesPayload(): ThemePayload[] {
  return themes.value.map((theme) => ({
    id: theme.id,
    title: theme.title,
    lessons: theme.lessons.map((l) => l.id),
    time_gaps: theme.lessons.map((l) => l.time_gap ?? 0),
  }))
}

const themesSnapshot = ref<string>(JSON.stringify(buildThemesPayload()))

const themesDirty = computed(() => JSON.stringify(buildThemesPayload()) !== themesSnapshot.value)

// ==================== Загрузка тем курса ====================

const THEME_LESSON_FIELDS = [
  'id', 'title', 'description', 'type', 'blocks_count',
  'saved', 'published', 'created_at', 'updated_at', 'taxonomy_ids', 'time_gap',
] as const

// Данные, доступные нормализатору уроков во время загрузки тем.
const courseLessonTypesCache = ref<LessonTypeOption[]>([])
const lessonRecordsCache = ref<Map<number, any>>(new Map())

// Ключ узла темы: id (серверный или локальный отрицательный при сохранении),
// пока id нет — localId.
function themeKey(theme: ThemeModel): string {
  return theme.id !== null ? `id:${theme.id}` : `local:${theme.localId}`
}

function toThemeLesson(raw: Record<string, any>): ThemeLesson {
  // Темы курса отдают только lesson_id (+ type_id), поэтому источник —
  // запись урока из списка, а type_id/lesson_id лишь уточняют её.
  const lessonId = Number(raw.id ?? raw.lesson_id)
  const record = Number.isFinite(lessonId)
    ? lessonRecordsCache.value.get(lessonId)
    : undefined

  const lesson = {} as Record<string, any>
  for (const key of THEME_LESSON_FIELDS) {
    const value = raw[key] ?? record?.[key]
    if (value !== undefined) lesson[key] = value
  }

  if (lesson.id === undefined && Number.isFinite(lessonId)) {
    lesson.id = lessonId
  }

  // type_id — id типа из справочника; мапим его на code.
  const typeId = Number(raw.type_id)
  if (lesson.type == null && Number.isFinite(typeId)) {
    const typeOption = courseLessonTypesCache.value.find((t) => t.id === typeId)
    if (typeOption) lesson.type = typeOption.code
  }

  return { ...(lesson as unknown as ThemeLesson), localId: crypto.randomUUID() }
}

function normalizeTheme(raw: Record<string, any>): ThemeModel {
  const lessons = Array.isArray(raw.lessons) ? raw.lessons.map(toThemeLesson) : []

  // time_gaps идут параллельно урокам темы — переносим разрыв в сам урок,
  // чтобы при следующем сохранении отправить его обратно без потерь.
  if (Array.isArray(raw.time_gaps)) {
    lessons.forEach((lesson, i) => {
      const gap = Number(raw.time_gaps[i])
      if (raw.time_gaps[i] != null && Number.isFinite(gap)) lesson.time_gap = gap
    })
  }

  return {
    id: typeof raw.id === 'number' ? raw.id : null,
    localId: crypto.randomUUID(),
    title: raw.title ?? '',
    description: raw.description ?? '',
    lessons,
  }
}

interface CourseThemesPayload {
  themes?: any[]
  lesson_types?: LessonTypeOption[]
}

interface CourseThemesResponse extends CourseThemesPayload {
  data?: CourseThemesPayload
}

// Записи уроков по id — нужны, чтобы показать в теме название, тип и число блоков:
// /courses/{id} отдаёт для уроков темы только lesson_id и type_id.
async function fetchLessonRecords(): Promise<Map<number, any>> {
  const res = await api.get<{ data?: any[] }>(
    '/lessons',
    { params: { page: 1, per_page: 200 }, silent: true },
  )
  const list = (res as any)?.data ?? []
  return new Map(list.map((l: any) => [l.id as number, l]))
}

async function fetchCourseThemes(): Promise<CourseThemesPayload> {
  if (courseId.value === null) return { themes: [], lesson_types: [] }

  let payload: Partial<CourseThemesPayload> = {}
  try {
    const res = await api.get<CourseThemesResponse>(
      `/courses/${courseId.value}`,
      { silent: true }
    )
    payload = (res?.data ?? res ?? {}) as Partial<CourseThemesPayload>
  } catch (e) {
    // Бэкенд может пока не отдавать темы — это не ошибка загрузки курса.
    console.warn('[fetchCourseThemes] themes unavailable', e)
    return { themes: [], lesson_types: [] }
  }

  const lessonTypes = payload.lesson_types?.length
    ? payload.lesson_types
    : await fetchLessonTypes()

  courseLessonTypesCache.value = lessonTypes

  // Темы курса содержат только lesson_id (+ type_id) — дополняем данными урока.
  const lessonRecords = await fetchLessonRecords()
  lessonRecordsCache.value = lessonRecords

  return {
    themes: (payload.themes ?? []).map(normalizeTheme),
    lesson_types: lessonTypes,
  }
}

// Справочник типов уроков — отдельным эндпоинтом (/courses/{id} его не отдаёт).
async function fetchLessonTypes(): Promise<LessonTypeOption[]> {
  try {
    const res = await api.get<{ data?: LessonTypeOption[] }>(
      '/lessons/types',
      { silent: true },
    )
    return (res?.data ?? []) as LessonTypeOption[]
  } catch (e) {
    console.warn('[fetchLessonTypes] lesson types unavailable', e)
    return []
  }
}

const courseThemesData = ref<CourseThemesPayload | null>(null)

// Защита от гонки при быстрой смене courseId
let themesRequestSeq = 0

async function loadCourseThemes() {
  const seq = ++themesRequestSeq

  try {
    const res = await fetchCourseThemes()
    if (seq === themesRequestSeq) courseThemesData.value = res
  } catch (e) {
    console.warn('[loadCourseThemes] failed', e)
  }
}

watch(courseId, () => loadCourseThemes(), { immediate: true })

watch(courseThemesData, (v) => {
  themes.value = (v?.themes ?? []).map((t) => ({ ...t }))
}, { immediate: true })

// После перечитывания тем с сервера фиксируем их как сохранённое состояние.
watch([courseId, courseThemesData], () => {
  themesSnapshot.value = JSON.stringify(buildThemesPayload())
})

const courseLessonTypes = computed<LessonTypeOption[]>(() =>
  courseThemesData.value?.lesson_types?.length
    ? courseThemesData.value.lesson_types
    : courseLessonTypesCache.value,
)

// ==================== Drag & drop уроков в темы ====================

const dropActive = ref(false)

// Drag, начатый внутри drop-зоны тем: при переходе на вложенную тему
// не должен сбрасывать подсветку родителя.
let dragDepth = 0

// Источник drag для зоны тем. Чужая форма payload (блок/задание) не принимается:
// в темы попадают только уроки.
function resolveLessonSource(): DraggedLessonSource | null {
  if (!import.meta.client) return null
  const native = (window as any).__draggedLessonSource as Partial<DraggedLessonSource> | null
  if (native && typeof native.id === 'number') return native as DraggedLessonSource

  const block = (window as any).__draggedBlockSource as { kind?: string, id?: unknown } | null
  if (block?.kind === 'lesson' && Number.isFinite(Number(block.id))) {
    return { id: Number(block.id) } as DraggedLessonSource
  }
  return null
}

// Полный payload урока для карточки темы: либо от источника drag, либо догружаем по id.
async function resolveDroppedLesson(): Promise<DraggedLessonSource | null> {
  const source = resolveLessonSource()
  if (!source) return null
  if (source.title !== undefined && source.blocks_count !== undefined) return source

  try {
    const res = await api.get<{ data?: Record<string, any> } | Record<string, any>>(
      `/lessons/${source.id}`,
      { silent: true }
    )
    const raw = (res as { data?: Record<string, any> })?.data ?? (res as Record<string, any>)
    const { blocks, lesson_types, ...rest } = raw
    return {
      ...rest,
      id: source.id,
      blocks_count: Array.isArray(blocks) ? blocks.length : 0,
    } as DraggedLessonSource
  } catch (e) {
    console.warn('[resolveDroppedLesson] failed', e)
    return null
  }
}

function hasComputedLessonFields(source: DraggedLessonSource): boolean {
  return source.title !== undefined && source.blocks_count !== undefined
}

// Опубликованный урок в курс не добавляется. Если published в payload нет — не блокируем
// на этапе наведения, решение принимается после загрузки урока.
function isDroppable(source: DraggedLessonSource | null): source is DraggedLessonSource {
  if (!source) return false
  if (!hasComputedLessonFields(source)) return true
  return isAcceptableLesson(source)
}

function onThemeDragEnter() {
  if (!canEdit.value || !isDroppable(resolveLessonSource())) return
  dragDepth++
  dropActive.value = true
}

function onThemeDragOver(e: DragEvent) {
  if (!canEdit.value) return
  const source = resolveLessonSource()
  if (!source) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = isDroppable(source) ? 'copy' : 'none'
  if (isDroppable(source)) dropActive.value = true
}

function onThemeDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dropActive.value = false
}

function resetDragState() {
  dragDepth = 0
  dropActive.value = false
}

async function onThemeDrop(e: DragEvent) {
  if (!canEdit.value) return
  resetDragState()
  if (!resolveLessonSource()) return
  e.preventDefault()

  const source = await resolveDroppedLesson()
  if (!source) return

  if (!canAcceptLesson(source)) return

  // Новая тема начиналась бы с домашней работы — запрещено.
  if (isHomeWorkLesson(source)) {
    rejectHomeWorkFirst()
    return
  }

  // Дроп вне темы — создаём новую тему с этим уроком.
  addTheme(source)
}
// Проверка урока перед добавлением в курс
function isAcceptableLesson(lesson: DraggedLessonSource): boolean {
  if (lesson.published !== true) return false
  return !isLessonAlreadyInCourse(lesson)
}

function rejectUnpublishedLesson(lesson: DraggedLessonSource) {
  toast.add({
    title: 'Урок не опубликован',
    description: `Урок №${lesson.id} не опубликован и не может быть добавлен в курс. Сначала опубликуйте его.`,
    color: 'warning',
    icon: 'i-lucide-lock',
  })
}

function rejectDuplicateLesson(lesson: DraggedLessonSource) {
  toast.add({
    title: 'Урок уже в курсе',
    description: `Урок №${lesson.id} уже добавлен в одну из тем курса.`,
    color: 'warning',
    icon: 'i-lucide-alert-circle',
  })
}

const HOME_WORK_TYPE = 'home_work'

function isHomeWorkLesson(lesson: { type?: string | null } | null | undefined): boolean {
  return lesson?.type === HOME_WORK_TYPE
}

// Домашняя работа не может быть первым уроком темы — тема должна
// начинаться с обычного урока.
function rejectHomeWorkFirst() {
  toast.add({
    title: 'Нельзя начать тему с домашней работы',
    description: 'Домашняя работа не может быть первым уроком темы. Добавьте её после обычного урока.',
    color: 'warning',
    icon: 'i-lucide-alert-circle',
  })
}

function isLessonAlreadyInCourse(lesson: DraggedLessonSource): boolean {
  return themes.value.some((t) => t.lessons.some((l) => l.id === lesson.id))
}

// Возвращает true, если урок можно добавить; иначе показывает причину отказа.
function canAcceptLesson(lesson: DraggedLessonSource): boolean {
  if (!isAcceptableLesson(lesson)) {
    if (lesson.published !== true) rejectUnpublishedLesson(lesson)
    else rejectDuplicateLesson(lesson)
    return false
  }
  return true
}

let lastLocalLessonId = 0

// Множитель времени курса: число из формы или дефолт для «битого» ввода.
function timeGapFactor(): number {
  const mult = Number(form.time_gap_multipler)
  return Number.isFinite(mult) && mult >= 0 ? mult : TIME_GAP_DEFAULT
}

// Обнуление до целого по правилам: 0 остаётся 0, (0, 1] → 1, больше 1 → ceil.
function ceilTimeGap(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (value <= 1) return 1
  return Math.ceil(value)
}

// Разрыв после урока (часы): справочный time_gap типа * множитель времени курса,
// результат приводится к целому (см. ceilTimeGap).
function lessonGap(type: string | null | undefined, factor = timeGapFactor()): number {
  const typeCode = type ?? null
  // Справочник типов объявлен ниже по файлу — при раннем вызове (TDZ) он недоступен.
  const types = loadedLessonTypes()
  const raw = types.find((t) => t.code === typeCode)?.time_gap
  const base = Number(raw)
  if (raw == null || !Number.isFinite(base) || base <= 0) return 0
  return ceilTimeGap(base * factor)
}

// Разрыв урока при выбранном множителе: сохранённое значение курса не переписываем,
// новое значение — если сохранённого ещё нет (урок ещё не сохранялся).
function lessonGapFor(lesson: ThemeLesson, factor: number): number {
  return lesson.time_gap ?? lessonGap(lesson.type, factor)
}

// Значение рефов справочника типов; пусто, пока их объявления
// (courseLessonTypesCache/courseLessonTypes) ещё не проинициализированы.
function loadedLessonTypes(): LessonTypeOption[] {
  try {
    return courseLessonTypes.value.length
      ? courseLessonTypes.value
      : courseLessonTypesCache.value
  } catch {
    return []
  }
}

function createLocalLesson(source: DraggedLessonSource): ThemeLesson {
  return {
    id: source.id > 0 ? source.id : --lastLocalLessonId,
    localId: crypto.randomUUID(),
    title: source.title ?? null,
    description: source.description ?? null,
    type: source.type ?? null,
    blocks_count: source.blocks_count ?? 0,
    saved: source.saved ?? false,
    published: source.published ?? false,
    created_at: source.created_at ?? null,
    updated_at: source.updated_at ?? null,
    taxonomy_ids: source.taxonomy_ids ?? [],
    time_gap: lessonGap(source.type),
  }
}

function createLocalTheme(lesson: ThemeLesson): ThemeModel {
  return {
    id: null,
    localId: crypto.randomUUID(),
    title: lesson.title?.trim() || 'Новая тема',
    description: '',
    lessons: [recalcLessonGap(lesson)],
  }
}

// Разрыв пересчитывается при переносе урока (тип прежний, множитель курса мог измениться).
function recalcLessonGap(lesson: ThemeLesson, factor = timeGapFactor()): ThemeLesson {
  return { ...lesson, time_gap: lessonGap(lesson.type, factor) }
}

// Пропорциональный пересчёт всех разрывов при смене множителя в шапке:
// time_gap = time_gap / старый множитель * новый множитель, с приведением к целому.
function rescaleThemesGaps(prevFactor: number, nextFactor: number) {
  if (prevFactor === nextFactor) return
  const scale = (gap: number | undefined, type: string | null | undefined) => {
    if (gap == null) return lessonGap(type, nextFactor)
    if (prevFactor === 0) return lessonGap(type, nextFactor)
    return ceilTimeGap(gap / prevFactor * nextFactor)
  }
  themes.value = themes.value.map((t) => ({
    ...t,
    lessons: t.lessons.map((l) => ({ ...l, time_gap: scale(l.time_gap, l.type) })),
  }))
}

// Смена множителя в шапке реактивно меняет разрывы по всем темам.
watch(
  () => form.time_gap_multipler,
  (next, prev) => {
    const prevFactor = Number(prev)
    rescaleThemesGaps(
      Number.isFinite(prevFactor) && prevFactor >= 0 ? prevFactor : TIME_GAP_DEFAULT,
      timeGapFactor(),
    )
  },
)

function addTheme(source: DraggedLessonSource, index?: number) {
  const theme = createLocalTheme(createLocalLesson(source))
  const at = index === undefined ? themes.value.length : Math.min(Math.max(index, 0), themes.value.length)
  const next = [...themes.value]
  next.splice(at, 0, theme)
  themes.value = next

  toast.add({
    title: 'Тема создана',
    description: 'Урок добавлен в новую тему. Укажите название и описание темы.',
    color: 'success',
    icon: 'i-lucide-check-circle',
  })
}

function addLessonToTheme(themeLocalId: string, source: DraggedLessonSource) {
  themes.value = themes.value.map((t) =>
    t.localId === themeLocalId
      ? { ...t, lessons: [...t.lessons, createLocalLesson(source)] }
      : t
  )
}

function onThemeUpdate(localId: string, value: ThemeModel) {
  themes.value = themes.value.map((t) => (t.localId === localId ? value : t))
}

function onRemoveLessonFromTheme(themeLocalId: string, lessonLocalId: string) {
  themes.value = themes.value.map((t) =>
    t.localId === themeLocalId
      ? { ...t, lessons: t.lessons.filter((l) => l.localId !== lessonLocalId) }
      : t
  )
}

// Перенос/перестановка урока между темами: убираем из исходной темы и вставляем
// в целевую по индексу (учитывая сдвиг, если тема та же).
function onInsertLesson(targetThemeLocalId: string, index: number, source: ThemeLessonDrag) {
  if (!canEdit.value) return

  const srcTheme = themes.value.find((t) => t.localId === source.themeLocalId)
  if (!srcTheme) return
  const moving = srcTheme.lessons.find((l) => l.localId === source.lessonLocalId)
  if (!moving) return

  const isSameTheme = source.themeLocalId === targetThemeLocalId
  const srcIndex = srcTheme.lessons.findIndex((l) => l.localId === source.lessonLocalId)

  // Индекс вставки корректируется при извлечении, если вставка правее извлечения
  // в той же теме.
  let insertAt = index
  if (isSameTheme && srcIndex !== -1 && srcIndex < index) insertAt = index - 1
  if (isSameTheme && insertAt === srcIndex) return // ничего не изменилось

  // Домашняя работа не может оказаться первым уроком темы.
  if (insertAt === 0 && isHomeWorkLesson(moving)) {
    rejectHomeWorkFirst()
    return
  }

  // Разные темы: убираем из исходной, вставляем в целевую.
  // Опустевшая исходная тема удаляется автоматически.
  const next = themes.value.flatMap((t) => {
    if (!isSameTheme && t.localId === source.themeLocalId) {
      const lessons = t.lessons.filter((l) => l.localId !== source.lessonLocalId)
      return lessons.length ? [{ ...t, lessons }] : []
    }
    if (t.localId === targetThemeLocalId) {
      const lessons = isSameTheme
        ? t.lessons.filter((l) => l.localId !== source.lessonLocalId)
        : [...t.lessons]
      lessons.splice(Math.min(Math.max(insertAt, 0), lessons.length), 0, recalcLessonGap(moving))
      return [{ ...t, lessons }]
    }
    return [t]
  })
  themes.value = next
}

function removeTheme(localId: string) {
  themes.value = themes.value.filter((t) => t.localId !== localId)
}

async function onThemeDropLesson(localId: string) {
  if (!canEdit.value) return
  const resolved = await resolveDroppedLesson()
  if (!resolved) return
  if (!canAcceptLesson(resolved)) return
  // Тема пустая — домашняя работа стала бы первым уроком.
  if (isHomeWorkLesson(resolved) && isThemeEmpty(localId)) {
    rejectHomeWorkFirst()
    return
  }
  addLessonToTheme(localId, resolved)
}

function isThemeEmpty(themeLocalId: string): boolean {
  const theme = themes.value.find((t) => t.localId === themeLocalId)
  return !theme || theme.lessons.length === 0
}

// Вставка урока, перетащенного из левой панели, сразу в позицию index темы.
async function onInsertLessonSource(themeLocalId: string, index: number, lessonId: number) {
  if (!canEdit.value) return
  // Догружаем полный payload по id (resolveDroppedLesson сам сходит за уроком).
  const lesson = await resolveDroppedLesson()
    ?? await fetchLessonById(lessonId)
  if (!lesson) return
  if (!canAcceptLesson(lesson)) return
  // Домашняя работа не может открывать тему.
  if (index === 0 && isHomeWorkLesson(lesson)) {
    rejectHomeWorkFirst()
    return
  }
  insertLessonToTheme(themeLocalId, index, createLocalLesson(lesson))
}

function insertLessonToTheme(themeLocalId: string, index: number, lesson: ThemeLesson) {
  themes.value = themes.value.map((t) => {
    if (t.localId !== themeLocalId) return t
    const lessons = [...t.lessons]
    lessons.splice(Math.min(Math.max(index, 0), lessons.length), 0, lesson)
    return { ...t, lessons }
  })
}

async function fetchLessonById(id: number): Promise<DraggedLessonSource | null> {
  try {
    const res = await api.get<{ data?: Record<string, any> } | Record<string, any>>(
      `/lessons/${id}`,
      { silent: true }
    )
    const raw = (res as { data?: Record<string, any> })?.data ?? (res as Record<string, any>)
    const { blocks, lesson_types, ...rest } = raw
    return {
      ...rest,
      id,
      blocks_count: Array.isArray(blocks) ? blocks.length : 0,
    } as DraggedLessonSource
  } catch (e) {
    console.warn('[fetchLessonById] failed', e)
    return null
  }
}

// Индекс разделителя, над которым сейчас hover/drag — для подсветки «вставить сюда».
const dividerHoverIndex = ref<number | null>(null)

// Перетаскиваемая тема (её localId) — для перестановки тем за ручку.
const draggedThemeLocalId = ref<string | null>(null)

function onThemeDragStart(localId: string) {
  if (!canEdit.value) return
  draggedThemeLocalId.value = localId
}

function onThemeDragEnd() {
  draggedThemeLocalId.value = null
  dividerHoverIndex.value = null
}

// Переставляет тему draggedLocalId на позицию index (вставка в список тем).
function reorderTheme(draggedLocalId: string, index: number) {
  const from = themes.value.findIndex((t) => t.localId === draggedLocalId)
  if (from === -1) return
  let to = index
  if (from < index) to = index - 1
  if (to === from) return
  const next = [...themes.value]
  const [moved] = next.splice(from, 1)
  if (!moved) return
  next.splice(to, 0, moved)
  themes.value = next
}

// Крайняя зона «создать новую тему» (перед первой / после последней).
const edgeHover = ref<'start' | 'end' | null>(null)

// Перетаскивание урока внутри конструктора тем (из карточки).
function getThemeLessonDrag(): ThemeLessonDrag | null {
  if (!import.meta.client) return null
  return ((window as any).__draggedThemeLesson as ThemeLessonDrag | null) ?? null
}

function onEdgeDragOver(e: DragEvent, position: 'start' | 'end') {
  if (!canEdit.value) return
  const isThemeDrag = draggedThemeLocalId.value !== null
  const isInternalLesson = getThemeLessonDrag() !== null
  const isLessonDrag = isDroppable(resolveLessonSource())
  if (!isThemeDrag && !isInternalLesson && !isLessonDrag) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = isThemeDrag || isInternalLesson ? 'move' : 'copy'
  edgeHover.value = position
}

function onEdgeDragLeave(position: 'start' | 'end') {
  if (edgeHover.value === position) edgeHover.value = null
}

// Перетаскивается урок из темы: края (верх/низ) работают как одна кнопка
// «сделать урок отдельной темой» — дроп в любой край выносит его в новую тему.
const edgeLessonDragActive = ref(false)

// Верхняя/нижняя зона подсвечены уроком из темы — доступна быстрая вставка.
const edgeLessonReady = computed<boolean>(() => edgeLessonDragActive.value && edgeHover.value !== null)

// Ключ темы-«черновика» этой вставки: после сохранения курса серверные id и
// localId темы переназначаются, поэтому запоминаем сгенерированный ключ узла
// (тот же, что передаётся в key), чтобы повторный дроп перемещал ту же тему.
const edgeLessonDraftKey = ref<string | null>(null)

function onEdgeLessonDragEnter() {
  if (!canEdit.value) return
  edgeLessonDragActive.value = true
}

function onEdgeLessonDragEnd() {
  edgeLessonDragActive.value = false
  edgeHover.value = null
  edgeLessonDraftKey.value = null
}

// Приземление урока из темы в крайнюю зону: исходная тема теряет урок,
// на его месте появляется новая тема. Повторный дроп в край переносит ту же тему.
function dropThemeLessonAtEdge(position: 'start' | 'end'): boolean {
  const internal = getThemeLessonDrag()
  if (!internal) return false

  const srcTheme = themes.value.find((t) => t.localId === internal.themeLocalId)
  const moving = srcTheme?.lessons.find((l) => l.localId === internal.lessonLocalId)
  if (!moving) return false
  if (isHomeWorkLesson(moving)) {
    rejectHomeWorkFirst()
    return false
  }

  ;(window as any).__draggedThemeLesson = null
  lessonDragState.value = null

  // Тема, созданная этой же вставкой, — повторный дроп: перемещаем её в край.
  const draftKey = edgeLessonDraftKey.value
  const draft = draftKey !== null
    ? themes.value.findIndex((t) => themeKey(t) === draftKey)
    : -1
  if (draft !== -1) {
    const next = [...themes.value]
    const [theme] = next.splice(draft, 1)
    if (!theme) return false
    next.splice(position === 'start' ? 0 : next.length, 0, theme)
    themes.value = next
    return true
  }

  // Убираем урок из исходной темы; опустевшую тему удаляем.
  const next = themes.value.flatMap((t) => {
    if (t.localId !== internal.themeLocalId) return [t]
    const lessons = t.lessons.filter((l) => l.localId !== internal.lessonLocalId)
    return lessons.length ? [{ ...t, lessons }] : []
  })
  const theme = createLocalTheme(moving)
  next.splice(position === 'start' ? 0 : next.length, 0, theme)
  themes.value = next
  edgeLessonDraftKey.value = themeKey(theme)
  return true
}

async function onEdgeDrop(e: DragEvent, position: 'start' | 'end') {
  e.stopPropagation()
  edgeHover.value = null
  const at = position === 'start' ? 0 : themes.value.length

  // Перетаскивается тема — перемещаем в начало/конец.
  if (draggedThemeLocalId.value) {
    e.preventDefault()
    const id = draggedThemeLocalId.value
    draggedThemeLocalId.value = null
    reorderTheme(id, at)
    return
  }

  if (!canEdit.value) return

  // Перетаскивается урок из темы — создаём новую тему в крайней позиции.
  if (getThemeLessonDrag()) {
    e.preventDefault()
    if (dropThemeLessonAtEdge(position)) return
    return
  }

  // Перетаскивается урок из левой панели — создаём новую тему в крайней позиции.
  e.preventDefault()
  const resolved = await resolveDroppedLesson()
  if (!resolved) return
  if (!canAcceptLesson(resolved)) return
  // Новая тема начиналась бы с домашней работы — запрещено.
  if (isHomeWorkLesson(resolved)) {
    rejectHomeWorkFirst()
    return
  }
  addTheme(resolved, at)
}

function canDropOnDivider(): boolean {
  if (!canEdit.value) return false
  if (draggedThemeLocalId.value) return true
  return isDroppable(resolveLessonSource())
}

function onDividerDragEnter(e: DragEvent, index: number) {
  if (!canDropOnDivider()) return
  e.preventDefault()
  dividerHoverIndex.value = index
}

function onDividerDragOver(e: DragEvent, index: number) {
  if (!canDropOnDivider()) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = draggedThemeLocalId.value ? 'move' : 'copy'
  dividerHoverIndex.value = index
}

function onDividerDragLeave(e: DragEvent, index: number) {
  const related = e.relatedTarget as Node | null
  const current = e.currentTarget as HTMLElement | null
  if (related && current && current.contains(related)) return
  if (dividerHoverIndex.value === index) dividerHoverIndex.value = null
}

// Дроп на разделитель между темами:
// - перетаскивается тема → меняем порядок тем;
// - перетаскивается урок из левой панели → создаём новую тему в позиции index.
async function onThemeDividerDrop(index: number) {
  dividerHoverIndex.value = null

  if (draggedThemeLocalId.value) {
    const id = draggedThemeLocalId.value
    draggedThemeLocalId.value = null
    reorderTheme(id, index)
    return
  }

  if (!canEdit.value) return
  const resolved = await resolveDroppedLesson()
  if (!resolved) return
  if (!canAcceptLesson(resolved)) return
  // Новая тема начиналась бы с домашней работы — запрещено.
  if (isHomeWorkLesson(resolved)) {
    rejectHomeWorkFirst()
    return
  }
  addTheme(resolved, index)
}
</script>

<template>
  <ConstructPanels
    left-title="Уроки"
    :main-title="centerTitle"
    right-title="Просмотр урока"
    :minLeftWidth="250"
    :maxLeftWidth="600"
    :defaultLeftWidth="350"
    :defaultRightWidth="300"
    :minRightWidth="250"
    :maxRightWidth="600"
  >
    <template #left>
      <EducationLessonsSearch
        v-if="!coursePending"
        :selected-taxonomy-id="courseTaxId"
        @select-lesson="onSelectLesson"
      />
    </template>

    <template #main>
      <div class="mx-auto w-full">
        <LoadingOverlay :loading="coursePending || saving">
          <div>
            <!-- Статус публикации -->
            <div class="mb-5 flex items-center justify-between gap-3">
              <div
                class="flex items-center gap-2 cursor-pointer select-none"
                :class="saving ? 'pointer-events-none opacity-70' : ''"
                @click="togglePublished"
              >
                <USwitch
                  :model-value="published"
                  color="success"
                  size="xs"
                />
                <span
                  class="text-[10px] font-bold uppercase tracking-widest transition-colors"
                  :class="published ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'"
                >
                  {{ published ? 'Опубликован' : 'Черновик' }}
                </span>
              </div>

              <span
                v-if="isReadOnly"
                class="inline-flex items-center gap-1 text-[11px] text-muted"
              >
                <UIcon name="i-lucide-lock" class="size-3.5" />
                Снимите курс с публикации, чтобы редактировать
              </span>
            </div>

            <!-- Крошки таксономии (только чтение) -->
            <div class="mb-5">
              <div
                v-if="currentTaxPath.length"
                class="inline-flex max-w-full items-start gap-1.5 rounded-md bg-elevated px-3 py-1.5 text-sm font-medium text-muted"
              >
                <UIcon
                  name="i-lucide-folder-tree"
                  class="mt-[2px] size-4 shrink-0 text-dimmed"
                />
                <nav
                  aria-label="Раздел курса"
                  class="min-w-0"
                >
                  <ol class="flex flex-wrap items-center gap-1 break-all leading-snug">
                    <li
                      v-for="(node, i) in currentTaxPath"
                      :key="node.id"
                      class="flex items-center gap-1"
                    >
                      <UIcon
                        v-if="i > 0"
                        name="i-lucide-chevron-right"
                        class="size-3.5 shrink-0 text-dimmed"
                      />
                      <span :class="{ 'text-highlighted': i === currentTaxPath.length - 1 }">
                        {{ node.title }}
                      </span>
                    </li>
                  </ol>
                </nav>
              </div>
              <p
                v-else
                class="text-xs text-muted"
              >
                Раздел не задан
              </p>
            </div>

            <!-- Инлайн-редактирование шапки (как в уроке) -->
            <div class="flex flex-col gap-2">
              <input
                class="w-full p-0 border-none bg-transparent text-[28px] font-bold leading-tight text-[var(--ui-text,#0f172a)] outline-none placeholder:text-[var(--ui-text-muted,#cbd5e1)]"
                :value="form.title"
                :maxlength="TITLE_MAX"
                placeholder="Название курса"
                :readonly="!canEdit"
                @input="form.title = ($event.target as HTMLInputElement).value"
              />
              <textarea
                v-if="canEdit || form.description"
                class="w-full p-0 border-none bg-transparent font-[inherit] text-sm leading-normal text-[var(--ui-text-muted,#64748b)] resize-none outline-none overflow-hidden placeholder:text-[var(--ui-text-muted,#cbd5e1)]"
                :value="form.description"
                :maxlength="DESCRIPTION_MAX"
                placeholder="Краткое описание курса"
                rows="1"
                :readonly="!canEdit"
                @input="form.description = ($event.target as HTMLTextAreaElement).value"
              />
            </div>

            <!-- Метрики: множитель порога, время между уроками -->
            <div
              class="mt-4 flex items-center justify-between py-2 border-y border-[var(--ui-border,#f1f5f9)] text-xs text-[var(--ui-text-muted,#94a3b8)]"
            >
              <span class="inline-flex items-center gap-1.5 [&_svg]:w-[13px] [&_svg]:h-[13px]">
                <UIcon name="i-lucide-sliders-horizontal"/>
                <span>Множитель порога</span>
                <UInputNumber
                  :model-value="Number.isFinite(form.threshold_multipler) ? form.threshold_multipler : undefined"
                  :step="THRESHOLD_STEP"
                  :min="THRESHOLD_MIN"
                  :max="THRESHOLD_MAX - THRESHOLD_STEP"
                  :disabled="!canEdit"
                  :color="thresholdError && isDirty ? 'error' : undefined"
                  size="xs"
                  variant="ghost"
                  class="w-28 min-w-0"
                  :ui="{ base: 'w-full text-center font-mono tabular-nums' }"
                  :title="`Допустимо: от ${THRESHOLD_MIN} до ${THRESHOLD_MAX} (не включая), шаг ${THRESHOLD_STEP}`"
                  @update:model-value="(v: number | undefined) => form.threshold_multipler = v ?? NaN"
                />
              </span>

              <span class="inline-flex items-center gap-1.5 [&_svg]:w-[13px] [&_svg]:h-[13px]">
                <UIcon name="i-lucide-timer"/>
                <span>Время между уроками</span>
                <UInputNumber
                  :model-value="Number.isFinite(form.time_gap_multipler) ? form.time_gap_multipler : undefined"
                  :step="TIME_GAP_STEP"
                  :min="TIME_GAP_MIN"
                  :max="TIME_GAP_MAX"
                  :disabled="!canEdit"
                  :color="timeGapError && isDirty ? 'error' : undefined"
                  size="xs"
                  variant="ghost"
                  class="w-28 min-w-0"
                  :ui="{ base: 'w-full text-center font-mono tabular-nums' }"
                  :title="`Допустимо: от ${TIME_GAP_MIN} до ${TIME_GAP_MAX}, шаг ${TIME_GAP_STEP}`"
                  @update:model-value="(v: number | undefined) => form.time_gap_multipler = v ?? NaN"
                />
              </span>
            </div>

            <!-- Темы курса: drop-area для уроков -->
            <div
              class="mt-4 flex flex-col gap-3 rounded-xl border-2 border-dashed border-[var(--ui-border,#e5e7eb)] bg-[var(--ui-bg-elevated,#f8fafc)] p-3 transition-colors"
              :class="dropActive && themes.length === 0 ? 'border-[var(--ui-primary,#3b82f6)] bg-[var(--ui-primary-muted,rgba(59,130,246,0.08))]' : ''"
              :data-drop-zone="themes.length ? undefined : true"
              @dragenter="onThemeDragEnter"
              @dragover="onThemeDragOver"
              @dragleave="onThemeDragLeave"
              @drop="onThemeDrop"
            >
              <div class="flex items-center gap-1.5 px-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--ui-text-muted,#94a3b8)]">
                <UIcon name="i-lucide-layers" class="size-3.5" />
                <span>Темы курса</span>
                <span class="ml-auto font-mono text-[10px] normal-case tracking-normal">{{ themes.length }}</span>
              </div>

              <!-- Пустое состояние -->
              <div
                v-if="themes.length === 0"
                class="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--ui-border,#e5e7eb)] bg-[var(--ui-bg,#ffffff)] px-4 py-10 text-center text-[var(--ui-text-muted,#94a3b8)]"
              >
                <UIcon name="i-lucide-download" class="size-8 opacity-50" />
                <span class="text-sm font-medium text-[var(--ui-text,#334155)]">
                  Перетащите уроки из левой панели
                </span>
                <span class="max-w-[360px] text-xs leading-snug">
                  Урок, перенесённый в свободное место, будет добавлен в новую тему.
                  Чтобы добавить урок в существующую тему, перетащите его внутрь этой темы.
                </span>
              </div>

              <!-- Темы с разделителями-стрелками -->
              <div
                v-else
                class="flex flex-col"
                @dragend="dividerHoverIndex = null"
              >
                <!-- Крайняя зона перед первой темой -->
                <div
                  class="mb-3 border-2 border-dashed px-3 py-3 text-center text-[11px] transition-colors"
                  :class="edgeHover === 'start'
                    ? 'border-[var(--ui-primary,#3b82f6)] bg-[var(--ui-primary-muted,rgba(59,130,246,0.08))] text-[var(--ui-primary,#3b82f6)]'
                    : (edgeLessonReady
                        ? 'border-[var(--ui-primary,#3b82f6)]/60 text-[var(--ui-primary,#3b82f6)] cursor-copy'
                        : 'border-[var(--ui-border,#e5e7eb)] text-[var(--ui-text-muted,#94a3b8)]')"
                  data-drop-zone
                  @dragenter="onEdgeLessonDragEnter"
                  @dragover="onEdgeDragOver($event, 'start')"
                  @dragleave="onEdgeDragLeave('start')"
                  @drop="onEdgeDrop($event, 'start')"
                >
                  <template v-if="draggedThemeLocalId">
                    Отпустите — тема переместится в начало
                  </template>
                  <template v-else>
                    Перетащите сюда урок — он создаст новую тему
                  </template>
                </div>

                <template
                  v-for="(theme, index) in themes"
                  :key="themeKey(theme)"
                >
                  <CourseTheme
                    :theme="theme"
                    :read-only="!canEdit"
                    :selected-lesson-id="selectedLessonId"
                    :lesson-types="courseLessonTypes"
                    :time-gap-multiplier="form.time_gap_multipler"
                    @update:theme="onThemeUpdate(theme.localId, $event)"
                    @remove="removeTheme(theme.localId)"
                    @select-lesson="onSelectLesson"
                    @drop-lesson="onThemeDropLesson(theme.localId)"
                    @remove-lesson="onRemoveLessonFromTheme(theme.localId, $event)"
                    @insert-lesson="onInsertLesson(theme.localId, $event.index, $event.source)"
                    @insert-lesson-source="onInsertLessonSource(theme.localId, $event.index, $event.lessonId)"
                    @homework-rejected="rejectHomeWorkFirst"
                    @theme-drag-start="onThemeDragStart"
                    @theme-drag-end="onThemeDragEnd"
                    @dragenter="onEdgeLessonDragEnter"
                    @dragend="onEdgeLessonDragEnd"
                  />

                  <!-- Разделитель между темами — дроп создаёт тему в позиции index + 1 -->
                  <div
                    v-if="index < themes.length - 1"
                    class="group/divider relative flex h-9 items-center justify-center"
                    :class="!canEdit ? '' : (draggedThemeLocalId ? 'cursor-move' : 'cursor-copy')"
                    @dragenter="onDividerDragEnter($event, index + 1)"
                    @dragover="onDividerDragOver($event, index + 1)"
                    @dragleave="onDividerDragLeave($event, index + 1)"
                    @drop.prevent.stop="onThemeDividerDrop(index + 1)"
                  >
                    <!-- Вертикальный соединитель -->
                    <div
                      class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors"
                      :class="dividerHoverIndex === index + 1
                        ? 'bg-[var(--ui-primary,#3b82f6)]'
                        : 'bg-[var(--ui-border,#e5e7eb)]'"
                    />
                    <!-- Стрелка -->
                    <div
                      class="relative z-[1] flex size-5 items-center justify-center rounded-full border bg-[var(--ui-bg,#ffffff)] transition-colors"
                      :class="dividerHoverIndex === index + 1
                        ? 'border-[var(--ui-primary,#3b82f6)] text-[var(--ui-primary,#3b82f6)]'
                        : 'border-[var(--ui-border,#e5e7eb)] text-[var(--ui-text-muted,#94a3b8)]'"
                    >
                      <UIcon name="i-lucide-arrow-down" class="size-3" />
                    </div>
                    <!-- Подсказка при ховере/драге -->
                    <span
                      v-if="dividerHoverIndex === index + 1"
                      class="absolute left-1/2 top-1/2 z-[2] -translate-y-1/2 translate-x-6 whitespace-nowrap rounded-md bg-[var(--ui-primary,#3b82f6)] px-2 py-0.5 text-[10px] font-semibold text-white shadow"
                    >
                      {{ draggedThemeLocalId ? 'Переместить тему сюда' : 'Отпустите — тема появится здесь' }}
                    </span>
                  </div>
                </template>

                <!-- Крайняя зона после последней темы -->
                <div
                  class="mt-3 border-2 border-dashed px-3 py-3 text-center text-[11px] transition-colors"
                  :class="edgeHover === 'end'
                    ? 'border-[var(--ui-primary,#3b82f6)] bg-[var(--ui-primary-muted,rgba(59,130,246,0.08))] text-[var(--ui-primary,#3b82f6)]'
                    : (edgeLessonReady
                        ? 'border-[var(--ui-primary,#3b82f6)]/60 text-[var(--ui-primary,#3b82f6)] cursor-copy'
                        : 'border-[var(--ui-border,#e5e7eb)] text-[var(--ui-text-muted,#94a3b8)]')"
                  data-drop-zone
                  @dragenter="onEdgeLessonDragEnter"
                  @dragover="onEdgeDragOver($event, 'end')"
                  @dragleave="onEdgeDragLeave('end')"
                  @drop="onEdgeDrop($event, 'end')"
                >
                  <template v-if="draggedThemeLocalId">
                    Отпустите — тема переместится в конец
                  </template>
                  <template v-else>
                    Перетащите сюда урок — он создаст новую тему
                  </template>
                </div>
              </div>
            </div>

            <!-- Ошибки валидации -->
            <div
              v-if="validationHint && (isDirty || titleError || descriptionError || thresholdError || timeGapError)"
              class="mt-2 flex flex-col gap-1 text-[11px] text-error"
            >
              <p v-if="titleError">{{ titleError }}</p>
              <p v-if="descriptionError">{{ descriptionError }}</p>
              <p v-if="thresholdError">{{ thresholdError }}</p>
              <p v-if="timeGapError">{{ timeGapError }}</p>
            </div>

            <div class="mt-4 flex items-center justify-end gap-2">
              <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                :disabled="!isDirty || saving"
                @click="resetForm"
              >
                Сбросить
              </UButton>
              <UButton
                icon="i-lucide-check"
                size="sm"
                color="primary"
                variant="solid"
                :loading="saving"
                :disabled="!canEdit || !isDirty || saving"
                @click="saveCourse()"
              >
                Сохранить
              </UButton>
            </div>
          </div>
        </LoadingOverlay>
      </div>
    </template>

    <template #right>
      <div
        v-if="!selectedLessonId"
        class="flex h-full flex-col items-center justify-center p-6 text-center text-muted"
      >
        <UIcon
          name="i-lucide-book-open"
          class="mb-3 size-10 opacity-20"
        />
        <p class="text-sm">
          Выберите урок для просмотра
        </p>
      </div>

      <EducationLessonDetailPanel
        v-else
        :key="selectedLessonId"
        :lesson-id="selectedLessonId"
      />
    </template>
  </ConstructPanels>
</template>
