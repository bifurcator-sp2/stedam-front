<script setup lang="ts">

const title = 'Создать курс'
const description = 'Stedam Создание курса'

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
<ConstructorCourseMake />
</template>
