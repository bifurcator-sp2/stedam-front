<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { LessonTypeOption } from '~/types/lesson'
import type { ThemeLessonDrag, ThemeModel } from '~/types/course'

// ==================== Props / Emits ====================

interface Props {
  theme: ThemeModel
  readOnly?: boolean
  selectedLessonId?: number | null
  lessonTypes?: LessonTypeOption[]
}

const props = withDefaults(defineProps<Props>(), {
  readOnly: false,
  selectedLessonId: null,
  lessonTypes: () => [],
})

const emit = defineEmits<{
  (e: 'update:theme', value: ThemeModel): void
  (e: 'remove'): void
  (e: 'select-lesson', id: number): void
  (e: 'drop-lesson'): void
  (e: 'remove-lesson', localId: string): void
  // Вставка перетаскиваемого урока (из этой или другой темы) в позицию index.
  (e: 'insert-lesson', payload: { index: number, source: ThemeLessonDrag }): void
  // Перестановка тем: начало/конец перетаскивания за ручку.
  (e: 'theme-drag-start', localId: string): void
  (e: 'theme-drag-end'): void
}>()

// ==================== Внутренний DnD уроков между темами ====================

// Источник перетаскивания урока внутри конструктора тем (в отличие от drag из левой панели).
function getInternalDrag(): ThemeLessonDrag | null {
  if (!import.meta.client) return null
  return ((window as any).__draggedThemeLesson as ThemeLessonDrag | null) ?? null
}

// Индекс «щели» между уроками (0..length), над которой сейчас курсор.
const dropIndex = ref<number | null>(null)

// Идёт перетаскивание урока (своего или из другой темы) — показываем стрелки порядка.
const draggingInside = computed(() => dropIndex.value !== null)

// Тема не может открываться с home_work — проверяем при перетаскивании в неё.
// Внутреннее перетаскивание (между темами / внутри темы) + инфо о home_work.
function canDropInternal(index: number): boolean {
  const source = getInternalDrag()
  if (!source) return false
  const lesson = props.theme.lessons.find((l) => l.localId === source.lessonLocalId)
  return !(index === 0 && lesson && isHomeWork(lesson))
}

// Щель-дроп-зона: и перестановка внутри темы, и перенос между темами.
function onSlotDragOver(e: DragEvent, index: number) {
  if (props.readOnly) return
  const source = getInternalDrag()
  if (!source) return
  e.preventDefault()
  e.stopPropagation()
  const allowed = canDropInternal(index)
  if (e.dataTransfer) e.dataTransfer.dropEffect = allowed ? 'move' : 'none'
  if (allowed) dropIndex.value = index
}

function onSlotDragLeave(e: DragEvent, index: number) {
  const related = e.relatedTarget as Node | null
  const current = e.currentTarget as HTMLElement | null
  if (related && current && current.contains(related)) return
  if (dropIndex.value === index) dropIndex.value = null
}

function onSlotDrop(e: DragEvent, index: number) {
  dropIndex.value = null
  const source = getInternalDrag()
  if (!source) return
  e.preventDefault()
  e.stopPropagation()
  emit('insert-lesson', { index, source })
  ;(window as any).__draggedThemeLesson = null
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
  if (!isLessonDrag()) return
  // Тип перетаскиваемого урока приходит в payload — фиксируем при входе в тему.
  draggingHomeWork.value = readDraggedLessonType() === HOME_WORK_TYPE
  isDragOver.value = true
}

function onDragOver(e: DragEvent) {
  if (props.readOnly) return
  if (!isLessonDrag()) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  isDragOver.value = true
}

function onDragLeave(e: DragEvent) {
  const related = e.relatedTarget as Node | null
  const current = e.currentTarget as HTMLElement | null
  if (related && current && current.contains(related)) return
  isDragOver.value = false
  draggingHomeWork.value = false
}

function onDrop(e: DragEvent) {
  if (props.readOnly) return
  if (!isLessonDrag()) {
    isDragOver.value = false
    return
  }
  e.preventDefault()
  e.stopPropagation()
  isDragOver.value = false
  emit('drop-lesson')
}

// В тему дропаются только уроки (см. resolveLessonSource в CoursesConstructor).
function isLessonDrag(): boolean {
  if (!import.meta.client) return false
  const native = (window as any).__draggedLessonSource as { id?: unknown } | null
  if (native && typeof native.id === 'number') return true

  const block = (window as any).__draggedBlockSource as { kind?: string, id?: unknown } | null
  return block?.kind === 'lesson' && Number.isFinite(Number(block.id))
}

// Перетаскиваемый из левой панели урок — домашняя работа (читаем тип из payload).
const draggingHomeWork = ref(false)

// Тип урока приходит в payload drag из левой панели.
function readDraggedLessonType(): string | null {
  if (!import.meta.client) return null
  const native = (window as any).__draggedLessonSource as { type?: string | null } | null
  return native?.type ?? null
}

function onLessonDragStart(e: DragEvent, lesson: { localId: string, type?: string | null }) {
  if (props.readOnly) return
  ;(window as any).__draggedThemeLesson = { themeLocalId: props.theme.localId, lessonLocalId: lesson.localId } satisfies ThemeLessonDrag
  draggingHomeWork.value = isHomeWork(lesson)
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', lesson.localId)
  }
}

