<!-- app/components/Constructor/LessonsList.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import type { LessonListItem, LessonsPage } from '~/types/lesson'

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
          <EducationLessonListElement
            :lesson="l"
            @open="openLesson"
          />
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
