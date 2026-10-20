<script setup lang="ts">
interface TaxonomyNode {
  id: number
  parent_id: number | null
  title: string | null
  description: string | null
  children: TaxonomyNode[]
}

const api = useApi()

const { data, pending, error, refresh } = await useAsyncData<TaxonomyNode[]>(
  'taxonomy-tree',
  async () => {
    const res = await api.get<{ data: TaxonomyNode[] }>('/taxonomies/tree', { silent: true })
    return res.data
  },
)

const roots = computed(() => data.value ?? [])
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
  const q = search.value.trim().toLowerCase()
  if (!q) return roots.value
  return roots.value.filter(n => subtreeMatches(n, q))
})

const stats = computed(() => {
  let stages = 0
  let classes = 0
  let topics = 0
  const subjects = new Set<string>()
  const walk = (nodes: TaxonomyNode[], depth: number) => {
    for (const n of nodes) {
      if (depth === 1) stages++
      else if (depth === 2) subjects.add(n.title ?? `#${n.id}`)
      else if (depth === 3) classes++
      else if (depth === 4) topics++
      walk(n.children, depth + 1)
    }
  }
  walk(roots.value, 0)
  return { stages, subjects: subjects.size, classes, topics }
})
</script>

<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950">
    <div class="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header class="mb-6 hidden">
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
          Учебная программа
        </h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Иерархия дисциплин, классов и тем школьного образования РФ
        </p>
      </header>

      <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 hidden">
        <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="text-xs font-medium text-slate-500 dark:text-slate-400">Ступеней</div>
          <div class="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{{ stats.stages }}</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="text-xs font-medium text-slate-500 dark:text-slate-400">Дисциплин</div>
          <div class="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{{ stats.subjects }}</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="text-xs font-medium text-slate-500 dark:text-slate-400">Классов</div>
          <div class="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{{ stats.classes }}</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="text-xs font-medium text-slate-500 dark:text-slate-400">Тем</div>
          <div class="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{{ stats.topics }}</div>
        </div>
      </div>

      <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div class="relative flex-1">
          <UIcon
            name="i-lucide-search"
            class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <input
            v-model="search"
            type="text"
            placeholder="Поиск по предметам и темам..."
            class="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:ring-indigo-900"
          />
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="expandAll"
          >
            <UIcon name="i-lucide-unfold-vertical" class="h-3.5 w-3.5" />
            Раскрыть
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="collapseAll"
          >
            <UIcon name="i-lucide-fold-vertical" class="h-3.5 w-3.5" />
            Свернуть
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="refresh()"
          >
            <UIcon name="i-lucide-refresh-cw" class="h-3.5 w-3.5" />
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
          <button type="button" class="ml-2 underline" @click="refresh()">Повторить</button>
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
            @toggle="toggle"
          />
        </ul>
      </div>
    </div>
  </div>
</template>
