<!-- app/pages/learn/[id].vue -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { LessonModel, LessonBlockModel } from '~/types/lesson'

definePageMeta({
  layout: 'default',
})

const title = "Прохождение урока";
const description = "Stedam - Прохождение урока"

useSeoMeta({
  titleTemplate: '',
  title,
  ogTitle: title,
  description,
  ogDescription: description,
  ogImage: 'https://ui.nuxt.com/assets/templates/nuxt/saas-light.png'
})



const route = useRoute()
const router = useRouter()
const api = useApi()

// ==================== ID из URL ====================

const lessonId = computed<number | null>(() => {
  const raw = route.params.id
  const v = Array.isArray(raw) ? raw[0] : raw
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
})

if (lessonId.value === null) {
  throw createError({ statusCode: 404, statusMessage: 'Урок не найден' })
}

// ==================== Загрузка ====================

const { data, pending, error } = await useAsyncData(
  () => `learn-lesson-${lessonId.value}`,
  () => api.get(`/lessons/${lessonId.value}`),
  { watch: [lessonId] }
)

// ==================== Модель для Lesson.vue ====================

const lessonModel = ref<LessonModel | null>(null)

watch(
  () => data.value,
  (raw) => {
    const d = (raw as any)?.data ?? raw
    if (!d || !d.id) {
      lessonModel.value = null
      return
    }

    const blocks: LessonBlockModel[] = (d.blocks || []).map((b: any) => ({
      localId: crypto.randomUUID(),
      id: b.id,
      blockId: b.block_id,
      blockTypeCode: b.block_type_code,
      settings: b.settings,
      images: b.images || [],
      files: b.files || [],
    }))

    lessonModel.value = {
      id: d.id,
      title: d.title || '',
      description: d.description || '',
      locale: d.locale || 'ru',
      saved: d.saved ?? false,
      published: d.published ?? false,
      taxonomy_ids: d.taxonomy_ids || [],
      blocks,
    }
  },
  { immediate: true, deep: true }
)

// ==================== Навигация ====================

function goBack() {
  router.push('/learn')
}
</script>

<template>
  <div class="flex flex-col h-dvh overflow-hidden bg-[var(--ui-bg,#ffffff)]">
    <!-- Шапка -->
    <header class="shrink-0 h-12 px-4 flex items-center justify-between gap-3 border-b border-[var(--ui-border,#e5e7eb)]">
      <UButton
        icon="i-lucide-arrow-left"
        size="sm"
        color="neutral"
        variant="ghost"
        @click="goBack"
      >
        К списку уроков
      </UButton>

      <div
        v-if="lessonModel"
        class="flex items-center gap-3 text-[11px] text-[var(--ui-text-muted,#6b7280)]"
      >
        <span class="inline-flex items-center gap-1 font-mono">
          <UIcon name="i-lucide-hash" class="size-3" />
          {{ lessonModel.id }}
        </span>
        <span
          v-if="lessonModel.published"
          class="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700"
        >
          <UIcon name="i-lucide-check-circle-2" class="size-3" />
          Опубликован
        </span>
      </div>
    </header>

    <!-- Контент -->
    <main class="overflow-y-auto">
      <div class="max-w-4xl mx-auto">
        <div v-if="pending" class="flex justify-center py-20">
          <UIcon
            name="i-lucide-loader-circle"
            class="size-6 animate-spin text-[var(--ui-text-muted,#6b7280)]"
          />
        </div>

        <div v-else-if="error" class="flex flex-col items-center gap-2 py-20 text-center">
          <UIcon name="i-lucide-alert-triangle" class="size-8 text-error" />
          <p class="text-sm text-[var(--ui-text-muted,#6b7280)]">Не удалось загрузить урок</p>
          <UButton size="xs" color="neutral" variant="ghost" @click="goBack">
            Вернуться к списку
          </UButton>
        </div>

        <div v-else-if="!lessonModel" class="flex flex-col items-center gap-2 py-20 text-center">
          <UIcon name="i-lucide-book-x" class="size-8 text-[var(--ui-text-muted,#9ca3af)]" />
          <p class="text-sm text-[var(--ui-text-muted,#6b7280)]">Урок не найден</p>
          <UButton size="xs" color="neutral" variant="ghost" @click="goBack">
            Вернуться к списку
          </UButton>
        </div>

        <ConstructorLesson
          v-else
          v-model="lessonModel"
          :struct-items="[]"
          :is-read-only="false"
          mode="learn"
        />
      </div>
    </main>
  </div>
</template>