function onLessonDragEnd() {
  ;(window as any).__draggedThemeLesson = null
  draggingHomeWork.value = false
  dropIndex.value = null
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
      console.warn('[LessonTheme] lesson types unavailable', e)
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

// Цвет типа урока (как бейдж в Education/LessonListElement).
function normalizeColor(raw: string | null | undefined): string | null {
  const c = (raw ?? '').trim()
  if (!c) return null
  if (/^#([0-9a-f]{3,8})$/i.test(c)) return c
  if (/^([0-9a-f]{3,8})$/i.test(c)) return `#${c}`
  return c
}

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

// Каждый урок рисуется своей карточкой; home_work правее предыдущей на 50px
// и выше на 100px — она выглядывает из-за соседней карточки.
function isStackedHomeWork(index: number): boolean {
  return isHomeWork(props.theme.lessons[index] ?? {}) && index > 0
}

// Есть ли в ленте подложенная home_work: только тогда нужен верхний отступ,
// чтобы её верхняя часть не обрезалась прокруткой.
const hasStackedHomeWork = computed<boolean>(() =>
  props.theme.lessons.some((_, index) => isStackedHomeWork(index)),
)

// В теме есть хотя бы одна home_work — ленте нужен верхний отступ,
// чтобы поднятые карточки домашних работ не обрезались.
const hasHomeWork = computed<boolean>(() => props.theme.lessons.some((l) => isHomeWork(l)))
</script>

<template>
  <section
    class="group/theme rounded-lg border p-1 shadow-sm transition-colors [background-color:var(--ui-bg,#ffffff)] [border-color:var(--ui-border,#e5e7eb)]"
    :class="isDragOver
      ? '!border-[var(--ui-primary,#3b82f6)] bg-primary/5 ring-2 ring-primary/30'
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
        class="pointer-events-none absolute inset-x-14 top-0.5 flex items-center justify-center gap-1"
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
        :class="hasStackedHomeWork ? 'pt-8 pb-1' : 'pt-1 pb-1'"
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
            class="group/slot relative flex w-5 shrink-0 cursor-grabbing items-center justify-center self-stretch"
            data-lesson-slot
            title="Вставить урок сюда"
            @dragenter.prevent.stop="onSlotDragOver($event, index)"
            @dragover="onSlotDragOver($event, index)"
            @dragleave="onSlotDragLeave($event, index)"
            @drop="onSlotDrop($event, index)"
          >
            <!-- Статичный вид: порядок уроков слева направо -->
            <UIcon
              name="i-lucide-chevron-right"
              class="size-4 shrink-0 transition-colors"
              :class="draggingInside
                ? (dropIndex === index
                    ? 'text-[var(--ui-primary,#3b82f6)]'
                    : 'text-[var(--ui-primary,#3b82f6)]/50 group-hover/slot:text-[var(--ui-primary,#3b82f6)]')
                : 'text-muted/40 group-hover/slot:text-[var(--ui-primary,#3b82f6)]/60'"
            />

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
            class="lesson-card group/lesson relative w-[200px] shrink-0 snap-start cursor-grab rounded-lg border py-2.5 pl-3.5 pr-2.5 text-left shadow-sm outline-none transition-[transform,box-shadow,border-color] [background-color:var(--ui-bg-elevated,#f1f5f9)] [border-color:var(--ui-border,#e5e7eb)] active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-[var(--ui-primary,#3b82f6)]/40"
            :class="[
              isStackedHomeWork(index)
                ? '-ml-[170px] -translate-y-[27px] z-0 shadow-md'
                : 'z-[1] hover:shadow',
              selectedLessonId === lesson.id
                ? 'border-primary ring-1 ring-primary/40'
                : (isStackedHomeWork(index)
                    ? ''
                    : 'hover:border-[var(--ui-primary,#3b82f6)]/60'),
              isOrphanHomeWork[index]
                ? 'ring-1 ring-dashed ring-warning/50'
                : '',
            ]"
            :title="isOrphanHomeWork[index] ? 'Домашняя работа не может открывать тему — добавьте урок перед ней' : undefined"
            :style="lessonAccentStyle(lesson.type)"
            :data-type-accent="lessonAccentClassAttr(lesson.type)"
            @dragstart="onLessonDragStart($event, lesson)"
            @dragend="onLessonDragEnd"
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
              class="line-clamp-2 text-xs font-medium leading-snug"
              :class="lesson.title?.trim() ? 'text-highlighted' : 'italic text-muted'"
            >
              {{ displayTitle(lesson.title) }}
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
          data-lesson-slot
          title="Вставить урок сюда"
          @dragenter.prevent.stop="onSlotDragOver($event, theme.lessons.length)"
          @dragover="onSlotDragOver($event, theme.lessons.length)"
          @dragleave="onSlotDragLeave($event, theme.lessons.length)"
          @drop="onSlotDrop($event, theme.lessons.length)"
        >
          <UIcon
            name="i-lucide-chevron-right"
            class="size-4 shrink-0 transition-colors"
            :class="draggingInside
              ? (dropIndex === theme.lessons.length
                  ? 'text-[var(--ui-primary,#3b82f6)]'
                  : 'text-[var(--ui-primary,#3b82f6)]/50 group-hover/slot:text-[var(--ui-primary,#3b82f6)]')
              : 'text-muted/40 group-hover/slot:text-[var(--ui-primary,#3b82f6)]/60'"
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
</style>
