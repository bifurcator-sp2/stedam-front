<!-- app/components/Education/LessonListElement.vue -->
<script setup lang="ts">
import type { LessonListItem, LessonTypeOption } from '~/types/lesson'
import { lessonTypeCssVars } from '~/utils/lessonType'

interface TaxonomyNode {
  id: number
  parent_id: number | null
  title: string | null
  description: string | null
  children: TaxonomyNode[]
}

interface LessonWithTaxonomies extends LessonListItem {
  taxonomy_ids?: number[]
}

const props = withDefaults(
  defineProps<{
    lesson: LessonWithTaxonomies
    taxonomyTree?: TaxonomyNode[]
    lessonTypes?: LessonTypeOption[]
    emitOpenOn?: 'click' | 'dblclick'
    // Урок открывается только для чтения (пройден и оценён)
    disabled?: boolean
    // Нажатие на карточку не эмитит open — переход выполняет контент слота actions
    cardReadonly?: boolean
  }>(),
  {
    taxonomyTree: () => [],
    lessonTypes: () => [],
    emitOpenOn: 'click',
    disabled: false,
    cardReadonly: false,
  }
)

const emit = defineEmits<{
  (e: 'open', id: number): void
  (e: 'open-dblclick', id: number): void
  (e: 'open-taxonomy', id: number): void
}>()

const TITLE_FALLBACK = 'Без названия'
const DESCRIPTION_FALLBACK = 'Без описания'

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

const chains = computed(() => {
  const taxIds = props.lesson.taxonomy_ids ?? []
  const tree = props.taxonomyTree

  if (!tree.length || !taxIds.length) return []

  return taxIds.map((id) => {
    const path = findPath(tree, id) || []
    return path.map((node) => ({
      id: node.id,
      title: node.title || '—',
    }))
  }).filter((chain) => chain.length > 0)
})

const hasBreadcrumbs = computed(() => chains.value.length > 0)

const lessonType = computed<LessonTypeOption | null>(() => {
  const code = props.lesson.type
  if (!code) return null
  return props.lessonTypes.find((t) => t.code === code) ?? null
})

// Контур + заливка карточки по типу урока (home_work, class_work, …)
const typeCssVars = computed(() => lessonTypeCssVars(lessonType.value))

const openEvent = computed(() => props.emitOpenOn)

function displayTitle(l: LessonWithTaxonomies): string {
  const t = (l.title ?? '').trim()
  return t || TITLE_FALLBACK
}

function displayDescription(l: LessonWithTaxonomies): string {
  const d = (l.description ?? '').trim()
  return d || DESCRIPTION_FALLBACK
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'

  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function onCardClick(): void {
  if (dragActive || props.cardReadonly) return
  emit('open', props.lesson.id)
}

function onCardDblClick(): void {
  if (props.cardReadonly) return
  if (props.emitOpenOn !== 'dblclick') {
    emit('open-dblclick', props.lesson.id)
  }
}

function onCrumbClick(id: number, ev: MouseEvent): void {
  ev.stopPropagation()
  emit('open-taxonomy', id)
}

function onCardKeydown(ev: KeyboardEvent): void {
  if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault()
    onCardClick()
  }
}

// ==================== Drag урока ====================

let dragActive = false

function onCardDragStart(ev: DragEvent): void {
  if (props.disabled || !ev.dataTransfer) {
    ev.preventDefault()
    return
  }
  dragActive = true

  const source = {
    id: props.lesson.id,
    title: props.lesson.title ?? null,
    description: props.lesson.description ?? null,
    type: props.lesson.type ?? null,
    blocks_count: props.lesson.blocks_count ?? 0,
    saved: props.lesson.saved ?? false,
    published: props.lesson.published ?? false,
    created_at: props.lesson.created_at ?? null,
    updated_at: props.lesson.updated_at ?? null,
    taxonomy_ids: props.lesson.taxonomy_ids ?? [],
  }

  ;(window as any).__draggedLessonSource = source
  ev.dataTransfer.effectAllowed = 'copy'
  ev.dataTransfer.setData('text/plain', String(props.lesson.id))
}

function onCardDragEnd(): void {
  ;(window as any).__draggedLessonSource = null
  setTimeout(() => {
    dragActive = false
  }, 50)
}
</script>

