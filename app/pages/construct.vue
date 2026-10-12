<script setup lang="ts">

const title = 'Редактор блоков'
const description = 'Stedam Редактор блоков'

definePageMeta({
  layout: 'main',
  title: 'Редактор блоков',   // 👈 meta.title
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
   <ConstructorBlocksConstructor />
</template>
