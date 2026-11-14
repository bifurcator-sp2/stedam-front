<!-- app/components/Education/TestsSearch.vue -->
<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, toRaw } from 'vue'
import TestListElement from '~/components/Education/TestListElement.vue'
import ComplexitySelector from '~/components/Constructor/ComplexitySelector.vue'

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
  columns?: 1 | 2
  columnsCount?: number
  draggable?: boolean
  autonomous?: boolean
}>(), {
  columnsCount: 3,
  draggable: false,
  autonomous: undefined
})

const api = useApi()
const route = useRoute()
const router = useRouter()

// Данные для "Мое задание"
const { userData } = useProfile()
const currentUserId = computed(() => userData.value?.user_id)

// Проверка на администратора через useAuth
const { hasRole } = useAuth()
const isAdmin = computed(() => hasRole('admin'))

const emit = defineEmits<{
  (e: 'open-taxonomy', id: number): void
  (e: 'select-test', test: any): void
  (e: 'open-test', test: any): void
}>()

// ==================== Цвет по сложности ====================

function complexityCardClass(complexity: number | null | undefined): string {
  if (complexity == null || !Number.isFinite(Number(complexity))) {
    return 'border-default hover:border-primary/50'
  }
  const level = complexityLevel(complexity)
  return `${level.border} ${level.borderHover}`
}

// ==================== Колонки ====================

const resolvedColumns = computed<number>(() =>
  props.columns != null ? props.columns : props.columnsCount
)

// ==================== Автономность ====================

const isAutonomous = computed(() => {
  if (props.autonomous === true) return true
  if (props.autonomous === false) return false
  return props.selectedTaxonomyId !== undefined && props.selectedTaxonomyId !== null
})

// ==================== Респонсив по контейнеру ====================

const rootRef = ref<HTMLElement | null>(null)
const rootWidth = ref(0)
let resizeObserver: ResizeObserver | null = null

const isCompact = computed(() => rootWidth.value > 0 && rootWidth.value < 480)
const isVeryCompact = computed(() => rootWidth.value > 0 && rootWidth.value < 320)

// Уменьшенные отступы для соответствия новому дизайну без скруглений
const padClass = computed(() =>
  isVeryCompact.value
    ? 'p-1'
    : isCompact.value
      ? 'p-2'
      : 'p-3'
)

const gapClass = computed(() => isCompact.value ? 'gap-1.5' : 'gap-3')

const headerRowClass = computed(() =>
  isCompact.value
    ? 'flex flex-col items-stretch gap-1 w-full'
    : 'flex flex-wrap items-center gap-2 w-full'
)

const switchRowClass = computed(() =>
  isCompact.value
    ? 'flex items-center gap-3 w-full'
    : 'flex items-center gap-3 shrink-0'
)

const searchWrapClass = computed(() =>
  isCompact.value
    ? 'relative w-full'
    : 'relative flex-1 min-w-[180px]'
)

const effectiveColumns = computed(() =>
  isVeryCompact.value ? 1 : resolvedColumns.value
)

const breadcrumbClass = computed(() =>
  isCompact.value
    ? 'inline-flex flex-wrap items-start gap-1 px-1 py-0.5 border border-default bg-elevated text-[11px] font-medium text-muted max-w-full'
    : 'inline-flex flex-wrap items-start gap-1 px-1.5 py-1 border border-default bg-elevated text-xs font-medium text-muted max-w-full'
)

// ==================== Локальное состояние ====================

const localSearch = ref('')
const localAll = ref(false)
const localIsProc = ref(false) // По умолчанию Уникальные (false)
const localPage = ref(1)
const searchInput = ref('')

// ==================== Вычисляемые данные ====================

const canClearTax = computed(() => {
  if (isAutonomous.value) return false
  return route.query.tax !== undefined && route.query.tax !== ''
})

const currentTaxId = computed<number | undefined>(() => {
  if (isAutonomous.value) {
    return props.selectedTaxonomyId ?? undefined
  }

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

// ==================== Хлебные крошки ====================

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
      localPage.value = 1

      if (!isAutonomous.value) {
        router.push({
          query: { ...route.query, search: val || undefined, page: undefined }
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
      query: { ...route.query, search: undefined, page: undefined }
    })
  }
}

// ==================== Загрузка заданий ====================

// Добавлен refresh для принудительного обновления
const { data, pending, error, refresh } = await useAsyncData<any>(
  () => `tests-list-${localPage.value}-${currentTaxId.value}-${localSearch.value}-${localAll.value}-${localIsProc.value}-${isAutonomous.value ? 'prop' : 'url'}`,
  () =>
    api.get('/teacher-tests', {
      params: {
        page: localPage.value,
        per_page: PER_PAGE,
        tax: currentTaxId.value,
        search: localSearch.value || undefined,
        all: localAll.value ? 'true' : undefined,
        ...(isAdmin.value ? { is_proc: localIsProc.value ? 'true' : 'false' } : {})
      }
    }),
  { watch: [localPage, currentTaxId, localSearch, localAll, localIsProc] }
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
        page: undefined
      }
    })
  } else {
    refresh()
  }
}

