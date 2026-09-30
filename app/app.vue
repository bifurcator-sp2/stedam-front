<script setup lang="ts">
import { ru } from '@nuxt/ui/locale'
const colorMode = useColorMode()
const { locale, locales, setLocale } = useI18n();
const currentCode = computed(() => locale.value);
const { direction } = useAuth()

const color = computed(() => colorMode.value === 'dark' ? '#020618' : 'white')

useHead({
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { key: 'theme-color', name: 'theme-color', content: color }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en',
    //dir: direction,
  }
})

useSeoMeta({
  titleTemplate: '%s - Nuxt SaaS template',
  twitterCard: 'summary_large_image'
})

/*const { data: navigation } = await useAsyncData('navigation', () => queryCollectionNavigation('docs'), {
  transform: data => data.find(item => item.path === '/docs')?.children || []
})*/


const { data: navigation } = useAsyncData('navigation', () => queryCollectionNavigation('docs'), {
  transform: data => {
    // Защита от null/undefined
    if (!data || !Array.isArray(data)) return []
    return data.find(item => item.path === '/docs')?.children || []
  },
  default: () => []
})

/*const { data: files } = useLazyAsyncData('search', () => queryCollectionSearchSections('docs'), {
  server: false
})*/

const { data: files } = useLazyAsyncData('search', () => {
  try {
    return queryCollectionSearchSections('docs')
  } catch (e) {
    console.warn('Search sections load failed:', e)
    return []
  }
}, {
  server: false,
  default: () => []
})

provide('navigation', navigation)



const toaster = { position: 'top-center' }





</script>

<template>
    <UApp :locale="currentCode" :key="currentCode" :toaster="toaster">
      <NuxtLoadingIndicator />
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>

      <ClientOnly>
        <LazyUContentSearch
          :files="files"
          :navigation="navigation"
          :links="navLinks"
          :fuse="{ resultLimit: 42 }"
        />
      </ClientOnly>
  </UApp>
</template>
