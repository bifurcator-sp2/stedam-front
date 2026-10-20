<script setup lang="ts">
import EducationComp from '~/components/Education/Education.vue'
const title = 'Обучение'
const description = 'Stedam обучение'

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
  <EducationComp />
</template>
