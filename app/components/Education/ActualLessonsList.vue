<!-- app/components/Education/ActualLessonsList.vue -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { LessonListItem, LessonsPage } from '~/types/lesson'

// ==================== Зависимости ====================

const api = useApi()
const route = useRoute()
const router = useRouter()

// ==================== Поиск (из query) ====================

function getSearchFromQuery(): string {
  const raw = route.query.search as string | string[] | undefined
  return (Array.isArray(raw) ? raw[0] : raw) || ''
}

const currentSearch = computed<string>(() => getSearchFromQuery())

// ==================== Пагинация (из query) ====================

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

// ==================== Debounce поиска ====================

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

// ==================== Загрузка ====================

const data = ref<LessonsPage | null>(null)
const pending = ref(true)
const error = ref<unknown>(null)

// Защита от гонки: обрабатываем только ответ последнего запроса
let requestSeq = 0

async function loadLessons(opts: { refresh?: boolean } = {}) {
  const seq = ++requestSeq
  pending.value = true
  error.value = null

  try {
    const res = await api.get<LessonsPage>('/lessons/actual', {
      params: {
        page: currentPage.value,
        per_page: PER_PAGE,
        search: currentSearch.value || undefined,
      },
      refresh: opts.refresh,
    })

    if (seq === requestSeq) data.value = res
  } catch (e) {
    if (seq === requestSeq) error.value = e
  } finally {
    if (seq === requestSeq) pending.value = false
  }
}

watch([currentPage, currentSearch], () => loadLessons(), { immediate: true })

// Принудительное обновление списка (игнорируя кэш useApi)
function refresh() {
  return loadLessons({ refresh: true })
}

defineExpose({ refresh })

const lessons = computed<LessonListItem[]>(() => data.value?.data ?? [])
const meta = computed(() => data.value?.meta ?? null)

// ==================== Переходы ====================

function goToPage(page: number) {
  if (page < 1) return
  currentPage.value = page
}

function openLesson(id: number) {
  router.push({ path: '/learn/' + String(id) })
}
</script>

<template>
  <div class="flex flex-col gap-5 p-6 max-w-3xl mx-auto w-full">
    <!-- === Поиск === -->
    <div class="relative">
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
      <!-- === Ошибка === -->
      <div
        v-if="error"
        class="py-8 text-center text-sm text-[var(--ui-text-muted,#9ca3af)]"
      >
        Не удалось загрузить уроки
      </div>

      <!-- === Пусто === -->
      <div
        v-else-if="!pending && lessons.length === 0"
        class="py-8 text-center text-sm text-[var(--ui-text-muted,#9ca3af)]"
      >
        {{ currentSearch ? 'Ничего не найдено' : 'Уроков пока нет' }}
      </div>

      <!-- === Список + пагинация === -->
      <div v-else class="flex flex-col gap-5">
        <ul class="flex flex-col gap-2">
          <li v-for="l in lessons" :key="l.id">
            <button
              type="button"
              class="group w-full flex items-center gap-4 p-2 rounded-lg text-left
                     bg-elevated hover:bg-[var(--ui-bg-elevated,#1f2937)]
                     transition-colors cursor-pointer
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              @click="openLesson(l.id)"
            >
              <!-- Слева: сам урок -->
              <div class="flex-1 min-w-0">
                <EducationLessonListElement :lesson="l" />
              </div>

              <!-- Справа: крупная иконка «продолжить прохождение» -->
              <span
                class="shrink-0 flex flex-col items-center justify-center gap-1
                       px-3 py-2 rounded-lg
                       bg-primary/10 text-primary
                       group-hover:bg-primary group-hover:text-inverted
                       transition-colors"
              >
                <UIcon name="i-lucide-circle-play" class="w-8 h-8" />
                <span class="text-[11px] leading-none font-medium">
                  Приступить к уроку
                </span>
              </span>
            </button>
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
