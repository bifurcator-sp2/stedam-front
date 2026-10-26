<script setup lang="ts">
definePageMeta({
  layout: 'auth',
  skipEmailVerification: true,
})

const { t } = useI18n()
const route = useRoute()
const toast = useToast()
const { user, fetchUser, resendVerificationEmail, logout } = useAuth()

const sending = ref(false)
const checking = ref(false)

// Состояние кулдаунов (в секундах)
const cooldowns = reactive({
  resend: 0,
  check: 0,
})

// Хранилище таймеров для очистки
const timers: Record<string, ReturnType<typeof setInterval> | null> = {
  resend: null,
  check: null,
}

// Функция запуска кулдауна
function startCooldown(type: 'resend' | 'check', durationSec = 60) {
  cooldowns[type] = durationSec

  if (timers[type]) clearInterval(timers[type]!)

  timers[type] = setInterval(() => {
    cooldowns[type]--
    if (cooldowns[type] <= 0) {
      clearInterval(timers[type]!)
      timers[type] = null
    }
  }, 1000)
}

// Очистка таймеров при размонтировании компонента
onUnmounted(() => {
  if (timers.resend) clearInterval(timers.resend)
  if (timers.check) clearInterval(timers.check)
})

// --- Логика ---

onMounted(async () => {
  if (route.query.verified) {
    await fetchUser().catch(() => {})
    await navigateTo({ path: '/verify-email' }, { replace: true })
  }
})

watchEffect(() => {
  if (user.value?.email_verified_at) {
    const target = (route.query.redirect as string) || '/'
    navigateTo(target, { replace: true })
  }
})

async function handleResend() {
  if (cooldowns.resend > 0) return // Защита от клика, если таймер еще идет

  sending.value = true
  try {
    await resendVerificationEmail()
    toast.add({
      title: t('verify.sent.title', 'Письмо отправлено'),
      description: t('verify.sent.description', 'Проверьте вашу почту.'),
      color: 'success',
    })
    // Запускаем кулдаун только при успехе (или можно всегда)
    startCooldown('resend', 60)
  } catch (e: any) {
    // Если сервер вернул 429 (Too Many Requests), тоже запускаем кулдаун
    if (e?.status === 429 || e?.response?.status === 429) {
      startCooldown('resend', 60)
    }
  } finally {
    sending.value = false
  }
}

async function handleCheck() {
  if (cooldowns.check > 0) return

  checking.value = true
  try {
    await fetchUser()
    if (!user.value?.email_verified_at) {
      toast.add({
        title: t('verify.notYet.title', 'Ещё не подтверждено'),
        description: t('verify.notYet.description', 'Перейдите по ссылке из письма и попробуйте снова.'),
        color: 'warning',
      })
      // Запускаем кулдаун, чтобы не спамили проверкой
      startCooldown('check', 60)
    }
  } catch (e: any) {
    if (e?.status === 429 || e?.response?.status === 429) {
      startCooldown('check', 60)
    }
  } finally {
    checking.value = false
  }
}

async function handleLogout() {
  await logout()
  await navigateTo('/login')
}
</script>

<template>
  <UPageCard variant="subtle" class="max-w-md w-full mx-auto">
    <div class="text-center space-y-4">
      <UIcon name="i-lucide-mail-check" class="w-12 h-12 mx-auto text-primary" />
      <h1 class="text-lg font-semibold">{{ t('verify.title', 'Подтвердите email') }}</h1>
      <p class="text-sm text-muted">
        {{ t('verify.description', 'Мы отправили письмо на') }}
        <strong>{{ user?.email }}</strong>.
        {{ t('verify.instructions', 'Перейдите по ссылке из письма.') }}
      </p>

      <div class="flex flex-col gap-2 pt-2">
        <!-- Кнопка отправки письма -->
        <UButton
          :loading="sending"
          :disabled="cooldowns.resend > 0"
          block
          @click="handleResend"
        >
          <template v-if="cooldowns.resend > 0">
            Повторить через {{ cooldowns.resend }} сек.
          </template>
          <template v-else>
            {{ t('verify.resend', 'Отправить письмо повторно') }}
          </template>
        </UButton>

        <!-- Кнопка проверки статуса -->
        <UButton
          variant="soft"
          :loading="checking"
          :disabled="cooldowns.check > 0"
          block
          @click="handleCheck"
        >
          <template v-if="cooldowns.check > 0">
            Подождите {{ cooldowns.check }} сек.
          </template>
          <template v-else>
            {{ t('verify.check', 'Я подтвердил — проверить') }}
          </template>
        </UButton>

        <UButton variant="ghost" color="neutral" block @click="handleLogout">
          {{ t('verify.logout', 'Выйти') }}
        </UButton>
      </div>
    </div>
  </UPageCard>
</template>
