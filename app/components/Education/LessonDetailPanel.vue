<!-- app/components/Education/LessonDetailPanel.vue -->
<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import type { LessonModel, LessonBlockModel } from '~/types/lesson'
import Lesson from '~/components/Constructor/Lesson.vue'

const props = defineProps<{
  lessonId: number
}>()

const api = useApi()

// ==================== Загрузка данных ====================

const responseData = ref<any>(null)
const pending = ref(true)
const error = ref<unknown>(null)

// Защита от гонки при быстрой смене lessonId
let requestSeq = 0

async function loadLesson() {
  const seq = ++requestSeq
  pending.value = true
  error.value = null
  responseData.value = null

  try {
    const res = await api.get(`/lessons/${props.lessonId}`)
    if (seq === requestSeq) responseData.value = res
  } catch (e) {
    if (seq === requestSeq) error.value = e
  } finally {
    if (seq === requestSeq) pending.value = false
  }
}

watch(
  () => props.lessonId,
  () => loadLesson(),
  { immediate: true },
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
      isTest: b.is_test ?? false,
      userId: b.user_id ?? null,
    }))

    lessonModel.value = {
      id: raw.id,
      title: raw.title || '',
      description: raw.description || '',
      locale: raw.locale || 'ru',
      type: raw.type ?? null,
      saved: raw.saved ?? false,
      published: raw.published ?? false,
      taxonomy_ids: raw.taxonomy_ids || [],
      blocks: blocks,
    }
  },
  { immediate: true, deep: true }
)

// ==================== Масштабирование превью (как в TestListElement) ====================

const VIRTUAL_WIDTH = 800

const containerRef = ref<HTMLElement | null>(null)
const zoomFactor = ref(1)

let resizeObserver: ResizeObserver | null = null

// Превью монтируется только после загрузки урока, поэтому контейнер
// подписывается на изменение размера по факту появления в DOM (ref-колбэк).
function observeContainer(el: Element | { $el?: unknown } | null) {
  // Превью исчезло (перезагрузка/ошибка) — отпускаем прошлый контейнер.
  if (!(el instanceof HTMLElement)) {
    containerRef.value = null
    resizeObserver?.disconnect()
    return
  }
  if (containerRef.value === el) return
  containerRef.value = el
  if (!resizeObserver) return
  resizeObserver.disconnect()
  resizeObserver.observe(el)
}

onMounted(() => {
  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const width = entry.contentRect.width
      if (width > 0) {
        zoomFactor.value = width / VIRTUAL_WIDTH
      }
    }
  })
  if (containerRef.value) resizeObserver.observe(containerRef.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
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

    <div
      v-else
      :ref="observeContainer"
      class="flex-1 overflow-y-auto overflow-x-hidden relative"
    >
      <div
        class="pointer-events-none origin-top-left p-6 bg-[var(--ui-bg,#ffffff)] shadow-sm"
        :style="{
          zoom: zoomFactor,
          width: `${VIRTUAL_WIDTH}px`,
        }"
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
          mode="learn"
        />
      </div>
    </div>
  </div>
</template>
