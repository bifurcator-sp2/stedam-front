<script setup lang="ts">
// Страница-получатель handoff-токена (открывается в новой вкладке).
// Flow: /app/impersonate?token=<handoff> → POST /admin/impersonate/accept
//       → session-токен в sessionStorage → перезагрузка на /app/.
// См. useImpersonation и ImpersonationController на бэкенде.

definePageMeta({
  layout: 'auth',
  // Гостевые guard'ы Sanctum не должны уводить нас отсюда до accept.
  sanctum: { excluded: true },
  skipEmailVerification: true,
})

const route = useRoute()
const { accept } = useImpersonation()

const error = ref<string | null>(null)
const loading = ref(true)

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : ''

  if (!token) {
    error.value = 'Не передан токен просмотра.'
    loading.value = false
    return
  }

  try {
    await accept(token)
    // accept редиректит на /app/ после успеха.
  } catch (e: any) {
    loading.value = false
    error.value = e?.data?.message || 'Не удалось открыть просмотр от лица пользователя.'
  }
})
</script>

<template>
  <UPageCard variant="subtle" class="max-w-md w-full mx-auto">
    <div class="text-center space-y-4">
      <UIcon
        :name="error ? 'i-lucide-triangle-alert' : 'i-lucide-user-round-check'"
        class="w-12 h-12 mx-auto"
        :class="error ? 'text-error' : 'text-primary'"
      />

      <template v-if="error">
        <h1 class="text-lg font-semibold">
          Не удалось войти
        </h1>
        <p class="text-sm text-muted">
          {{ error }}
        </p>
        <UButton variant="soft" block to="/">
          Вернуться
        </UButton>
      </template>

      <template v-else>
        <h1 class="text-lg font-semibold">
          Открываем просмотр…
        </h1>
        <p class="text-sm text-muted">
          Подключаемся от лица пользователя, пожалуйста, подождите.
        </p>
        <UIcon v-if="loading" name="i-lucide-loader-circle" class="w-5 h-5 mx-auto animate-spin text-muted" />
      </template>
    </div>
  </UPageCard>
</template>
