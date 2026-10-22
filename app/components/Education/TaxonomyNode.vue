<!-- app/components/Education/TaxonomyNode.vue -->
<script setup lang="ts">
interface TaxonomyNode {
  id: number
  parent_id: number | null
  title: string | null
  description: string | null
  children: TaxonomyNode[]
}

const props = defineProps<{
  node: TaxonomyNode
  depth: number
  expanded: Set<number>
  search: string
  favorites: Set<number>
  showFavoritesOnly: boolean
}>()

const emit = defineEmits<{
  toggle: [id: number]
  select: [id: number]
  'toggle-favorite': [id: number]
}>()

function subtreeMatches(node: TaxonomyNode, ql: string): boolean {
  if ((node.title ?? '').toLowerCase().includes(ql)) return true
  if ((node.description ?? '').toLowerCase().includes(ql)) return true
  return node.children.some(c => subtreeMatches(c, ql))
}

function hasFavoriteDescendant(node: TaxonomyNode): boolean {
  if (props.favorites.has(node.id)) return true
  return node.children.some(hasFavoriteDescendant)
}

const visibleChildren = computed(() => {
  let list = props.node.children

  // Фильтрация по поиску
  const q = props.search.trim().toLowerCase()
  if (q) {
    list = list.filter(c => subtreeMatches(c, q))
  }

  // Фильтрация по избранному
  if (props.showFavoritesOnly) {
    list = list.filter(c => hasFavoriteDescendant(c))
  }

  return list
})

const hasChildren = computed(() => visibleChildren.value.length > 0)

const isOpen = computed(() => {
  // Если идет поиск или включен режим избранного — раскрываем всё, где есть совпадения
  if (props.search.trim() || props.showFavoritesOnly) return true
  return props.expanded.has(props.node.id)
})

const look = computed(() => {
  switch (props.depth) {
    case 0: return {
      icon: 'i-lucide-graduation-cap',
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      title: 'text-base font-bold text-slate-900 dark:text-white',
      row: 'bg-gradient-to-r from-indigo-50/70 to-transparent dark:from-indigo-950/40',
    }
    case 1: return {
      icon: 'i-lucide-layers',
      iconColor: 'text-indigo-500',
      title: 'text-sm font-semibold text-slate-800 dark:text-slate-100',
      row: '',
    }
    case 2: return {
      icon: 'i-lucide-book-open',
      iconColor: 'text-blue-500',
      title: 'text-sm font-medium text-slate-700 dark:text-slate-200',
      row: '',
    }
    case 3: return {
      icon: 'i-lucide-calendar',
      iconColor: 'text-emerald-500',
      title: 'text-sm text-slate-700 dark:text-slate-300',
      row: '',
    }
    default: return {
      icon: 'i-lucide-circle-dot',
      iconColor: 'text-slate-400',
      title: 'text-sm text-slate-600 dark:text-slate-400',
      row: '',
    }
  }
})

// Обработчик клика по строке узла
function onRowClick() {
  emit('select', props.node.id)
  if (hasChildren.value) {
    emit('toggle', props.node.id)
  }
}
</script>

<template>
  <li role="treeitem" :aria-expanded="hasChildren ? isOpen : undefined">
    <div
      class="group flex cursor-pointer items-center gap-1.5 rounded-md py-2 pr-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
      :class="look.row"
      @click="onRowClick"
    >
      <!-- Иконка "В избранное" (всегда прижата к левому краю) -->
      <button
        type="button"
        class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-300 transition hover:text-amber-400 dark:text-slate-600 dark:hover:text-amber-400"
        @click.stop="emit('toggle-favorite', node.id)"
      >
        <UIcon
          name="i-lucide-star"
          class="h-3.5 w-3.5"
          :class="favorites.has(node.id) ? 'fill-amber-400 text-amber-400' : ''"
        />
      </button>

      <!-- Отступ для вложенности (после звездочки) -->
      <div class="shrink-0" :style="{ width: `${depth * 16}px` }" />

      <!-- Кнопка развернуть/свернуть -->
      <button
        v-if="hasChildren"
        type="button"
        class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        @click.stop="emit('toggle', node.id)"
      >
        <UIcon
          :name="isOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="h-4 w-4"
        />
      </button>
      <span v-else class="h-5 w-5 shrink-0" />

      <!-- Иконка типа узла -->
      <UIcon :name="look.icon" class="h-4 w-4 shrink-0" :class="look.iconColor" />

      <!-- Контент узла -->
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span :class="look.title" class="truncate">
            {{ node.title || '—' }}
          </span>
          <span
            v-if="hasChildren"
            class="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          >
            {{ visibleChildren.length }}
          </span>
        </div>
        <p
          v-if="node.description && depth < 3"
          class="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400"
          :title="node.description"
        >
          {{ node.description }}
        </p>
      </div>
    </div>

    <ul v-if="hasChildren && isOpen" role="group">
      <EducationTaxonomyNode
        v-for="child in visibleChildren"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :expanded="expanded"
        :search="search"
        :favorites="favorites"
        :show-favorites-only="showFavoritesOnly"
        @toggle="emit('toggle', $event)"
        @select="emit('select', $event)"
        @toggle-favorite="emit('toggle-favorite', $event)"
      />
    </ul>
  </li>
</template>
