<script setup lang="ts">
const title = 'Доступ ограничен'
const description = 'Stedam — раздел недоступен'

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

const router = useRouter()
</script>

<template>
  <div class="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-12">
    <div class="w-full max-w-md text-center">
      <UIcon
        name="i-lucide-lock-keyhole"
        class="mx-auto size-14 text-primary/60"
      />

      <p class="mt-6 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-muted">
        Код 403
      </p>

      <h1 class="mt-2 text-2xl font-bold text-highlighted">
        К сожалению, эту страницу показать не получилось
      </h1>

      <p class="mt-3 text-sm leading-relaxed text-muted">
        Похоже, у вашей учётной записи пока нет доступа к этому разделу.
        Если вы уверены, что он должен быть, попробуйте войти под другим аккаунтом
        или вернитесь на главную — там точно всё на месте.
      </p>

      <div class="mt-8 flex flex-wrap items-center justify-center gap-2">
        <UButton
          icon="i-lucide-arrow-left"
          color="primary"
          variant="solid"
          size="sm"
          @click="router.back()"
        >
          Назад
        </UButton>

        <UButton
          icon="i-lucide-house"
          to="/"
          color="neutral"
          variant="ghost"
          size="sm"
        >
          На главную
        </UButton>
      </div>
    </div>
  </div>
</template>