<template>
  <div
    role="button"
    tabindex="0"
    :draggable="!disabled"
    class="lesson-card group flex items-stretch w-full text-left rounded-lg border transition-colors select-none overflow-hidden border-l-4"
    :style="typeCssVars
      ? { ...typeCssVars, borderColor: 'var(--lesson-type-border)', backgroundColor: 'var(--lesson-type-bg)' }
      : undefined"
    :class="[
      typeCssVars
        ? ''
        : lesson.published
          ? 'border-[var(--ui-border,#e5e7eb)] border-l-emerald-500 bg-[var(--ui-bg,#ffffff)]'
          : 'border-[var(--ui-border,#e5e7eb)] border-l-slate-300 dark:border-l-slate-600 bg-[var(--ui-bg,#ffffff)]',
      disabled
        ? 'cursor-default opacity-80'
        : 'cursor-grab active:cursor-grabbing hover:border-[var(--ui-primary,#3b82f6)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-primary,#3b82f6)]',
    ]"
    :aria-label="`Открыть урок: ${displayTitle(lesson)}`"
    :aria-disabled="disabled"
    @[openEvent]="onCardClick"
    @dblclick="onCardDblClick"
    @keydown="onCardKeydown"
    @dragstart="onCardDragStart"
    @dragend="onCardDragEnd"
  >
    <!-- Слот правой части (кнопка действия); клики не всплывают на карточку.
         Белая подложка под кнопкой, чтобы цвета кнопки не смешивались с фоном карточки. -->
    <div
      v-if="$slots.actions"
      class="order-2 flex shrink-0 items-center px-2"
      @click.stop
      @dblclick.stop
    >
      <div class="action-plate w-[145px] rounded-lg p-0.5">
        <slot
          name="actions"
          :lesson="lesson"
          :disabled="disabled"
        />
      </div>
    </div>

    <div
      class="order-1 flex-1 min-w-0 p-3.5 transition-opacity duration-200"
      :class="lesson.published ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'"
    >
      <!-- Верхняя строка: ID, счётчик блоков, дата -->
      <div class="flex items-center gap-2 mb-1.5 text-[11px] font-mono text-[var(--ui-text-muted,#9ca3af)]">
        <span>#{{ lesson.id }}</span>
        <span class="text-[var(--ui-border,#e5e7eb)]">·</span>
        <span class="inline-flex items-center gap-1">
          <UIcon name="i-lucide-layers" class="w-3 h-3" />
          {{ lesson.blocks_count }}
        </span>
        <!-- Тип урока -->
        <span class="text-[var(--ui-border,#e5e7eb)]">·</span>
        <span
          v-if="lessonType"
          class="inline-flex items-center gap-1 rounded-full border px-1.5 leading-tight whitespace-nowrap"
          :style="{
            borderColor: 'var(--lesson-type-badge)',
            color: 'var(--lesson-type-badge)',
            backgroundColor: 'var(--lesson-type-bg)',
          }"
          :title="lessonType.description || undefined"
        >
          <UIcon name="i-lucide-tag" class="w-3 h-3" />
          {{ lessonType.title }}
        </span>
        <span v-else class="inline-flex items-center gap-1 opacity-70">
          <UIcon name="i-lucide-tag" class="w-3 h-3" />
          —
        </span>
        <span class="ml-auto">{{ formatDate(lesson.created_at) }}</span>
      </div>

      <!-- Хлебные крошки -->
      <nav
        v-if="hasBreadcrumbs"
        class="mb-2 space-y-0.5"
        aria-label="Хлебные крошки"
      >
        <ol
          v-for="(chain, ci) in chains"
          :key="`chain-${ci}`"
          class="flex flex-wrap items-center gap-x-0.5 gap-y-0 text-[11px] leading-tight text-[var(--ui-text-muted,#9ca3af)]"
        >
          <li
            v-for="(crumb, i) in chain"
            :key="crumb.id"
            class="inline-flex items-center gap-0.5 min-w-0"
          >
            <button
              type="button"
              class="truncate max-w-[14rem] rounded px-0.5 -mx-0.5 hover:text-[var(--ui-primary,#3b82f6)] hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ui-primary,#3b82f6)]"
              :class="i === chain.length - 1
                ? 'font-medium text-[var(--ui-text,#111827)]'
                : ''"
              :title="crumb.title"
              @click="onCrumbClick(crumb.id, $event)"
              @dblclick.stop
            >
              {{ crumb.title }}
            </button>

            <UIcon
              v-if="i < chain.length - 1"
              name="i-lucide-chevron-right"
              class="w-3 h-3 shrink-0 opacity-50"
              aria-hidden="true"
            />
          </li>
        </ol>
      </nav>

      <!-- Название -->
      <div
        class="text-sm font-medium mb-1"
        :class="lesson.title?.trim()
          ? 'text-[var(--ui-text,#111827)]'
          : 'text-[var(--ui-text-muted,#9ca3af)] italic'"
      >
        {{ displayTitle(lesson) }}
      </div>

      <!-- Описание -->
      <div
        class="text-xs leading-normal line-clamp-2"
        :class="lesson.description?.trim()
          ? 'text-[var(--ui-text-muted,#64748b)]'
          : 'text-[var(--ui-text-muted,#9ca3af)] italic'"
      >
        {{ displayDescription(lesson) }}
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Белая подложка под кнопкой действия: кнопка рисуется поверх неё */
.action-plate {
  background-color: #ffffff;
}

/* Кнопка действия занимает всю фиксированную ширину подложки */
.action-plate :deep(button) {
  width: 100%;
}
</style>
