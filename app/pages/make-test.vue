<script setup lang="ts">
import MakeTest from '~/components/Constructor/MakeTest.vue'
const title = 'Создание / редактирование задания'
const description = 'Stedam Создание / редактирование задания'

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
  <MakeTest />
</template>
