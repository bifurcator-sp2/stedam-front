<!-- app/components/CookieBanner.vue -->
<script setup lang="ts">
const { t } = useI18n()
const isVisible = ref(false)

// Проверяем, давал ли пользователь уже согласие
onMounted(() => {
  const consent = localStorage.getItem('cookie_consent')
  if (!consent) {
    // Небольшая задержка, чтобы баннер появился плавно
    setTimeout(() => {
      isVisible.value = true
    }, 1000)
  }
})

function acceptCookies() {
  localStorage.setItem('cookie_consent', 'accepted')
  isVisible.value = false
  // Здесь можно инициализировать скрипты аналитики (Яндекс.Метрика, Google Analytics)
  // Например: window.ym(XXXXXX, 'init', {...})
}

function declineCookies() {
  localStorage.setItem('cookie_consent', 'declined')
  isVisible.value = false
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="transform translate-y-full opacity-0"
    enter-to-class="transform translate-y-0 opacity-100"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="transform translate-y-0 opacity-100"
    leave-to-class="transform translate-y-full opacity-0"
  >
    <div
      v-if="isVisible"
      class="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:w-[400px] z-[9999]"
    >
      <UCard class="shadow-xl border border-default bg-default/95 backdrop-blur">
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-cookie" class="w-6 h-6 text-primary shrink-0 mt-0.5" />
          <div class="space-y-3">
            <div>
              <h3 class="text-sm font-semibold text-highlighted">
                {{ t('cookies.title', 'Мы используем куки') }}
              </h3>
              <p class="text-xs text-muted mt-1 leading-relaxed">
                {{ t('cookies.description', 'Этот сайт использует файлы cookie для улучшения работы, аналитики и персонализации. Продолжая использовать сайт, вы соглашаетесь с нашей политикой.') }}
                <ULink to="/privacy" class="text-primary hover:underline" target="_blank">
                  {{ t('cookies.policy', 'Политика конфиденциальности') }}
                </ULink>.
              </p>
            </div>

            <div class="flex gap-2">
              <UButton
                color="primary"
                size="sm"
                block
                @click="acceptCookies"
              >
                {{ t('cookies.accept', 'Принять') }}
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                size="sm"
                block
                @click="declineCookies"
              >
                {{ t('cookies.decline', 'Отклонить') }}
              </UButton>
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </Transition>
</template>
