<script setup lang="ts">

const title = 'Конструктор уроков'
const description = 'Stedam Конструктор уроков'

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
<ConstructorLessonsConstructor />
</template>
