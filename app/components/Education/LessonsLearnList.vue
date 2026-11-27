<!-- app/components/Constructor/LessonsLearnList.vue -->
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

const data = ref<LessonsPage | null>(null)
const pending = ref(true)
const error = ref<unknown>(null)

// Защита от гонки: обрабатываем только ответ последнего запроса
let requestSeq = 0

async function loadLessons() {
  const seq = ++requestSeq
  pending.value = true
  error.value = null

  try {
    const res = await api.get<LessonsPage>('/lessons/learn', {
      params: {
        page: currentPage.value,
        per_page: PER_PAGE,
      },
    })

    if (seq === requestSeq) data.value = res
  } catch (e) {
    if (seq === requestSeq) error.value = e
  } finally {
    if (seq === requestSeq) pending.value = false
  }
}

watch(currentPage, () => loadLessons(), { immediate: true })

const lessons = computed<LessonListItem[]>(() => data.value?.data ?? [])
const lessonTypes = computed(() => data.value?.lesson_types ?? [])
const meta = computed(() => data.value?.meta ?? null)

// ==================== Переходы ====================


function openLesson(id: number) {
  router.push({ path: '/learn/'+String(id) })
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
            :lesson-types="lessonTypes"
            @open="openLesson"
          >
            <template #actions>
              <span
                class="flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg
                       bg-primary/10 text-primary group-hover:bg-primary group-hover:text-inverted
                       transition-colors"
              >
                <UIcon name="i-lucide-circle-play" class="w-8 h-8" />
                <span class="text-[11px] leading-none font-medium">
                  Приступить к уроку
                </span>
              </span>
            </template>
          </EducationLessonListElement>
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
