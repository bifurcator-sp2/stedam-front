<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const { t } = useI18n();
const toast = useToast()
const route = useRoute()
const config = useRuntimeConfig()
const client = useSanctumClient()

// Используем ваш композабл (он уже знает про apiBase: '/api')
const api = useApi()
const { getDeviceId } = useDeviceFingerprint()
const { login, isAuthenticated, user, refreshIdentity } = useSanctumAuth()

definePageMeta({
  layout: 'auth',
  sanctum: { excluded: true }, // Страница не проверяется globalMiddleware
})

useSeoMeta({
  title: 'Login',
  description: 'Login to your account to continue'
})

// --- 1. Проверка устройства ---
const deviceAllowed = ref(true)
const checkingDevice = ref(true)

onMounted(async () => {
  const id = await getDeviceId()
  if (!id) {
    checkingDevice.value = false
    return
  }
  try {
    // Запрос уйдет на /api/devices/{id}/check
    const res = await api.get<{ allowed: boolean }>(`/devices/${id}/check`)
    deviceAllowed.value = res.allowed
  } catch (e) {
    deviceAllowed.value = false // При ошибке блокируем пароль
  } finally {
    checkingDevice.value = false
  }
})

// --- 2. Логика для входа по ПАРОЛЮ ---
const providers = useRegProviders()

const fields = [{
  name: 'email',
  type: 'text' as const,
  label: $t('login.email'),
  placeholder: $t('login.emailPlaceholder'),
  required: true
}, {
  name: 'password',
  label: $t('login.password'),
  type: 'password' as const,
  placeholder: $t('login.passwordPlaceholder'),
}, {
  name: 'remember',
  label: $t('login.remember'),
  type: 'checkbox' as const
}]

const schema = z.object({
  email: z.email(t('login.validation.email')),
  password: z.string().min(8, t('login.validation.passwordMin', { min: 8 })),
  remember: z.boolean().optional().default(false),
})

async function onSubmitPassword(payload: FormSubmitEvent<z.output<typeof schema>>) {
  try {
    await login({
      email: payload.data.email,
      password: payload.data.password,
      remember: payload.data.remember ?? false,
    })
    toast.add({ title: t('login.success.title'), color: 'success' })

    const target = (route.query.redirect as string) || '/'
    if (!user.value?.email_verified_at) {
      await navigateTo({ path: '/verify-email', query: { redirect: target } })
    } else {
      await navigateTo(target)
    }
  } catch (error: any) {
    toast.add({
      title: 'Ошибка',
      description: error?.data?.message || 'Неверные данные',
      color: 'error'
    })
  }
}

// --- 3. Логика для входа по КОДУ ---
const codeEmail = ref('')
const codeValue = ref('')
const isCodeSent = ref(false)
const isSendingCode = ref(false)
const isLoggingIn = ref(false)

async function requestCode() {
  if (!codeEmail.value) return
  isSendingCode.value = true
  try {
    // Запрос уйдет на /api/auth/request-code
    await api.post('/auth/request-code', { email: codeEmail.value })
    isCodeSent.value = true
    toast.add({ title: 'Код отправлен', description: 'Проверьте вашу почту.', color: 'success' })
  } catch (e: any) {
    // Ошибка 429 (слишком много запросов) обработается в useApi
  } finally {
    isSendingCode.value = false
  }
}

async function submitCode() {
  if (!codeValue.value) return
  isLoggingIn.value = true
  try {
    // ВАЖНО: Используем useSanctumClient, чтобы автоматически подтянулся CSRF-токен
    const client = useSanctumClient()

    // Запрос уйдет на /api/auth/login-with-code (с учетом baseUrl в конфиге sanctum)
    await client(`${config.public.apiBase}/auth/login-with-code`, {
      method: 'POST',
      body: { email: codeEmail.value, code: codeValue.value }
    })

    // Обновляем состояние Sanctum (подтягиваем пользователя)
    await refreshIdentity()

    toast.add({ title: 'Успешный вход', color: 'success' })

    const target = (route.query.redirect as string) || '/'
    if (!user.value?.email_verified_at) {
      await navigateTo({ path: '/verify-email', query: { redirect: target } })
    } else {
      await navigateTo(target)
    }
  } catch (e: any) {
    toast.add({
      title: 'Ошибка',
      description: e?.data?.message || 'Неверный код',
      color: 'error'
    })
  } finally {
    isLoggingIn.value = false
  }
}
</script>

<template>
  <!-- Пока проверяем устройство, показываем лоадер -->
  <div v-if="checkingDevice" class="flex justify-center p-10">
    <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
  </div>

  <!-- ЕСЛИ УСТРОЙСТВО РАЗРЕШЕНО (Обычный вход по паролю) -->
  <UAuthForm
    v-else-if="deviceAllowed && !isAuthenticated"
    :fields="fields"
    :schema="schema"
    :providers="providers"
    :title="t('login.title')"
    :separator="t('login.or')"
    :submit="{ label: t('login.submit') }"
    @submit="onSubmitPassword"
  >
    <template #title>
      <AppLogo alt="Logo" class="w-32 h-32 mx-auto" />
      {{t('login.title')}}
    </template>
    <template #description>
      {{t('login.noAccount')}}
      <ULink to="/signup" class="text-primary font-medium">{{t('login.signUp')}}</ULink>.
    </template>
    <template #password-hint>
      <ULink to="/forgot-password" class="text-primary font-medium" tabindex="-1">{{t('login.forgotPassword')}}</ULink>
    </template>
    <template #footer>
      {{t('terms.agree')}} <ULink to="/" class="text-primary font-medium">{{t('terms.terms')}}</ULink>.
      <br>
      <LocaleSwitcher />
    </template>
  </UAuthForm>

  <!-- ЕСЛИ УСТРОЙСТВО ЗАПРЕЩЕНО (Вход по коду) -->
  <UCard v-else-if="!deviceAllowed && !isAuthenticated" class="max-w-md w-full mx-auto">
    <template #header>
      <div class="text-center">
        <AppLogo alt="Logo" class="w-24 h-24 mx-auto mb-4" />
        <h2 class="text-lg font-semibold">Вход по коду</h2>
        <p class="text-sm text-muted mt-1">
          На этом устройстве вход по паролю отключен. Введите email, чтобы получить код.
        </p>
      </div>
    </template>

    <div class="space-y-4">
      <!-- Шаг 1: Ввод Email -->
      <UFormField label="Email" name="email">
        <div class="flex gap-2">
          <UInput
            v-model="codeEmail"
            type="email"
            placeholder="example@mail.ru"
            class="w-full"
            :disabled="isCodeSent"
          />
          <UButton
            v-if="!isCodeSent"
            :loading="isSendingCode"
            :disabled="!codeEmail"
            @click="requestCode"
          >
            Запросить
          </UButton>
        </div>
      </UFormField>

      <!-- Шаг 2: Ввод кода -->
      <template v-if="isCodeSent">
        <UFormField label="Код из письма" name="code">
          <UInput
            v-model="codeValue"
            placeholder="123456"
            class="w-full text-center tracking-widest text-lg"
            maxlength="6"
          />
        </UFormField>
        <UButton
          block
          :loading="isLoggingIn"
          :disabled="codeValue.length < 6"
          @click="submitCode"
        >
          Войти по коду
        </UButton>

        <UButton
          variant="ghost"
          color="neutral"
          block
          @click="isCodeSent = false; codeValue = ''"
        >
          Изменить email
        </UButton>
      </template>
    </div>

    <template #footer>
      <div class="text-center text-xs text-muted">
        <LocaleSwitcher />
      </div>
    </template>
  </UCard>
</template>
