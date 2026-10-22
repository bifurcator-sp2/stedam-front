<!-- app/components/Constructor/LessonsSearch.vue -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { LessonListItem, LessonsPage } from '~/types/lesson'

interface TaxonomyNode {
  id: number
  parent_id: number | null
  title: string | null
  description: string | null
  children: TaxonomyNode[]
}

const props = defineProps<{
  selectedTaxonomyId?: number | null
  taxonomyData?: TaxonomyNode[]
}>()

const api = useApi()
const route = useRoute()
const router = useRouter()

const emit = defineEmits<{
  (e: 'open-taxonomy', id: number): void
  (e: 'select-lesson', id: number): void
}>()

const currentTaxId = computed<number | undefined>(() => {
  const raw = route.query.tax
  const v = Array.isArray(raw) ? raw[0] : raw
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : undefined
})

const currentSearch = computed<string>(() => {
  const raw = route.query.search
  return Array.isArray(raw) ? raw[0] : raw || ''
})

const PER_PAGE = 20
const currentPage = computed<number>({
  get() {
    const raw = route.query.page
    const v = Array.isArray(raw) ? raw[0] : raw
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : 1
  },
  set(page: number) {
    router.replace({ query: { ...route.query, page: String(page) } })
  },
})

// ==================== Данные Таксономии ====================

const { data: internalTaxonomyData } = await useAsyncData<TaxonomyNode[]>(
  'taxonomy-tree',
  async () => {
    const res = await api.get<{ data: TaxonomyNode[] }>('/taxonomies/tree', { silent: true })
    return res.data
  },
  { lazy: true, immediate: !props.taxonomyData }
)

const resolvedTaxonomy = computed<TaxonomyNode[]>(() => {
  return props.taxonomyData ?? internalTaxonomyData.value ?? []
})

// ==================== Вычисление хлебных крошек ====================

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

const currentPath = computed(() => {
  if (!currentTaxId.value || !resolvedTaxonomy.value.length) return []
  return findPath(resolvedTaxonomy.value, currentTaxId.value) || []
})

const breadcrumbsText = computed(() => {
  return currentPath.value.map(node => node.title).filter(Boolean).join(' / ')
})

// ==================== Поиск (Debounce с защитой от дублей) ====================

const searchInput = ref(currentSearch.value)

watch(currentSearch, (val) => {
  if (val !== searchInput.value) {
    searchInput.value = val
  }
})

let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(searchInput, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)

  debounceTimer = setTimeout(() => {
    if (val === currentSearch.value) return

    if (val.length > 2 || val.length === 0) {
      router.push({
        query: { ...route.query, search: val || undefined, page: undefined },
      })
    }
  }, 500)
})

// Очистка поиска по клику на крестик (мгновенно)
function clearSearch() {
  searchInput.value = ''
  if (debounceTimer) clearTimeout(debounceTimer)

  if (currentSearch.value) {
    router.push({
      query: { ...route.query, search: undefined, page: undefined },
    })
  }
}

// ==================== Загрузка Уроков ====================

const { data, pending, error } = await useAsyncData<LessonsPage>(
  () => `lessons-list-${currentPage.value}-${currentTaxId.value}-${currentSearch.value}`,
  () =>
    api.get<LessonsPage>('lessons', {
      params: {
        page: currentPage.value,
        per_page: PER_PAGE,
        tax: currentTaxId.value,
        search: currentSearch.value || undefined,
      },
    }),
  { watch: [currentPage, currentTaxId, currentSearch] },
)

const lessons = computed<LessonListItem[]>(() => data.value?.data ?? [])
const meta = computed(() => data.value?.meta ?? null)

// ==================== Действия ====================

function openLesson(id: number) {
  emit('select-lesson', id)
}

function openLessonConstructor(id: number) {
  router.push({ path: '/construct-lesson', query: { id: String(id) } })
}

function onOpenTaxonomy(id: number) {
  emit('open-taxonomy', id)
}

function goToPage(page: number) {
  if (page < 1) return
  currentPage.value = page
}
</script>

<template>
  <div class="flex flex-col gap-5 p-6 max-w-3xl mx-auto w-full">

    <!-- === Хлебные крошки над поиском === -->
    <div v-if="breadcrumbsText" class="mb-1 max-w-full">
      <!-- Используем flex items-start для выравнивания иконки с первой строкой текста -->
      <div class="inline-flex items-start gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 text-sm font-medium text-slate-600 dark:text-slate-300 max-w-full">
        <UIcon name="i-lucide-folder-tree" class="w-4 h-4 shrink-0 text-slate-400 mt-[2px]" />

        <!-- break-all принудительно переносит длинные слова, min-w-0 позволяет блоку сжиматься -->
        <span class="break-all min-w-0 leading-snug">{{ breadcrumbsText }}</span>

        <button
          type="button"
          class="ml-1 mt-[2px] p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
          title="Сбросить фильтр по разделу"
          @click="router.push({ query: { ...route.query, tax: undefined, page: undefined } })"
        >
          <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- === Поиск === -->
    <div class="relative mb-2">
      <UIcon
        name="i-lucide-search"
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      />
      <input
        v-model="searchInput"
        type="text"
        placeholder="Поиск по урокам (от 3-х букв)..."
        class="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:ring-indigo-900"
      />

      <!-- Кнопка очистки поиска (появляется, если есть текст) -->
      <button
        v-if="searchInput.length > 0"
        type="button"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-none"
        title="Очистить поиск"
        @click="clearSearch"
      >
        <UIcon name="i-lucide-x" class="h-4 w-4" />
      </button>
    </div>

    <!-- === Контент с оверлеем === -->
    <LoadingOverlay :loading="pending">
      <div v-if="error" class="py-8 text-center text-sm text-[var(--ui-text-muted,#9ca3af)]">
        Не удалось загрузить уроки
      </div>
      <div v-else-if="!pending && lessons.length === 0" class="py-8 text-center text-sm text-[var(--ui-text-muted,#9ca3af)]">
        Уроков пока нет
      </div>

      <div v-else class="flex flex-col gap-5">
        <ul class="flex flex-col gap-2">
          <li v-for="l in lessons" :key="l.id">
            <EducationLessonListElement
              :lesson="l"
              :taxonomy-tree="resolvedTaxonomy"
              emit-open-on="click"
              @open="openLesson"
              @open-dblclick="openLessonConstructor"
              @open-taxonomy="onOpenTaxonomy"
            />
          </li>
        </ul>

        <!-- === Простая пагинация === -->
        <div class="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
          <UButton
            icon="i-lucide-chevron-left"
            color="neutral"
            variant="outline"
            :disabled="currentPage <= 1"
            @click="goToPage(currentPage - 1)"
          >
            Назад
          </UButton>

          <span class="text-xs font-medium text-slate-500 font-mono">
            Страница {{ meta?.current_page || 1 }}
          </span>

          <UButton
            icon="i-lucide-chevron-right"
            trailing
            color="neutral"
            variant="outline"
            :disabled="!meta?.has_more_pages"
            @click="goToPage(currentPage + 1)"
          >
            Вперед
          </UButton>
        </div>
      </div>
    </LoadingOverlay>

  </div>
</template>
