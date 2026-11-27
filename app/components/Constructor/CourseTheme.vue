<script lang="ts">
// Общее для всех тем состояние «идёт перетаскивание урока».
// Перетаскивать можно и в соседнюю тему, поэтому флаг должен быть
// вне экземпляра компонента — модульный ref.
export const lessonDragState = ref<{ themeLocalId: string, lessonLocalId: string, type?: string | null } | null>(null)

// Источник перетаскивания урока внутри конструктора тем (в отличие от drag из левой панели).
// Читаем и модульное состояние, и payload: в момент drop/dragenter порядок
// вызовов драгэнд-обработчиков карточки не определён, а window-переменная
// страхует от сброса состояния при перерисовке списка тем.
function getInternalDrag(): ThemeLessonDrag | null {
  if (!import.meta.client) return null
  const payload = (window as any).__draggedThemeLesson as ThemeLessonDrag | null
  if (payload) return payload
  return lessonDragState.value ? { ...lessonDragState.value } : null
}

// Урок, перетаскиваемый из левой панели.
function getPanelDrag(): { id: number, type?: string | null } | null {
  if (!import.meta.client) return null
  const native = (window as any).__draggedLessonSource as { id?: unknown, type?: string | null } | null
  if (native && Number.isFinite(Number(native.id))) {
    return { id: Number(native.id), type: native.type ?? null }
  }
  const block = (window as any).__draggedBlockSource as { kind?: string, id?: unknown } | null
  if (block?.kind === 'lesson' && Number.isFinite(Number(block.id))) {
    return { id: Number(block.id), type: null }
  }
  return null
}

// Перетаскивание урока: своего (из карточки) или из левой панели.
// Курсор с уроком часто входит в соседнюю тему ДО наведения на щель,
// поэтому тема включает щели при входе по dragenter.
function isAnyLessonDrag(): boolean {
  return getInternalDrag() !== null || getPanelDrag() !== null
}

