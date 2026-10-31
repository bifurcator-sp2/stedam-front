<!-- app/components/Education/TestsSearch.vue -->
<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import TestListElement from '~/components/Education/TestListElement.vue'

interface TaxonomyNode {
  id: number
  parent_id: number | null
  title: string | null
  description: string | null
  children: TaxonomyNode[]
}

const props = withDefaults(defineProps<{
  selectedTaxonomyId?: number | null
  taxonomyData?: TaxonomyNode[]
  columnsCount?: number
}>(), {
  columnsCount: 3,
})

const api = useApi()
const route = useRoute()
const router = useRouter()

// Берем данные из useProfile (как в plugins/profile.ts)
const { userData } = useProfile()
const currentUserId = computed(() => userData.value?.user_id)

const emit = defineEmits<{
  (e: 'open-taxonomy', id: number): void
  (e: 'select-test', test: any): void
  (e: 'open-test', test: any): void
}>()

// ==================== Проверка автономности ====================
// Если пропс передан — компонент работает изолированно от URL
const isAutonomous = computed(() => props.selectedTaxonomyId !== undefined && props.selectedTaxonomyId !== null)

// ==================== Локальное состояние ====================
const localSearch = ref('')
const localAll = ref(false)
const localPage = ref(1)
const searchInput = ref('')

// Инициализация из URL (только если НЕ автономный режим)
onMounted(() => {
  if (!isAutonomous.value) {
    const qSearch = route.query.search
    localSearch.value = Array.isArray(qSearch) ? qSearch[0] : qSearch || ''
    searchInput.value = localSearch.value

    const qAll = route.query.all
    localAll.value = qAll === 'true'

    const qPage = route.query.page
    const p = Number(Array.isArray(qPage) ? qPage[0] : qPage)
    localPage.value = Number.isFinite(p) && p > 0 ? p : 1
  }
})

// ==================== Вычисляемые данные ====================

const canClearTax = computed(() => {
  // В автономном режиме нельзя сбросить tax (он задается пропсом)
  if (isAutonomous.value) return false
  return route.query.tax !== undefined && route.query.tax !== ''
})

const currentTaxId = computed<number | undefined>(() => {
  // Если автономный режим — берем строго из пропса
  if (isAutonomous.value) {
    return props.selectedTaxonomyId ?? undefined
  }

  // Иначе приоритет у URL
  const raw = route.query.tax
  const v = Array.isArray(raw) ? raw[0] : raw

  if (v !== undefined) {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }

  return props.selectedTaxonomyId ?? undefined
})

const PER_PAGE = 15

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

// ==================== Поиск (Debounce) ====================

let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(searchInput, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)

  debounceTimer = setTimeout(() => {
    if (val === localSearch.value) return

    if (val.length > 2 || val.length === 0) {
      localSearch.value = val
      localPage.value = 1 // сбрасываем страницу при поиске

      if (!isAutonomous.value) {
        router.push({
          query: { ...route.query, search: val || undefined, page: undefined },
        })
      }
    }
  }, 500)
})

function clearSearch() {
  searchInput.value = ''
  localSearch.value = ''
  localPage.value = 1

  if (debounceTimer) clearTimeout(debounceTimer)

  if (!isAutonomous.value) {
    router.push({
      query: { ...route.query, search: undefined, page: undefined },
    })
  }
}

// ==================== Загрузка Заданий ====================

const { data, pending, error } = await useAsyncData<any>(
  () => `tests-list-${localPage.value}-${currentTaxId.value}-${localSearch.value}-${localAll.value}-${isAutonomous.value ? 'prop' : 'url'}`,
  () =>
    api.get('/teacher-tests', {
      params: {
        page: localPage.value,
        per_page: PER_PAGE,
        tax: currentTaxId.value,
        search: localSearch.value || undefined,
        all: localAll.value ? 'true' : undefined,
      },
    }),
  { watch: [localPage, currentTaxId, localSearch, localAll] },
)

const tests = computed(() => data.value?.data ?? [])
const meta = computed(() => data.value?.meta ?? null)

// ==================== Действия ====================

function toggleAll() {
  localAll.value = !localAll.value
  localPage.value = 1

  if (!isAutonomous.value) {
    router.push({
      query: {
        ...route.query,
        all: localAll.value ? 'true' : undefined,
        page: undefined,
      },
    })
  }
}

function onSelectTest(test: any) {
  emit('select-test', test)
}

function onOpenTaxonomy(id: number) {
  emit('open-taxonomy', id)
}

