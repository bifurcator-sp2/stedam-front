<!-- app/components/Constructor/ActualLessonsList.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import type { LessonListItem } from '~/types/lesson'

// ==================== Зависимости ====================

const api = useApi()
const router = useRouter()

// ==================== Загрузка ====================
// Бэкенд /lessons/actual возвращает голый массив, без { data: ... }

const { data, pending, error } = await useAsyncData<LessonListItem[]>(
  'lessons-actual',
  () => api.get<LessonListItem[]>('/lessons/actual'),
)

const lessons = computed<LessonListItem[]>(() => data.value ?? [])

// ==================== Переходы ====================

function openLesson(id: number) {
  router.push({ path: '/learn/' + String(id) })
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
    <ul v-else class="flex flex-col gap-2">
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
  </div>
</template>
