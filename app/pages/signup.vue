<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const { t } = useI18n()

definePageMeta({
  layout: 'auth',
  sanctum: {
    excluded: true,
  },
})

useSeoMeta({
  title: 'Sign up',
  description: 'Create an account to get started'
})

const  providers  = useRegProviders()

const toast = useToast()
const isLoading = ref(false)
const route = useRoute()
const api = useApi()
const { user, refreshIdentity } = useAuth()

// --- VK / внешний провайдер (см. docs/auth-providers.md) ---
const vkIncompleteToken = computed(() => (route.query.vk_incomplete as string) || null)
const isVkIncomplete = computed(() => Boolean(vkIncompleteToken.value))

const vkErrorMessages: Record<string, string> = {
  access_denied: 'Вход отменён',
  invalid_state: 'Сессия устарела, попробуйте снова',
  provider_error: 'Не удалось получить данные от провайдера',
  email_taken: 'Этот email уже используется',
  unknown: 'Не удалось войти',
}

onMounted(() => {
  const code = route.query.vk_error as string | undefined
  if (!code) return
  toast.add({
    title: 'VK',
    description: vkErrorMessages[code] || vkErrorMessages.unknown,
    color: 'error',
  })
  const { vk_error, ...rest } = route.query
  navigateTo({ path: route.path, query: rest, replace: true })
})

const VK_EMAIL_TAKEN = 'email_taken'

async function onVkComplete(payload: FormSubmitEvent<{ email: string; name: string }>) {
  if (!vkIncompleteToken.value) return
  isLoading.value = true
  try {
    await api.post('/auth/vk/complete', {
      token: vkIncompleteToken.value,
      email: payload.data.email,
      name: payload.data.name,
    })

    await refreshIdentity()

    toast.add({
      title: t('signup.success.title'),
      description: t('signup.success.description'),
      color: 'success',
    })

    const target = (route.query.redirect as string) || '/'
    if (!user.value?.email_verified_at) {
      await navigateTo({ path: '/verify-email', query: { redirect: target } })
    } else {
      await navigateTo(target)
    }
  } catch (error: any) {
    const status = error?.status ?? error?.response?.status
    const code = error?.data?.code
    let message = error?.data?.message || t('signup.fail.description')
    if (status === 422 || code === VK_EMAIL_TAKEN) {
      message = code === VK_EMAIL_TAKEN
        ? vkErrorMessages.email_taken
        : ((Object.values(error?.data?.errors ?? {}).flat()[0] as string) || message)
    }
    toast.add({ title: t('signup.fail.title'), description: message, color: 'error' })
  } finally {
    isLoading.value = false
  }
}

const fields = computed(() => [{
  name: 'name',
  type: 'text' as const,
  label: t('signup.name'),
  placeholder: t('signup.namePlaceholder'),
  required: true
}, {
  name: 'email',
  type: 'text' as const,
  label: t('signup.email'),
  placeholder: t('signup.emailPlaceholder'),
  required: true
}, {
  name: 'password',
  label: t('signup.password'),
  type: 'password' as const,
  placeholder: t('signup.passwordPlaceholder'),
  required: true
}, {
  name: 'password_confirmation',
  label: t('signup.passwordConfirm'),
  type: 'password' as const,
  placeholder: t('signup.passwordConfirmPlaceholder'),
  required: true
}])

const schema = computed(() => z.object({
  name: z.string().min(2, t('signup.validation.name')),
  email: z.email(t('signup.validation.email')),
  password: z.string().min(8, t('signup.validation.passwordMin', { min: 8 })),
  password_confirmation: z.string()
}).refine((data) => data.password === data.password_confirmation, {
  message: t('signup.validation.passwordMismatch'),
  path: ['password_confirmation'],
}))

type Schema = z.output<typeof schema.value>

// Форма дозаполнения после VK (провайдер не вернул email)
const vkFields = [{
  name: 'name',
  type: 'text' as const,
  label: t('signup.name'),
  placeholder: t('signup.namePlaceholder'),
  required: true,
}, {
  name: 'email',
  type: 'text' as const,
  label: t('signup.email'),
  placeholder: t('signup.emailPlaceholder'),
  required: true,
}]

const vkSchema = z.object({
  name: z.string().min(2, t('signup.validation.name')),
  email: z.email(t('signup.validation.email')),
})

const client = useSanctumClient();
const { login } = useSanctumAuth();

const config = useRuntimeConfig()
const registerEndpoint = config.public.sanctum.endpoints.register

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  isLoading.value = true
  try {
    await client(registerEndpoint, {
      method: 'POST',
      body: payload.data,
    })

    await login({
      email: payload.data.email,
      password: payload.data.password,
      remember: true,
    })

    toast.add({
      title: t('signup.success.title'),
      description: t('signup.success.description'),
      color: 'success',
    })

    const target = (route.query.redirect as string) || '/'

    if (!user.value?.email_verified_at) {
      await navigateTo({ path: '/verify-email', query: { redirect: target } })
    } else {
      await navigateTo(target)
    }
  } catch (error: any) {
    const message = error?.data?.message || t('signup.fail.description')
    toast.add({
      title: t('signup.fail.title'),
      description: message,
      color: 'error',
    })
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <UAuthForm
    v-if="isVkIncomplete"
    :fields="vkFields"
    :schema="vkSchema"
    :title="t('signup.title')"
    :submit="{ label: t('signup.submit'), loading: isLoading }"
    @submit="onVkComplete"
  >
    <template #title>
      <AppLogo alt="Logo" class="w-32 h-32 mx-auto" />
      Завершите регистрацию
    </template>

    <template #description>
      Укажите email, чтобы завершить вход через VK.
    </template>
  </UAuthForm>

  <UAuthForm
    v-else
    :fields="fields"
    :schema="schema"
    :providers="providers"
    :title="t('signup.title')"
    :submit="{ label: t('signup.submit'), loading: isLoading }"
    @submit="onSubmit"
  >
    <template #title>
      <AppLogo alt="Logo" class="w-32 h-32 mx-auto" />
      {{ t('signup.title') }}
    </template>

    <template #description>
      {{ t('signup.haveAccount') }}
      <ULink to="/login" class="text-primary font-medium">
        {{ t('signup.login') }}
      </ULink>.
    </template>

    <template #footer>
      {{ t('signup.termsPrefix') }}
      <ULink to="/" class="text-primary font-medium">
        {{ t('signup.termsLink') }}
      </ULink>.
      <div><LocaleSwitcher /></div>
    </template>
  </UAuthForm>
</template>