function goToPage(page: number) {
  if (page < 1) return
  localPage.value = page

  if (!isAutonomous.value) {
    router.replace({ query: { ...route.query, page: String(page) } })
  }
}
</script>

<template>
  <div class="flex flex-col gap-5 p-6 max-w-3xl mx-auto w-full">

    <!-- Хлебные крошки -->
    <div v-if="breadcrumbsText" class="mb-1 max-w-full">
      <div class="inline-flex items-start gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 text-sm font-medium text-slate-600 dark:text-slate-300 max-w-full">
        <UIcon name="i-lucide-folder-tree" class="w-4 h-4 shrink-0 text-slate-400 mt-[2px]" />
        <span class="break-all min-w-0 leading-snug">{{ breadcrumbsText }}</span>

        <button
          v-if="canClearTax"
          type="button"
          class="ml-1 mt-[2px] p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
          title="Сбросить фильтр по разделу"
          @click="router.push({ query: { ...route.query, tax: undefined, page: undefined } })"
        >
          <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Поиск и переключатель -->
    <div class="flex items-center gap-4 mb-2 w-full">
      <div class="flex items-center gap-2 cursor-pointer select-none shrink-0" @click="toggleAll">
        <USwitch :model-value="localAll" color="primary" />
        <span class="text-sm font-medium text-slate-600 dark:text-slate-300 min-w-[85px]">
          {{ localAll ? 'Все' : 'Только мои' }}
        </span>
      </div>

      <div class="relative flex-1">
        <UIcon
          name="i-lucide-search"
          class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
        <input
          v-model="searchInput"
          type="text"
          placeholder="Поиск по заданиям (от 3-х букв)..."
          class="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:ring-indigo-900"
        />
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
    </div>

    <!-- Контент -->
    <LoadingOverlay :loading="pending">
      <div v-if="error" class="py-8 text-center text-sm text-[var(--ui-text-muted,#9ca3af)]">
        Не удалось загрузить задания
      </div>
      <div v-else-if="!pending && tests.length === 0" class="py-8 text-center text-sm text-[var(--ui-text-muted,#9ca3af)]">
        Задания не найдены
      </div>

      <div v-else class="flex flex-col gap-5">
        <!-- Сетка -->
        <div
          class="grid gap-4 items-start"
          :style="{ gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))` }"
        >
          <button
            v-for="test in tests"
            :key="test.id"
            type="button"
            class="test-card w-full flex flex-col text-left rounded-xl border transition-all duration-200 overflow-hidden group border-default bg-default hover:border-primary/50 hover:shadow-md h-full"
            @click="onSelectTest(test)"
            @dblclick.stop="emit('open-test', test)"
          >
            <!-- Шапка карточки -->
            <div class="p-3 border-b border-default/50 flex items-center justify-between gap-2 bg-elevated/30">
              <div class="flex items-center gap-2 min-w-0">
                <div class="flex size-8 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                  <UIcon name="i-lucide-clipboard-check" class="size-4" />
                </div>
                <div class="min-w-0">
                  <span class="text-[13px] font-semibold text-highlighted block truncate">
                    Задание #{{ test.id }}
                  </span>
                  <span class="text-[10px] text-muted block">
                    {{ new Date(test.created_at).toLocaleDateString('ru-RU') }}
                  </span>
                </div>
              </div>

              <!-- Иконка владельца задания -->
              <div
                v-if="test.user_id && test.user_id === currentUserId"
                class="shrink-0 flex items-center justify-center size-6 rounded-full bg-primary/10 text-primary"
                title="Мое задание"
              >
                <UIcon name="i-lucide-user" class="size-3.5" />
              </div>
            </div>

            <!-- Превью -->
            <div class="p-2 bg-muted/10 relative flex-1">
              <TestListElement :test="test" />
            </div>

            <!-- Футер карточки -->
            <div class="p-2.5 border-t border-default/50 bg-elevated/10 flex items-center justify-between shrink-0">
              <span class="text-[11px] font-medium text-muted flex items-center gap-1.5">
                <UIcon name="i-lucide-activity" class="size-3.5" />
                Использований: {{ test.usages ?? 0 }}
              </span>
            </div>

          </button>
        </div>

        <!-- Пагинация -->
        <div class="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
          <UButton
            icon="i-lucide-chevron-left"
            color="neutral"
            variant="outline"
            :disabled="localPage <= 1"
            @click="goToPage(localPage - 1)"
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
            @click="goToPage(localPage + 1)"
          >
            Вперед
          </UButton>
        </div>
      </div>
    </LoadingOverlay>

  </div>
</template>
