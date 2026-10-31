<script setup lang="ts">
import TeacherTests from '~/components/Education/TeacherTests.vue'
const title = 'Мои задания'
const description = 'Stedam Мои задания'

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
  <TeacherTests />
</template>