// Домашняя работа перетаскивается в конструкторе (внутренний drag или из панели).
// Урок из другой темы в этой теме не найти — тип берём из payload/модульного
// состояния, которое заполняет тема-источник при dragstart.
function isHomeWorkDrag(): boolean {
  const internal = getInternalDrag()
  if (internal) return internal.type === 'home_work'
  return getPanelDrag()?.type === 'home_work'
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { LessonTypeOption } from '~/types/lesson'
import type { ThemeLessonDrag, ThemeModel } from '~/types/course'
import { normalizeLessonColor } from '~/utils/lessonType'

// ==================== Props / Emits ====================

interface Props {
  theme: ThemeModel
  readOnly?: boolean
  selectedLessonId?: number | null
  lessonTypes?: LessonTypeOption[]
  /** Множитель времени курса из шапки: участвует в пересчёте разрывов. */
  timeGapMultiplier?: number
}

const props = withDefaults(defineProps<Props>(), {
  readOnly: false,
  selectedLessonId: null,
  lessonTypes: () => [],
  timeGapMultiplier: 1,
})

const emit = defineEmits<{
  (e: 'update:theme', value: ThemeModel): void
  (e: 'remove'): void
  (e: 'select-lesson', id: number): void
  (e: 'drop-lesson'): void
  (e: 'remove-lesson', localId: string): void
  // Вставка перетаскиваемого урока (из этой или другой темы) в позицию index.
  (e: 'insert-lesson', payload: { index: number, source: ThemeLessonDrag }): void
  // Вставка урока, перетащенного из левой панели, сразу в позицию index этой темы.
  (e: 'insert-lesson-source', payload: { index: number, lessonId: number }): void
  // Попытка поставить домашнюю работу первым уроком темы — показать уведомление.
  (e: 'homework-rejected'): void
  // Перестановка тем: начало/конец перетаскивания за ручку.
  (e: 'theme-drag-start', localId: string): void
  (e: 'theme-drag-end'): void
}>()

// ==================== Карточки: z-index / наведение ====================

// index -> z-index карточки: в обычном состоянии home_work уходит под
// предыдущую карточку, по наведению — наверх, над всеми карточками ленты.
// Стрелки-щели ниже карточек, но выше опущенной home_work, чтобы она
// скроллилась под ними вместе со своим предыдущим уроком.
const cardZIndex = computed<Record<number, number>>(() => {
  const map: Record<number, number> = {}
  const count = props.theme.lessons.length
  const lifted = hoveredStackIndex.value
  props.theme.lessons.forEach((lesson, index) => {
    // Перетаскиваемая карточка всегда наверху — иначе подложенная home_work
    // «провалится» под соседа сразу после начала drag.
    if (draggingLessonLocalId.value === lesson.localId) map[index] = count + 3
    else if (lifted === index) map[index] = count + 2
    else if (isStackedHomeWork(index)) map[index] = 0
    else map[index] = count + 1
  })
  return map
})

// localId перетаскиваемого урока в этой теме — карточка поднимается на время drag.
const draggingLessonLocalId = computed(() =>
  lessonDragState.value?.themeLocalId === props.theme.localId
    ? lessonDragState.value.lessonLocalId
    : null,
)

// Курсор с перетаскиваемым уроком (внутренним или из левой панели) сейчас
// над этой темой. Пока drag нет, щели не перехватывают курсор — иначе они
// перекрывали бы подложенную home_work и за неё нельзя было бы взяться.
const slotsInteractive = ref(false)

// Стек ленты: карточки всегда выше щелей (у них z-index > count), щели —
// выше опущенной home_work (z-index 0), чтобы та оставалась под соседями.
const slotZIndex = computed(() => props.theme.lessons.length + 1)

// ==================== Внутренний DnD уроков между темами ====================

// Индекс «щели» между уроками (0..length), над которой сейчас курсор.
const dropIndex = ref<number | null>(null)

// Идёт перетаскивание урока (своего или из другой темы) — показываем стрелки порядка.
const draggingInside = computed(() => dropIndex.value !== null)

// Щели работают с двумя видами drag:
//  • внутренний — урок из карточки самой темы/другой темы (getInternalDrag);
//  • из левой панели — payload __draggedLessonSource (id + type).
// Оба можно бросить в конкретную позицию темы.

// Тема не может открываться с home_work — проверяем при перетаскивании в неё.
function canDropAtIndex(index: number): boolean {
  if (index !== 0) return true
  const internal = getInternalDrag()
  if (internal) {
    const lesson = props.theme.lessons.find((l) => l.localId === internal.lessonLocalId)
    return !(lesson && isHomeWork(lesson))
  }
  const panel = getPanelDrag()
  if (panel) return panel.type !== HOME_WORK_TYPE
  return false
}

// Щель-дроп-зона: и перестановка внутри темы, и перенос между темами, и drag из панели.
// Щель всегда «залипает» на курсоре во время drag, даже если вставлять сюда
// нельзя (home_work в начало темы) — так видно, почему дроп не сработает.
function onSlotDragOver(e: DragEvent, index: number) {
  if (props.readOnly) return
  if (!getInternalDrag() && !getPanelDrag()) return
  e.preventDefault()
  e.stopPropagation()
  const allowed = canDropAtIndex(index)
  if (e.dataTransfer) e.dataTransfer.dropEffect = allowed ? (getInternalDrag() ? 'move' : 'copy') : 'none'
  dropIndex.value = index
}

function onSlotDragLeave(e: DragEvent, index: number) {
  const related = e.relatedTarget as Node | null
  const current = e.currentTarget as HTMLElement | null
  if (related && current && current.contains(related)) return
  if (dropIndex.value === index) dropIndex.value = null
}

// ---- Дроп home_work прямо на карточку урока: встаёт сразу после неё ----

// Индекс карточки, над которой сейчас home_work (подсветка «сюда»).
const homeWorkOverIndex = ref<number | null>(null)

function onLessonCardDragOver(e: DragEvent, index: number) {
  if (props.readOnly) return
  if (!isHomeWorkDrag()) return
  // Класть home_work сразу за собой бессмысленно — целью не считаем.
  if (isDraggedCard(index)) return
  // home_work на home_work не переносится: ни из темы, ни из левой панели.
  // Снимаем подсветку, если она осталась от предыдущей карточки-цели.
  if (isHomeWorkAt(index)) {
    homeWorkOverIndex.value = null
    return
  }
  e.preventDefault()
  e.stopPropagation()
  // Вставка идёт в позицию index + 1 — пустой щели не остаётся.
  if (e.dataTransfer) e.dataTransfer.dropEffect = getInternalDrag() ? 'move' : 'copy'
  homeWorkOverIndex.value = index
}

function onLessonCardDragLeave(e: DragEvent, index: number) {
  const related = e.relatedTarget as Node | null
  const current = e.currentTarget as HTMLElement | null
  if (related && current && current.contains(related)) return
  if (homeWorkOverIndex.value === index) homeWorkOverIndex.value = null
}

// Перетаскиваемая home_work — карточка этой темы с указанным индексом.
function isDraggedCard(index: number): boolean {
  const internal = getInternalDrag()
  if (!internal || internal.themeLocalId !== props.theme.localId) return false
  return props.theme.lessons[index]?.localId === internal.lessonLocalId
}

// Карточка по индексу — домашняя работа.
function isHomeWorkAt(index: number): boolean {
  const lesson = props.theme.lessons[index]
  return lesson !== undefined && isHomeWork(lesson)
}

// Домашняя работа (из своей/чужой темы или из левой панели) встаёт сразу после карточки.
function onLessonCardDrop(e: DragEvent, index: number) {
  homeWorkOverIndex.value = null
  dropIndex.value = null

  if (!isHomeWorkDrag() || isDraggedCard(index)) return

  // home_work на home_work не переносится: ни из темы, ни из левой панели.
  if (isHomeWorkAt(index)) return

  e.preventDefault()
  e.stopPropagation()

  const internal = getInternalDrag()
  if (internal) {
    emit('insert-lesson', { index: index + 1, source: internal })
  } else {
    const panel = getPanelDrag()
    if (!panel) return
    emit('insert-lesson-source', { index: index + 1, lessonId: panel.id })
  }
  // Сбрасываем только состояние внутреннего drag — панельный payload общий.
  ;(window as any).__draggedThemeLesson = null
  lessonDragState.value = null
}

function onSlotDrop(e: DragEvent, index: number) {
  dropIndex.value = null

  const internal = getInternalDrag()
  if (internal) {
    e.preventDefault()
    e.stopPropagation()
    if (!canDropAtIndex(index)) {
      emit('homework-rejected')
      return
    }
    emit('insert-lesson', { index, source: internal })
    ;(window as any).__draggedThemeLesson = null
    lessonDragState.value = null
    return
  }

  const panel = getPanelDrag()
  if (panel) {
    e.preventDefault()
    e.stopPropagation()
    if (!canDropAtIndex(index)) {
      emit('homework-rejected')
      return
    }
    emit('insert-lesson-source', { index, lessonId: panel.id })
  }
}

// ==================== DnD тем (перестановка) ====================

function onThemeDragStart(e: DragEvent) {
  if (props.readOnly) return
  emit('theme-drag-start', props.theme.localId)
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', props.theme.localId)
  }
}

