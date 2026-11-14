<script setup lang="ts">

const title = 'Конструктор курсов'
const description = 'Stedam Конструктор курсов'

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
<ConstructorCoursesConstructor />
</template>
