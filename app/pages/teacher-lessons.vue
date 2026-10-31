<script setup lang="ts">
import TeacherLessons from '~/components/Education/TeacherLessons.vue'
const title = 'Мои уроки'
const description = 'Stedam Мои уроки'

definePageMeta({
  layout: 'main',
  title: title,   // 👈 meta.title
})


useSeoMeta({
  titleTemplate: '',
  title,
  ogTitle: title,
  description,
  ogDescription: description,
  ogImage: 'https://ui.nuxt.com/assets/templates/nuxt/saas-light.png',
})


</script>

<template>
  <TeacherLessons />
</template>