function onThemeDragEnd() {
  emit('theme-drag-end')
}

// Поля заголовка/описания не должны принимать перетаскивание (ни темы, ни урока):
// блокируем вставку текста/элементов в input/textarea.
function blockFieldDrop(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
}

// ==================== Инлайн-редактирование ====================

function patchTheme(patch: Partial<ThemeModel>) {
  emit('update:theme', { ...props.theme, ...patch })
}

function updateTitle(e: Event) {
  patchTheme({ title: (e.target as HTMLInputElement).value })
}

function updateDescription(e: Event) {
  patchTheme({ description: (e.target as HTMLTextAreaElement).value })
}

// ==================== Drop ====================

const isDragOver = ref(false)

function onDragEnter() {
  if (props.readOnly) return
  // Внутренний drag (урок из карточки) тоже должен включать щели: иначе
  // при переходе курсора на соседнюю тему drop-зоны остаются
  // pointer-events-none и дроп в них невозможен.
  if (!isAnyLessonDrag()) return
  // Пустая тема показывает подсказку «нельзя начать с домашней работы».
  draggingHomeWork.value = isHomeWorkDrag()
  isDragOver.value = true
  slotsInteractive.value = true
}

function onDragOver(e: DragEvent) {
  if (props.readOnly) return
  if (!isAnyLessonDrag()) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = getInternalDrag() ? 'move' : 'copy'
  isDragOver.value = true
  slotsInteractive.value = true
}

function onDragLeave(e: DragEvent) {
  const related = e.relatedTarget as Node | null
  const current = e.currentTarget as HTMLElement | null
  if (related && current && current.contains(related)) return
  isDragOver.value = false
  slotsInteractive.value = false
  draggingHomeWork.value = false
  homeWorkOverIndex.value = null
}

function onDrop(e: DragEvent) {
  if (props.readOnly) return
  isDragOver.value = false
  slotsInteractive.value = false
  // Дроп на щель обрабатывает сама щель (она stopPropagation'ит событие).
  // В тему дропаются только уроки (см. resolveLessonSource в CoursesConstructor).
  if (!getPanelDrag()) return
  e.preventDefault()
  e.stopPropagation()
  // Внутренний drag в свободное место темы ничего не делает: у ленты всегда
  // есть щель в конце, промах не должен переносить урок.
  if (getInternalDrag()) return
  emit('drop-lesson')
}

// Перетаскиваемый урок — домашняя работа (для подсказки пустой темы).
const draggingHomeWork = ref(false)

function onLessonDragStart(e: DragEvent, lesson: { localId: string, type?: string | null }) {
  if (props.readOnly) return
  // Начали тащить — сбрасываем «поднятую» home_work, перетаскиваемую держим сверху.
  hoveredStackIndex.value = null
  lessonDragState.value = { themeLocalId: props.theme.localId, lessonLocalId: lesson.localId, type: lesson.type ?? null }
  ;(window as any).__draggedThemeLesson = { themeLocalId: props.theme.localId, lessonLocalId: lesson.localId, type: lesson.type ?? null } satisfies ThemeLessonDrag
  draggingHomeWork.value = isHomeWork(lesson)
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', lesson.localId)
  }
}

function onLessonDragEnd() {
  ;(window as any).__draggedThemeLesson = null
  lessonDragState.value = null
  // Курсор покидает ленту — соседняя тема могла не получить dragleave.
  isDragOver.value = false
  slotsInteractive.value = false
  draggingHomeWork.value = false
  dropIndex.value = null
  homeWorkOverIndex.value = null
  hoveredStackIndex.value = null
}

function focusLesson(lessonId: number) {
  emit('select-lesson', lessonId)
}

// ==================== Горизонтальная прокрутка ====================

const trackRef = ref<HTMLElement | null>(null)

const canScrollLeft = ref(false)
const canScrollRight = ref(false)

function updateScrollState() {
  const el = trackRef.value
  if (!el) return
  canScrollLeft.value = el.scrollLeft > 2
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
}