function toggleProc() {
  localIsProc.value = !localIsProc.value
  localPage.value = 1

  if (!isAutonomous.value) {
    router.push({
      query: {
        ...route.query,
        is_proc: localIsProc.value ? 'true' : 'false',
        page: undefined
      }
    })
  } else {
    refresh()
  }
}

// ==================== Drag карточек ====================

let testDragActive = false

function onTestDragStart(e: DragEvent, test: any) {
  if (!props.draggable) return
  if (!e.dataTransfer) return

  testDragActive = true

  const settings = test.settings
    ? JSON.parse(JSON.stringify(toRaw(test.settings)))
    : null

  ;(window as any).__draggedBlockSource = {
    fromSearch: true,
    block: {
      id: test.id,
      block_type_code: test.block_type_code ?? test.code ?? '',
      settings,
      is_test: true
    }
  }

  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('text/plain', String(test.id))
}

function onTestDragEnd() {
  ;(window as any).__draggedBlockSource = null
  setTimeout(() => { testDragActive = false }, 50)
}

// ==================== Клики ====================

function onTestClick(test: any) {
  if (testDragActive) return
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
  } else {
    refresh()
  }
}

// ==================== Lifecycle ====================

onMounted(() => {
  if (!isAutonomous.value) {
    const qSearch = route.query.search
    localSearch.value = Array.isArray(qSearch) ? qSearch[0] : qSearch || ''
    searchInput.value = localSearch.value

    const qAll = route.query.all
    localAll.value = qAll === 'true'

    const qProc = route.query.is_proc
    localIsProc.value = qProc === 'true'

    const qPage = route.query.page
    const p = Number(Array.isArray(qPage) ? qPage[0] : qPage)
    localPage.value = Number.isFinite(p) && p > 0 ? p : 1
  }

  if (rootRef.value) {
    // ИСПРАВЛЕНИЕ МЕРЦАНИЯ: Используем border-box, чтобы изменение внутренних отступов (padding)
    // не вызывало повторный триггер ResizeObserver
    resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return
      const width = entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width
      rootWidth.value = width
    })
    resizeObserver.observe(rootRef.value, { box: 'border-box' })
    rootWidth.value = rootRef.value.getBoundingClientRect().width
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<template>
  <div
    ref="rootRef"
    class="flex flex-col mx-auto w-full min-w-0 max-w-3xl"
    :class="[padClass, gapClass]"
  >
    <!-- Хлебные крошки -->
    <div
      v-if="breadcrumbsText"
      class="w-full max-w-full min-w-0"
    >
      <div :class="breadcrumbClass">
        <UIcon
          name="i-lucide-folder-tree"
          class="w-4 h-4 shrink-0 text-slate-400 mt-[1px]"
        />
        <span class="break-all min-w-0 leading-snug">{{ breadcrumbsText }}</span>

        <button
          v-if="canClearTax"
          type="button"
          class="ml-1 mt-[1px] p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
          title="Сбросить фильтр по разделу"
          @click="router.push({ query: { ...route.query, tax: undefined, page: undefined } })"
        >
          <UIcon
            name="i-lucide-x"
            class="w-3.5 h-3.5"
          />
        </button>
      </div>
    </div>

    <!-- Переключатели + поиск -->
    <div :class="headerRowClass">
      <div :class="switchRowClass">
        <!-- Только мои -->
        <div
          class="flex items-center gap-1.5 cursor-pointer select-none shrink-0"
          @click="toggleAll"
        >
          <USwitch
            :model-value="localAll"
            color="primary"
          />
          <span class="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
            {{ localAll ? 'Все' : 'Только мои' }}
          </span>
        </div>

        <!-- Уникальные / Процедурные (только для админов) -->
        <div
          v-if="isAdmin"
          class="flex items-center gap-1.5 cursor-pointer select-none shrink-0"
          @click="toggleProc"
        >
          <USwitch
            :model-value="localIsProc"
            color="neutral"
          />
          <span class="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
            {{ localIsProc ? 'Процедурные' : 'Уникальные' }}
          </span>
        </div>
      </div>

      <div :class="searchWrapClass">
        <UIcon
          name="i-lucide-search"
          class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
        />
        <input
          v-model="searchInput"
          type="text"
          placeholder="Поиск по заданиям..."
          class="w-full border border-slate-200 bg-white py-1 pl-7 pr-7 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:ring-indigo-900"
        >
        <button
          v-if="searchInput.length > 0"
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-none"
          title="Очистить поиск"
          @click="clearSearch"
        >
          <UIcon
            name="i-lucide-x"
            class="h-3.5 w-3.5"
          />
        </button>
      </div>
    </div>

    <!-- Контент -->
    <LoadingOverlay :loading="pending">
      <div
        v-if="error"
        class="py-4 text-center text-xs text-[var(--ui-text-muted,#9ca3af)]"
      >
        Не удалось загрузить задания
      </div>
      <div
        v-else-if="!pending && tests.length === 0"
        class="py-4 text-center text-xs text-[var(--ui-text-muted,#9ca3af)]"
      >
        Задания не найдены
      </div>

      <div
        v-else
        class="flex flex-col gap-3"
      >
        <div
          class="grid gap-2 items-start w-full min-w-0"
          :style="{ gridTemplateColumns: `repeat(${effectiveColumns}, minmax(0, 1fr))` }"
        >
          <button
            v-for="test in tests"
            :key="test.id"
            type="button"
            :draggable="props.draggable"
            class="test-card w-full min-w-0 flex flex-col text-left border-l-[3px] transition-all duration-200 overflow-hidden group h-full hover:opacity-90"
            :class="[
              complexityCardClass(test.complexity),
              props.draggable ? 'cursor-grab active:cursor-grabbing' : ''
            ]"
            @dragstart="onTestDragStart($event, test)"
            @dragend="onTestDragEnd"
            @click="onTestClick(test)"
            @dblclick.stop="emit('open-test', test)"
          >
            <!-- Шапка карточки (без фонов и нижней рамки) -->
            <div class="pl-1.5 pr-1 py-1 flex items-center justify-between gap-1">
              <div class="flex items-center gap-1 min-w-0">
                <div class="flex size-5 shrink-0 items-center justify-center text-primary">
                  <UIcon
                    name="i-lucide-clipboard-check"
                    class="size-3.5"
                  />
                </div>

                <div class="min-w-0 flex flex-col justify-center">
                  <span class="text-[11px] font-semibold text-highlighted block truncate leading-tight">
                    Задание #{{ test.id }}
                  </span>

                  <ComplexitySelector
                    readonly
                    compact
                    :model-value="test.complexity ?? null"
                    class="text-[9px] [&_svg]:size-2.5"
                  />
                </div>
              </div>

              <div
                v-if="test.user_id && test.user_id === currentUserId"
                class="shrink-0 flex items-center justify-center size-4 text-primary"
                title="Мое задание"
              >
                <UIcon
                  name="i-lucide-user"
                  class="size-3"
                />
              </div>
            </div>

            <!-- Превью (без фона) -->
            <div class="pl-1.5 pr-1 pb-1 relative flex-1 min-w-0 overflow-hidden">
              <TestListElement :test="test" />
            </div>

            <!-- Футер карточки (без верхней рамки и фона) -->
            <div class="pl-1.5 pr-1 pb-1 flex items-center justify-between shrink-0">
              <span class="text-[10px] font-medium text-muted flex items-center gap-1">
                <UIcon
                  name="i-lucide-activity"
                  class="size-3"
                />
                Использований: {{ test.usages ?? 0 }}
              </span>
            </div>
          </button>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-1 pt-2 border-t border-slate-200 dark:border-slate-800">
          <UButton
            icon="i-lucide-chevron-left"
            color="neutral"
            variant="outline"
            size="xs"
            :disabled="localPage <= 1"
            class="rounded-none"
            @click="goToPage(localPage - 1)"
          >
            Назад
          </UButton>

          <span class="text-[10px] font-medium text-slate-500 font-mono min-w-0 text-center">
            Стр. {{ meta?.current_page || 1 }}
          </span>

          <UButton
            icon="i-lucide-chevron-right"
            trailing
            color="neutral"
            variant="outline"
            size="xs"
            :disabled="!meta?.has_more_pages"
            class="rounded-none"
            @click="goToPage(localPage + 1)"
          >
            Вперед
          </UButton>
        </div>
      </div>
    </LoadingOverlay>
  </div>
</template>
