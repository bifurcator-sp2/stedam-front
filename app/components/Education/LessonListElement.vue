<!-- app/components/Education/LessonListElement.vue -->
<script setup lang="ts">
import type { LessonListItem } from '~/types/lesson'

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
    emitOpenOn?: 'click' | 'dblclick'
  }>(),
  {
    taxonomyTree: () => [],
    emitOpenOn: 'click',
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
  emit('open', props.lesson.id)
}

function onCardDblClick(): void {
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
</script>

<template>
  <div
    role="button"
    tabindex="0"
    class="lesson-card group w-full text-left rounded-lg border border-[var(--ui-border,#e5e7eb)] bg-[var(--ui-bg,#ffffff)] transition-colors hover:border-[var(--ui-primary,#3b82f6)] cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-primary,#3b82f6)] overflow-hidden border-l-4"
    :class="lesson.published
      ? 'border-l-emerald-500'
      : 'border-l-slate-300 dark:border-l-slate-600'"
    :aria-label="`Открыть урок: ${displayTitle(lesson)}`"
    @[openEvent]="onCardClick"
    @dblclick="onCardDblClick"
    @keydown="onCardKeydown"
  >
    <div
      class="p-3.5 transition-opacity duration-200"
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
