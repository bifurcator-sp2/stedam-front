<!-- app/pages/learn/[id].vue -->
<script setup lang="ts">
import { computed } from 'vue'

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

// ==================== ID из URL ====================

const route = useRoute()

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
</script>

<template>
  <LearnProcessor v-if="lessonId !== null" :lesson-id="lessonId" />
</template>
