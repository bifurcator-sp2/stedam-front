<script setup lang="ts">

definePageMeta({
  layout: 'login',
})

const title = 'Профиль'
const description = 'Stedam'

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
  <div>
    <videoTest />
  </div>
</template>
