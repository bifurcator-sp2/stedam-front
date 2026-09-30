<script setup lang="ts">
import type { NuxtError } from '#app'

defineProps<{
  error: NuxtError
}>()

useHead({
  htmlAttrs: { lang: 'en' }
})

useSeoMeta({
  title: 'Ошибка',
  description: 'Что-то пошло не так.'
})
</script>

<template>
  <UApp>
    <AppHeader />

    <UMain>
      <UContainer>
        <UPage>
          <UError :error="error" />
        </UPage>
      </UContainer>
    </UMain>

    <AppFooter />
  </UApp>
</template>
