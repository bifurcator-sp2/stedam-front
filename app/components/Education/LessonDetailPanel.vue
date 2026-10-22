<!-- app/components/Education/LessonDetailPanel.vue -->
<script setup lang="ts">
import { ref, watch } from 'vue'
import type { LessonModel, LessonBlockModel } from '~/types/lesson'
import Lesson from '~/components/Constructor/Lesson.vue'

const props = defineProps<{
  lessonId: number
}>()

const api = useApi()

// ==================== Загрузка данных ====================

const { data: responseData, pending, error } = await useAsyncData<any>(
  () => `lesson-detail-${props.lessonId}`,
  () => api.get(`/lessons/${props.lessonId}`),
  { watch: [() => props.lessonId] }
)

// ==================== Преобразование в LessonModel ====================

const lessonModel = ref<LessonModel | null>(null)

watch(
  () => responseData.value,
  (data) => {
    if (!data) {
      lessonModel.value = null
      return
    }

    const raw = data.data || data
    if (!raw || !raw.id) {
      lessonModel.value = null
      return
    }

    const blocks: LessonBlockModel[] = (raw.blocks || []).map((b: any) => ({
      localId: crypto.randomUUID(),
      id: b.id,
      blockId: b.block_id,
      blockTypeCode: b.block_type_code,
      settings: b.settings,
      images: b.images || [],
      files: b.files || [],
    }))

    lessonModel.value = {
      id: raw.id,
      title: raw.title || '',
      description: raw.description || '',
      locale: raw.locale || 'ru',
      saved: raw.saved ?? false,
      published: raw.published ?? false,
      taxonomy_ids: raw.taxonomy_ids || [],
      blocks: blocks,
    }
  },
  { immediate: true, deep: true }
)
</script>

<template>
  <div class="right-panel-content flex flex-col h-full bg-slate-50 dark:bg-slate-950 relative overflow-hidden">

    <div v-if="pending" class="flex-1 flex justify-center items-center py-10">
      <UIcon name="i-lucide-loader-circle" class="w-6 h-6 animate-spin text-slate-400" />
    </div>

    <div v-else-if="error" class="flex-1 flex justify-center items-center text-red-500 text-sm py-4 text-center">
      Ошибка загрузки урока
    </div>

    <div v-else-if="!lessonModel" class="flex-1 flex justify-center items-center text-slate-400 text-sm py-4 text-center">
      Данные урока не найдены
    </div>

    <div v-else class="flex-1 overflow-y-auto overflow-x-hidden relative">

      <div
        class="origin-top-left w-[200%] p-6 bg-[var(--ui-bg,#ffffff)] shadow-sm"
        style="transform: scale(0.5);"
      >
        <div v-if="lessonModel.blocks.length === 0" class="text-center text-slate-400 text-sm py-10">
          Урок пока пуст
        </div>

        <Lesson
          v-else
          v-model="lessonModel"
          :struct-items="[]"
          :is-read-only="true"
          :display-read-only-toast="false"
        />
      </div>

    </div>
  </div>
</template>