function scrollBy(direction: -1 | 1) {
  const el = trackRef.value
  if (!el) return
  const step = Math.max(200, Math.round(el.clientWidth * 0.8))
  el.scrollBy({ left: direction * step, behavior: 'smooth' })
}

onMounted(() => {
  nextTick(updateScrollState)
})

onBeforeUnmount(() => {
  hoveredStackIndex.value = null
})

// ==================== Прочее ====================

const titleFallback = 'Без названия'
const descriptionFallback = 'Без описания'

function displayTitle(title: string | null | undefined): string {
  const t = (title ?? '').trim()
  return t || titleFallback
}

function displayDescription(description: string | null | undefined): string {
  const d = (description ?? '').trim()
  return d || descriptionFallback
}

// Справочник типов уроков: грузим синхронно до отрисовки карточки.
// useApi кэширует GET и дедуплицирует параллельные запросы,
// поэтому один запрос на все темы и повторные монтирования.
const api = useApi()

const { data: fallbackLessonTypes } = await useAsyncData(
  'lesson-types-catalog',
  async () => {
    try {
      const res = await api.get<{ data?: LessonTypeOption[] }>(
        '/lessons/types',
        { silent: true },
      )
      return (res?.data ?? []) as LessonTypeOption[]
    } catch (e) {
      console.warn('[CourseTheme] lesson types unavailable', e)
      return []
    }
  },
)

const availableLessonTypes = computed<LessonTypeOption[]>(() =>
  props.lessonTypes.length ? props.lessonTypes : (fallbackLessonTypes.value ?? []),
)

function lessonType(code: string | null | undefined): LessonTypeOption | null {
  if (!code) return null
  return availableLessonTypes.value.find((t) => t.code === code) ?? null
}

// Приведение разрыва к целому: 0 остаётся 0, (0, 1] → 1, больше 1 → ceil.
function ceilTimeGap(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (value <= 1) return 1
  return Math.ceil(value)
}

// Разрыв до следующего урока для стрелки слева от урока index: показывает,
// сколько минимум часов должно пройти после предыдущего урока, чтобы ученик
// мог приступить к уроку index. Щель index — это стрелка ОТ урока index - 1.
// Приоритет — сохранённый в курсе time_gap урока; если его нет (урок ещё
// не сохранялся) — справочный time_gap типа * множитель времени курса.
function slotTimeGap(index: number): number | null {
  // Перед первым уроком стрелки ОТ урока нет — цифру не рисуем.
  if (index === 0) return null
  const lesson = props.theme.lessons[index - 1]
  if (lesson?.time_gap != null) {
    const stored = Number(lesson.time_gap)
    return Number.isFinite(stored) && stored >= 0 ? stored : null
  }
  const base = Number(lessonType(lesson?.type)?.time_gap)
  if (!Number.isFinite(base) || base <= 0) return null
  const mult = Number(props.timeGapMultiplier)
  const factor = Number.isFinite(mult) && mult >= 0 ? mult : 1
  return ceilTimeGap(base * factor)
}

// Подпись разрыва: целые часы — как есть, дробные (умножение на множитель) — до 3 знаков.
function formatTimeGap(gap: number | null): string {
  if (gap === null) return ''
  return Number.isInteger(gap) ? String(gap) : String(Number(gap.toFixed(3)))
}

// Цвет типа урока (как бейдж в Education/LessonListElement).
const normalizeColor = normalizeLessonColor

