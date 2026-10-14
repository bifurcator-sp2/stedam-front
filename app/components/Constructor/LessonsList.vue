<script setup lang="ts">
// app/components/Constructor/LessonsList.vue
//
// Список уроков текущего пользователя.
// Верх — кнопка «Создать урок» → /construct-lesson.
// Ниже — список с пагинацией (UPagination).

import { computed } from 'vue'

// ==================== Типы ====================

interface LessonListItem {
  id: number
  title: string | null
  description: string | null
  blocks_count: number
  saved: boolean
  published: boolean
  created_at: string | null
  updated_at: string | null
}

interface LessonsPage {
  data: LessonListItem[]
  meta: {
    current_page: number
    per_page: number
    total: number
    last_page: number
    from: number | null
    to: number | null
  }
}

// ==================== Зависимости ====================

const api = useApi()
const route = useRoute()
const router = useRouter()

// ==================== Пагинация ====================

const PER_PAGE = 20

const currentPage = computed<number>({
  get() {
    const raw = route.query.page
    const v = Array.isArray(raw) ? raw[0] : raw
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : 1
  },
  set(page: number) {
    const next = { ...route.query, page: String(page) }
    router.replace({ query: next })
  },
})

// ==================== Загрузка ====================

const { data, pending, error } = await useAsyncData<LessonsPage>(
  () => `lessons-list-${currentPage.value}`,
  () =>
    api.get<LessonsPage>('/lessons', {
      params: {
        page: currentPage.value,
        per_page: PER_PAGE,
      },
    }),
  { watch: [currentPage] },
)

const lessons = computed<LessonListItem[]>(() => data.value?.data ?? [])
const meta = computed(() => data.value?.meta ?? null)

// ==================== Хелперы ====================

const TITLE_FALLBACK = 'Без названия'
const DESCRIPTION_FALLBACK = 'Без описания'

function displayTitle(l: LessonListItem): string {
  const t = (l.title ?? '').trim()
  return t || TITLE_FALLBACK
}

function displayDescription(l: LessonListItem): string {
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

// ==================== Переходы ====================

function createLesson() {
  router.push('/construct-lesson')
}

function openLesson(id: number) {
  router.push({ path: '/construct-lesson', query: { id: String(id) } })
}

// ==================== UPagination: to ====================

function pageTo(page: number) {
  return {
    path: route.path,
    query: { ...route.query, page: String(page) },
  }
}
</script>

<template>
  <div class="flex flex-col gap-5 p-6 max-w-3xl mx-auto w-full">
    <!-- === Кнопка "Создать урок" === -->
    <UButton
      icon="i-lucide-plus"
      size="sm"
      color="primary"
      variant="soft"
      block
      @click="createLesson"
    >
      Создать урок
    </UButton>

    <!-- === Загрузка === -->
    <div
      v-if="pending"
      class="py-8 text-center text-sm text-[var(--ui-text-muted,#9ca3af)]"
    >
      Загрузка…
    </div>

    <!-- === Ошибка === -->
    <div
      v-else-if="error"
      class="py-8 text-center text-sm text-[var(--ui-text-muted,#9ca3af)]"
    >
      Не удалось загрузить уроки
    </div>

    <!-- === Пусто === -->
    <div
      v-else-if="lessons.length === 0"
      class="py-8 text-center text-sm text-[var(--ui-text-muted,#9ca3af)]"
    >
      Уроков пока нет
    </div>

    <!-- === Список === -->
    <template v-else>
      <ul class="flex flex-col gap-2">
        <li
          v-for="l in lessons"
          :key="l.id"
        >
          <button
            type="button"
            class="w-full text-left p-3.5 rounded-lg border border-[var(--ui-border,#e5e7eb)] bg-[var(--ui-bg,#ffffff)] transition-colors hover:border-[var(--ui-primary,#3b82f6)]"
            @click="openLesson(l.id)"
          >
            <!-- Верхняя строка: ID, счётчик блоков, дата -->
            <div class="flex items-center gap-2 mb-1.5 text-[11px] font-mono text-[var(--ui-text-muted,#9ca3af)]">
              <span>#{{ l.id }}</span>
              <span class="text-[var(--ui-border,#e5e7eb)]">·</span>
              <span class="inline-flex items-center gap-1">
                <UIcon name="i-lucide-layers" class="w-3 h-3" />
                {{ l.blocks_count }}
              </span>
              <span class="ml-auto">{{ formatDate(l.created_at) }}</span>
            </div>

            <!-- Название -->
            <div
              class="text-sm font-medium mb-1"
              :class="l.title?.trim()
                ? 'text-[var(--ui-text,#111827)]'
                : 'text-[var(--ui-text-muted,#9ca3af)] italic'"
            >
              {{ displayTitle(l) }}
            </div>

            <!-- Описание -->
            <div
              class="text-xs leading-normal line-clamp-2"
              :class="l.description?.trim()
                ? 'text-[var(--ui-text-muted,#64748b)]'
                : 'text-[var(--ui-text-muted,#9ca3af)] italic'"
            >
              {{ displayDescription(l) }}
            </div>
          </button>
        </li>
      </ul>

      <!-- === Пагинация === -->
      <div
        v-if="meta && meta.last_page > 1"
        class="flex justify-center pt-2"
      >
        <UPagination
          v-model:page="currentPage"
          :total="meta.total"
          :items-per-page="meta.per_page"
          :sibling-count="1"
          show-edges
          :to="pageTo"
        />
      </div>
    </template>
  </div>
</template>
