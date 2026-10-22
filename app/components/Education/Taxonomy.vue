<!-- app/components/Education/Taxonomy.vue -->
<script setup lang="ts">
interface TaxonomyNode {
  id: number
  parent_id: number | null
  title: string | null
  description: string | null
  children: TaxonomyNode[]
}

// Добавлены пропсы для автономности
const props = defineProps<{
  data?: TaxonomyNode[]
  pending?: boolean
  error?: any
  refresh?: () => void
}>()

const emit = defineEmits<{
  select: [id: number]
}>()

const api = useApi()

// Фоллбэк-загрузка: если данные не переданы снаружи
const { data: internalData, pending: internalPending, error: internalError, refresh: internalRefresh } = await useAsyncData<TaxonomyNode[]>(
  'taxonomy-tree',
  async () => {
    const res = await api.get<{ data: TaxonomyNode[] }>('/taxonomies/tree', { silent: true })
    return res.data
  },
  { lazy: true, immediate: !props.data }
)

const roots = computed(() => props.data ?? internalData.value ?? [])
const pending = computed(() => props.pending !== undefined ? props.pending : internalPending.value)
const error = computed(() => props.error !== undefined ? props.error : internalError.value)
const refresh = () => props.refresh ? props.refresh() : internalRefresh()

// ==================== Избранное ====================
const favorites = ref<Set<number>>(new Set())
const showFavoritesOnly = ref(false)

onMounted(() => {
  const stored = localStorage.getItem('taxonomy-favorites')
  if (stored) {
    try {
      favorites.value = new Set(JSON.parse(stored))
    } catch {
      // ignore
    }
  }
})

watch(favorites, (val) => {
  localStorage.setItem('taxonomy-favorites', JSON.stringify(Array.from(val)))
}, { deep: true })

function toggleFavorite(id: number) {
  const next = new Set(favorites.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  favorites.value = next
}

function hasFavoriteDescendant(node: TaxonomyNode): boolean {
  if (favorites.value.has(node.id)) return true
  return node.children.some(hasFavoriteDescendant)
}

// ==================== Дерево и поиск ====================
const expanded = ref<Set<number>>(new Set())
const search = ref('')

function toggle(id: number) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

function expandAll() {
  const next = new Set<number>()
  const walk = (nodes: TaxonomyNode[]) => {
    for (const n of nodes) {
      if (n.children.length) {
        next.add(n.id)
        walk(n.children)
      }
    }
  }
  walk(roots.value)
  expanded.value = next
}

function collapseAll() {
  expanded.value = new Set()
}

watch(
  roots,
  (list) => {
    if (!list.length) return
    const next = new Set<number>()
    const walk = (nodes: TaxonomyNode[], depth: number) => {
      for (const n of nodes) {
        if (depth < 2) {
          next.add(n.id)
          walk(n.children, depth + 1)
        }
      }
    }
    walk(list, 0)
    expanded.value = next
  },
  { immediate: true },
)

function subtreeMatches(node: TaxonomyNode, ql: string): boolean {
  if ((node.title ?? '').toLowerCase().includes(ql)) return true
  if ((node.description ?? '').toLowerCase().includes(ql)) return true
  return node.children.some(c => subtreeMatches(c, ql))
}

const visibleRoots = computed(() => {
  let list = roots.value
  const q = search.value.trim().toLowerCase()
  if (q) {
    list = list.filter(n => subtreeMatches(n, q))
  }
  if (showFavoritesOnly.value) {
    list = list.filter(n => hasFavoriteDescendant(n))
  }
  return list
})
</script>

<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950">
    <div class="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div class="relative mb-4">
        <UIcon name="i-lucide-search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input v-model="search" type="text" placeholder="Поиск по предметам и темам..." class="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:ring-indigo-900" />
      </div>

      <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex gap-2">
          <button type="button" class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800" @click="expandAll">
            <UIcon name="i-lucide-unfold-vertical" class="h-3.5 w-3.5" />
            Раскрыть
          </button>
          <button type="button" class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800" @click="collapseAll">
            <UIcon name="i-lucide-fold-vertical" class="h-3.5 w-3.5" />
            Свернуть
          </button>
          <button type="button" class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800" @click="refresh">
            <UIcon name="i-lucide-refresh-cw" class="h-3.5 w-3.5" />
          </button>
          <button type="button" class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition" :class="showFavoritesOnly ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-300' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'" @click="showFavoritesOnly = !showFavoritesOnly">
            <UIcon name="i-lucide-star" class="h-3.5 w-3.5" :class="showFavoritesOnly ? 'fill-amber-500 text-amber-500' : ''" />
            Избранное
          </button>
        </div>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div v-if="pending" class="flex items-center justify-center py-16 text-slate-500">
          <UIcon name="i-lucide-loader-circle" class="mr-2 h-5 w-5 animate-spin" />
          Загрузка...
        </div>
        <div v-else-if="error" class="p-6 text-center text-sm text-red-600 dark:text-red-400">
          Не удалось загрузить дерево: {{ error.message }}
          <button type="button" class="ml-2 underline" @click="refresh">Повторить</button>
        </div>
        <div v-else-if="!visibleRoots.length" class="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Ничего не найдено
        </div>
        <ul v-else role="tree" class="p-1">
          <EducationTaxonomyNode
            v-for="root in visibleRoots"
            :key="root.id"
            :node="root"
            :depth="0"
            :expanded="expanded"
            :search="search"
            :favorites="favorites"
            :show-favorites-only="showFavoritesOnly"
            @toggle="toggle"
            @toggle-favorite="toggleFavorite"
            @select="emit('select', $event)"
          />
        </ul>
      </div>
    </div>
  </div>
</template>