// Зависящий от цвета класс на data-type-accent: стили в <style scoped> ниже
// выигрывают по специфичности у утилит .lesson-card.
function colorClassSuffix(color: string): string {
  return color.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

// Цвет типа урока для рамок/фона карточки (как бейдж в Education/LessonListElement).
function lessonAccentStyle(code: string | null | undefined): Record<string, string> | undefined {
  const color = normalizeColor(lessonType(code)?.color)
  if (!color) return undefined
  return { '--accent-strong': color }
}

function lessonAccentClass(code: string | null | undefined): string | null {
  const color = normalizeColor(lessonType(code)?.color)
  return color ? `accent-${colorClassSuffix(color)}` : null
}

const lessonAccentClassAttr = computed(() => (code: string | null | undefined): string | undefined =>
  lessonAccentClass(code) ?? undefined,
)

const isTitleEmpty = computed(() => props.theme.title.trim().length === 0)

// ==================== Название урока: прокрутка при hover ====================

// Название рисуется одной строкой; если не влезает, по hover плавно
// прокручивается влево до конца, при уходе — обратно к началу.
const titleEls = new Map<string, HTMLElement>()
const titleScroll = ref<Record<string, { distance: number, duration: number }>>({})

const TITLE_SCROLL_MS_PER_PX = 40
const TITLE_SCROLL_MIN_MS = 400
const TITLE_SCROLL_MAX_MS = 4000

function setTitleEl(localId: string, el: Element | null) {
  const prev = titleEls.get(localId) ?? null
  if (el instanceof HTMLElement) {
    if (prev === el) return
    if (prev) observeTitleEl(prev, false)
    titleEls.set(localId, el)
    observeTitleEl(el, true)
  } else if (prev) {
    observeTitleEl(prev, false)
    titleEls.delete(localId)
  } else {
    return
  }
  // Меряем после монтирования/удаления элемента.
  nextTick(measureTitles)
}

function measureTitles() {
  const next: Record<string, { distance: number, duration: number }> = {}
  titleEls.forEach((el, localId) => {
    // el — внутренний inline-block (его ширина всегда по тексту), поэтому
    // переполнение меряем у обрезающего контейнера .lesson-title.
    const box = el.parentElement as HTMLElement | null
    if (!box) return
    const distance = el.offsetWidth - box.clientWidth
    if (distance > 1) {
      next[localId] = {
        distance,
        duration: Math.min(TITLE_SCROLL_MAX_MS, Math.max(TITLE_SCROLL_MIN_MS, distance * TITLE_SCROLL_MS_PER_PX)),
      }
    }
  })
  titleScroll.value = next
}

let titleResizeObserver: ResizeObserver | null = null

function observeTitleEl(el: HTMLElement, observe: boolean) {
  if (!titleResizeObserver || !el.isConnected) return
  // Следим и за текстом (inner), и за шириной обрезающего контейнера.
  const box = el.parentElement
  const targets = box ? [el, box] : [el]
  for (const t of targets) {
    if (observe) titleResizeObserver.observe(t)
    else titleResizeObserver.unobserve(t)
  }
}

onMounted(() => {
  if (import.meta.client && typeof ResizeObserver !== 'undefined') {
    titleResizeObserver = new ResizeObserver(measureTitles)
    titleEls.forEach((el) => observeTitleEl(el, true))
  }
  nextTick(measureTitles)
})

// Текст названия и набор уроков меняют ширину — перемеряем после отрисовки.
watch(
  () => props.theme.lessons.map((l) => `${l.localId}:${l.title ?? ''}`).join('|'),
  () => nextTick(measureTitles),
)

onBeforeUnmount(() => {
  titleResizeObserver?.disconnect()
  titleResizeObserver = null
  titleEls.clear()
})

// ==================== Домашняя работа ====================

// Домашняя работа визуально «подкладывается» под предыдущий урок, как нижняя
// карта в колоде; при этом она остаётся обычной карточкой — её можно выбрать,
// перетащить и удалить.
const HOME_WORK_TYPE = 'home_work'

function isHomeWork(lesson: { type?: string | null }): boolean {
  return lesson.type === HOME_WORK_TYPE
}

// Особый случай: home_work, которая открывает тему. Такого быть не должно —
// такой урок помечаем предупреждением (правило не даёт сюда его перетащить).
const isOrphanHomeWork = computed<boolean[]>(() =>
  props.theme.lessons.map((lesson, i) => isHomeWork(lesson) && i === 0),
)

// Каждый урок рисуется своей карточкой; home_work сдвигается влево и вверх —
// она выглядывает из-за предыдущей карточки справа. Выступающая часть должна
// быть достаточно широкой, чтобы за неё можно было взяться и перетащить урок
// в любую щель, как обычную карточку.
function isStackedHomeWork(index: number): boolean {
  return isHomeWork(props.theme.lessons[index] ?? {}) && index > 0
}

// Наведение на home_work «поднимает» её над предыдущей карточкой целиком
// (вместе с её крестиком удаления). При уходе курсора и в начале драга
// порядок возвращается к исходному — home_work снова уходит под урок.
const hoveredStackIndex = ref<number | null>(null)

function onStackLessonEnter(index: number) {
  if (!isStackedHomeWork(index)) return
  hoveredStackIndex.value = index
}

function onStackLessonLeave(index: number) {
  if (hoveredStackIndex.value === index) hoveredStackIndex.value = null
}

// Есть ли в ленте подложенная home_work: только тогда нужен верхний отступ,
// чтобы её верхняя часть не обрезалась прокруткой.
const hasStackedHomeWork = computed<boolean>(() =>
  props.theme.lessons.some((_, index) => isStackedHomeWork(index)),
)
</script>

<template>
  <section
    class="group/theme rounded-lg border p-1 shadow-sm transition-colors [background-color:var(--ui-bg,#ffffff)] [border-color:var(--ui-border,#e5e7eb)]"
    :class="isDragOver || draggingInside
      ? ''
      : 'hover:border-[var(--ui-primary,#3b82f6)]/50 hover:shadow'"
    data-theme
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Шапка темы: название / описание / удаление -->
    <header class="flex items-start gap-2 px-3 pt-3 pb-2">
      <!-- Ручка перетаскивания темы -->
      <div
        v-if="!readOnly"
        class="mt-0.5 inline-flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted hover:bg-elevated hover:text-highlighted active:cursor-grabbing"
        title="Перетащите, чтобы изменить порядок тем"
        draggable="true"
        @dragstart="onThemeDragStart"
        @dragend="onThemeDragEnd"
      >
        <UIcon name="i-lucide-grip-vertical" class="size-4" />
      </div>

      <div class="min-w-0 flex-1">
        <input
          class="w-full border-none bg-transparent p-0 text-[15px] font-semibold leading-snug text-highlighted outline-none placeholder:text-muted/70"
          :class="{ 'italic text-muted': isTitleEmpty && readOnly }"
          :value="theme.title"
          :placeholder="isTitleEmpty && readOnly ? titleFallback : 'Название темы'"
          :readonly="readOnly"
          @input="updateTitle"
          @dragover.stop
          @drop="blockFieldDrop"
        />
        <textarea
          v-if="!readOnly || theme.description.trim().length > 0"
          class="mt-0.5 w-full resize-none overflow-hidden border-none bg-transparent p-0 text-xs leading-snug text-muted outline-none placeholder:text-muted/60"
          :value="theme.description"
          :placeholder="readOnly ? descriptionFallback : 'Описание темы'"
          rows="1"
          :readonly="readOnly"
          @input="updateDescription"
          @dragover.stop
          @drop="blockFieldDrop"
        />
        <p
          v-else
          class="mt-0.5 text-xs italic text-muted/60"
        >
          {{ descriptionFallback }}
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-1 pt-0.5">
        <span class="rounded-full bg-default px-1.5 py-0.5 font-mono text-[10px] text-muted">
          {{ theme.lessons.length }}
        </span>
        <button
          v-if="!readOnly"
          type="button"
          class="inline-flex size-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-error/10 hover:text-error"
          title="Удалить тему"
          @click.stop="emit('remove')"
        >
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
      </div>
    </header>

    <!-- Лента уроков с прокруткой -->
    <div class="relative px-3 pb-3">
      <button
        v-if="canScrollLeft"
        type="button"
        class="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full border border-default bg-default/95 p-1 text-muted shadow-sm transition-colors hover:text-highlighted"
        title="Прокрутить влево"
        @click="scrollBy(-1)"
      >
        <UIcon name="i-lucide-chevron-left" class="size-4" />
      </button>

      <button
        v-if="canScrollRight"
        type="button"
        class="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full border border-default bg-default/95 p-1 text-muted shadow-sm transition-colors hover:text-highlighted"
        title="Прокрутить вправо"
        @click="scrollBy(1)"
      >
        <UIcon name="i-lucide-chevron-right" class="size-4" />
      </button>

      <!-- Стрелка порядка: показывается только при перетаскивании урока -->
      <div
        v-if="theme.lessons.length && !readOnly && draggingInside"
        class="pointer-events-none absolute inset-x-14 top-0.5 z-40 flex items-center justify-center gap-1"
      >
        <span class="h-px flex-1 bg-muted/20" />
        <span class="whitespace-nowrap text-[9px] uppercase tracking-wide text-muted/60">порядок уроков</span>
        <UIcon name="i-lucide-chevron-right" class="size-3 text-muted/50" />
        <span class="h-px flex-1 bg-muted/20" />
      </div>

      <div
        v-if="theme.lessons.length"
        ref="trackRef"
        class="flex items-start gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:thin] snap-x snap-mandatory"
        :class="hasStackedHomeWork ? 'pb-3' : 'pt-1 pb-1'"
        :style="{ isolation: 'isolate' }"
        @scroll.passive="updateScrollState"
        @dragend="onLessonDragEnd"
      >
        <template
          v-for="(lesson, index) in theme.lessons"
          :key="lesson.localId"
        >
          <!-- Щель-дроп-зона перед уроком: всегда имеет реальную площадь наведения -->
          <div
            v-if="!readOnly"
            class="group/slot relative flex w-7 shrink-0 cursor-grabbing items-center justify-center self-stretch"
            :class="slotsInteractive ? 'pointer-events-auto' : 'pointer-events-none'"
            :style="{ zIndex: slotZIndex }"
            data-lesson-slot
            title="Вставить урок сюда"
            @dragenter.prevent.stop="onSlotDragOver($event, index)"
            @dragover="onSlotDragOver($event, index)"
            @dragleave="onSlotDragLeave($event, index)"
            @drop="onSlotDrop($event, index)"
          >
            <!-- Статичный вид: порядок уроков слева направо.
                 time_gap слева от стрелки — разрыв типа предыдущего урока.
                 После home_work весь бейдж опускается на 32px. -->
            <span class="flex w-full shrink-0 flex-col items-center">
              <span
                class="inline-flex items-center gap-px rounded-full border border-default bg-elevated/80 px-0.5 py-px font-mono text-[9px] leading-none text-muted/80 transition-colors group-hover/slot:border-[var(--ui-primary,#3b82f6)]/40 group-hover/slot:text-muted"
                :class="{ 'mt-8': isHomeWorkAt(index - 1) }"
                :title="slotTimeGap(index) !== null ? `После предыдущего урока должно пройти минимум ${formatTimeGap(slotTimeGap(index))}, чтобы открылся этот` : undefined"
              >
                <span v-if="slotTimeGap(index) !== null" class="min-w-[8px] text-center tabular-nums">{{ formatTimeGap(slotTimeGap(index)) }}</span>
                <UIcon
                  name="i-lucide-arrow-big-right"
                  class="size-3 shrink-0 transition-colors"
                  :class="draggingInside
                    ? (dropIndex === index
                        ? 'text-[var(--ui-primary,#3b82f6)]'
                        : 'text-[var(--ui-primary,#3b82f6)]/50 group-hover/slot:text-[var(--ui-primary,#3b82f6)]')
                    : 'text-muted/40 group-hover/slot:text-[var(--ui-primary,#3b82f6)]/60'"
                />
              </span>
            </span>

            <!-- Индикатор вставки -->
            <div
              class="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full transition-colors"
              :class="dropIndex === index
                ? 'bg-[var(--ui-primary,#3b82f6)]'
                : 'bg-transparent'"
            />

            <!-- Подсказка при наведении перетаскиванием -->
            <div
              class="pointer-events-none absolute -top-6 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-default bg-default px-1.5 py-0.5 text-[10px] font-medium text-highlighted shadow-sm transition-opacity"
              :class="dropIndex === index ? 'opacity-100' : 'opacity-0'"
            >
              Вставить урок сюда
            </div>
          </div>

          <!-- Карточка урока. home_work «подкладывается» под предыдущую карточку -->
          <div
            role="button"
            tabindex="0"
            :draggable="!readOnly"
            class="lesson-card group/lesson relative isolate min-h-[90px] w-[200px] shrink-0 snap-start cursor-grab rounded-lg border py-2.5 pl-3.5 pr-2.5 text-left shadow-sm outline-none transition-[transform,box-shadow,border-color] [background-color:var(--ui-bg-elevated,#f1f5f9)] [border-color:var(--ui-border,#e5e7eb)] active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-[var(--ui-primary,#3b82f6)]/40"
            :class="[
              isStackedHomeWork(index)
                ? '-ml-[228px] translate-y-[8px] shadow-md'
                : 'hover:shadow',
              selectedLessonId === lesson.id
                ? 'border-primary ring-1 ring-primary/40'
                : (isStackedHomeWork(index)
                    ? ''
                    : 'hover:border-[var(--ui-primary,#3b82f6)]/60'),
              isOrphanHomeWork[index]
                ? 'ring-1 ring-dashed ring-warning/50'
                : '',
              homeWorkOverIndex === index
                ? '!border-[var(--ui-primary,#3b82f6)] ring-2 ring-primary/30'
                : '',
            ]"
            :style="{ zIndex: cardZIndex[index], ...lessonAccentStyle(lesson.type) }"
            :data-type-accent="lessonAccentClassAttr(lesson.type)"
            :title="isOrphanHomeWork[index] ? 'Домашняя работа не может открывать тему — добавьте урок перед ней' : undefined"
            @mouseenter="onStackLessonEnter(index)"
            @mouseleave="onStackLessonLeave(index)"
            @dragstart="onLessonDragStart($event, lesson)"
            @dragend="onLessonDragEnd"
            @dragover="onLessonCardDragOver($event, index)"
            @dragleave="onLessonCardDragLeave($event, index)"
            @drop="onLessonCardDrop($event, index)"
            @click="focusLesson(lesson.id)"
            @keydown.enter.prevent="focusLesson(lesson.id)"
            @keydown.space.prevent="focusLesson(lesson.id)"
          >
            <!-- Индикация статуса публикации: левая полоса -->
            <span
              class="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-lg"
              :class="lesson.published
                ? 'bg-emerald-500'
                : 'bg-slate-300 dark:bg-slate-600'"
            />

            <!-- Крестик удаления урока из темы -->
            <button
              v-if="!readOnly"
              type="button"
              class="absolute right-1 top-1 z-[1] inline-flex size-5 items-center justify-center rounded-md bg-default/90 text-muted opacity-0 shadow-sm transition-opacity hover:bg-error/10 hover:text-error focus-visible:opacity-100 group-hover/lesson:opacity-100"
              title="Удалить урок из темы"
              @click.stop="emit('remove-lesson', lesson.localId)"
            >
              <UIcon name="i-lucide-x" class="size-3.5" />
            </button>

            <div class="mb-1 flex items-center gap-1 text-[10px] font-mono text-muted">
              <span>#{{ lesson.id }}</span>
              <span class="opacity-40">·</span>
              <span class="inline-flex items-center gap-0.5">
                <UIcon name="i-lucide-layers" class="size-3" />
                {{ lesson.blocks_count }}
              </span>
              <span
                v-if="lessonType(lesson.type)"
                class="ml-auto mr-5 inline-flex max-w-[80px] items-center gap-0.5 truncate rounded-full border px-1 leading-tight"
                :style="{
                  borderColor: normalizeColor(lessonType(lesson.type)?.color) || undefined,
                  color: normalizeColor(lessonType(lesson.type)?.color) || undefined,
                }"
                :title="lessonType(lesson.type)?.description || undefined"
              >
                <UIcon name="i-lucide-tag" class="size-2.5 shrink-0" />
                <span class="truncate">{{ lessonType(lesson.type)?.title }}</span>
              </span>
            </div>

            <div
              class="lesson-title text-xs font-medium leading-snug"
              :title="displayTitle(lesson.title)"
            >
              <span
                :ref="(el) => setTitleEl(lesson.localId, el as Element | null)"
                class="lesson-title-inner"
                :class="{
                  overflowed: titleScroll[lesson.localId],
                  'text-highlighted': lesson.title?.trim(),
                  'italic text-muted': !lesson.title?.trim(),
                }"
                :style="{
                  '--title-scroll-distance': `-${titleScroll[lesson.localId]?.distance ?? 0}px`,
                  '--title-scroll-duration': `${titleScroll[lesson.localId]?.duration ?? 0}ms`,
                }"
              >
                {{ displayTitle(lesson.title) }}
              </span>
            </div>

            <div
              class="mt-0.5 line-clamp-2 text-[11px] leading-snug"
              :class="lesson.description?.trim() ? 'text-muted' : 'italic text-muted/70'"
            >
              {{ displayDescription(lesson.description) }}
            </div>
          </div>
        </template>

        <!-- Щель-дроп-зона после последнего урока -->
        <div
          v-if="!readOnly"
          class="group/slot relative flex w-5 shrink-0 cursor-grabbing items-center justify-center self-stretch"
          :class="slotsInteractive ? 'pointer-events-auto' : 'pointer-events-none'"
          :style="{ zIndex: slotZIndex }"
          data-lesson-slot
          title="Вставить урок сюда"
          @dragenter.prevent.stop="onSlotDragOver($event, theme.lessons.length)"
          @dragover="onSlotDragOver($event, theme.lessons.length)"
          @dragleave="onSlotDragLeave($event, theme.lessons.length)"
          @drop="onSlotDrop($event, theme.lessons.length)"
        >
          <!-- После последнего урока стрелка ведёт «в никуда» — разрыв не показываем.
               Если последний урок — home_work, стрелка опускается на 32px. -->
          <UIcon
            name="i-lucide-arrow-big-right"
            class="size-5 shrink-0 transition-colors"
            :class="[
              isHomeWorkAt(theme.lessons.length - 1) ? 'mt-8' : '',
              draggingInside
                ? (dropIndex === theme.lessons.length
                    ? 'text-[var(--ui-primary,#3b82f6)]'
                    : 'text-[var(--ui-primary,#3b82f6)]/50 group-hover/slot:text-[var(--ui-primary,#3b82f6)]')
                : 'text-muted/40 group-hover/slot:text-[var(--ui-primary,#3b82f6)]/60',
            ]"
          />

          <div
            class="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full transition-colors"
            :class="dropIndex === theme.lessons.length
              ? 'bg-[var(--ui-primary,#3b82f6)]'
              : 'bg-transparent'"
          />

          <div
            class="pointer-events-none absolute -top-6 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-default bg-default px-1.5 py-0.5 text-[10px] font-medium text-highlighted shadow-sm transition-opacity"
            :class="dropIndex === theme.lessons.length ? 'opacity-100' : 'opacity-0'"
          >
            Вставить урок сюда
          </div>
        </div>
      </div>

      <div
        v-else
        class="flex min-h-[72px] items-center justify-center rounded-lg border border-dashed px-3 py-4 text-center text-xs transition-colors"
        :class="draggingHomeWork
          ? 'border-warning/50 text-warning'
          : (dropIndex === 0
              ? 'border-[var(--ui-primary,#3b82f6)] text-[var(--ui-primary,#3b82f6)]'
              : 'border-default text-muted')"
        @dragenter.prevent.stop="onSlotDragOver($event, 0)"
        @dragover="onSlotDragOver($event, 0)"
        @dragleave="onSlotDragLeave($event, 0)"
        @drop="onSlotDrop($event, 0)"
      >
        {{ draggingHomeWork ? 'Тема не может начинаться с домашней работы' : 'Перетащите урок сюда' }}
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Акцент цветом типа урока — только на карточках уроков.
   Сам класс нужен, чтобы правило перебило утилиты; цвет приходит из :style
   переменной --accent-strong (без неё — нейтральный серый). */
.lesson-card[data-type-accent] {
  background-color: color-mix(in srgb, var(--accent-strong, #64748b) 12%, var(--ui-bg, #ffffff));
  border-color: color-mix(in srgb, var(--accent-strong, #64748b) 55%, var(--ui-border, #e5e7eb));
}

.lesson-card[data-type-accent]:hover {
  border-color: var(--accent-strong, #64748b);
}

/* Название урока — всегда одна строка. Если не помещается, по наведению
   оно плавно «пролистывается» влево до конца, при уходе — обратно к началу.
   transition на transform работает и в обратную сторону; длительность
   и дистанция приходят из :style карточки (titleScroll в скрипте). */
.lesson-title {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.lesson-title-inner {
  display: inline-block;
  transform: translateX(0);
  transition: transform var(--title-scroll-duration, 0ms) ease-in-out;
  will-change: transform;
}

.lesson-card:hover .lesson-title-inner.overflowed {
  transform: translateX(var(--title-scroll-distance, 0px));
}
</style>
