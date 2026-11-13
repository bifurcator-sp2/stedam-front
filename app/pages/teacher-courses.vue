<script setup lang="ts">
import TeacherCourses from '~/components/Education/TeacherCourses.vue'
const title = 'Курсы'
const description = 'Stedam Курсы'

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
  <TeacherCourses />
</template>
