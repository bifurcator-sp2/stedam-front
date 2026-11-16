<!-- app/components/Education/CourseListElement.vue -->
<script setup lang="ts">
import type { CourseListItem } from '~/types/course'

interface TaxonomyNode {
  id: number
  parent_id: number | null
  title: string | null
  description: string | null
  children: TaxonomyNode[]
}

const props = withDefaults(
  defineProps<{
    course: CourseListItem
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

const chain = computed(() => {
  const taxId = props.course.tax_id
  if (!taxId || !props.taxonomyTree.length) return []

  const path = findPath(props.taxonomyTree, taxId) || []
  return path.map((node) => ({
    id: node.id,
    title: node.title || '—',
  }))
})

const hasBreadcrumbs = computed(() => chain.value.length > 0)

const openEvent = computed(() => props.emitOpenOn)

function displayTitle(c: CourseListItem): string {
  const t = (c.title ?? '').trim()
  return t || TITLE_FALLBACK
}

function displayDescription(c: CourseListItem): string {
  const d = (c.description ?? '').trim()
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
  emit('open', props.course.id)
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
    class="course-card group w-full text-left rounded-lg border border-[var(--ui-border,#e5e7eb)] bg-[var(--ui-bg,#ffffff)] transition-colors hover:border-[var(--ui-primary,#3b82f6)] cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-primary,#3b82f6)] overflow-hidden border-l-4"
    :class="course.is_system
      ? 'border-l-violet-400'
      : 'border-l-emerald-500'"
    :aria-label="`Открыть курс: ${displayTitle(course)}`"
    @[openEvent]="onCardClick"
    @keydown="onCardKeydown"
  >
    <div
      class="p-3.5 transition-opacity duration-200"
      :class="course.published ? 'opacity-100' : 'opacity-60 hover:opacity-100'"
    >
      <!-- Верхняя строка: ID, счётчик уроков, бейдж, дата -->
      <div class="flex items-center gap-2 mb-1.5 text-[11px] font-mono text-[var(--ui-text-muted,#9ca3af)]">
        <span>#{{ course.id }}</span>
        <span class="text-[var(--ui-border,#e5e7eb)]">·</span>
        <span class="inline-flex items-center gap-1">
          <UIcon name="i-lucide-book-open" class="w-3 h-3" />
          {{ course.lessons_count ?? 0 }}
        </span>

        <span
          v-if="course.is_system"
          class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium font-sans bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
        >
          Системный
        </span>

        <span
          class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium font-sans"
          :class="course.published
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'"
        >
          <UIcon :name="course.published ? 'i-lucide-lock' : 'i-lucide-pencil'" class="w-3 h-3" />
          {{ course.published ? 'Опубликован' : 'Черновик' }}
        </span>

        <span class="ml-auto">{{ formatDate(course.updated_at) }}</span>
      </div>

      <!-- Хлебные крошки -->
      <nav
        v-if="hasBreadcrumbs"
        class="mb-2"
        aria-label="Хлебные крошки"
      >
        <ol class="flex flex-wrap items-center gap-x-0.5 gap-y-0 text-[11px] leading-tight text-[var(--ui-text-muted,#9ca3af)]">
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
        :class="course.title?.trim()
          ? 'text-[var(--ui-text,#111827)]'
          : 'text-[var(--ui-text-muted,#9ca3af)] italic'"
      >
        {{ displayTitle(course) }}
      </div>

      <!-- Описание -->
      <div
        class="text-xs leading-normal line-clamp-2"
        :class="course.description?.trim()
          ? 'text-[var(--ui-text-muted,#64748b)]'
          : 'text-[var(--ui-text-muted,#9ca3af)] italic'"
      >
        {{ displayDescription(course) }}
      </div>
    </div>
  </div>
</template>
