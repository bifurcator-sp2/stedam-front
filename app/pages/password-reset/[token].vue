<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({
  layout: 'auth',
  sanctum: {
    excluded: true, // Страница доступна без авторизации
  },
})


const { t } = useI18n()
const route = useRoute()
const client = useSanctumClient()
const config = useRuntimeConfig()
const resetEndpoint = config.public.sanctum.endpoints.resetPassword

const token = route.params.token as string
const email = route.query.email as string

const toast = useToast()
const isLoading = ref(false)

const fields = computed(() => [{
  name: 'password',
  type: 'password' as const,
  label: t('reset.password'),
  placeholder: t('reset.passwordPlaceholder'),
  required: true,
}, {
  name: 'password_confirmation',
  type: 'password' as const,
  label: t('reset.passwordConfirm'),
  placeholder: t('reset.passwordConfirmPlaceholder'),
  required: true,
}])

const schema = computed(() => z.object({
  password: z.string().min(8, t('reset.validation.passwordMin', { min: 8 })),
  password_confirmation: z.string(),
}).refine((d) => d.password === d.password_confirmation, {
  message: t('reset.validation.passwordMismatch'),
  path: ['password_confirmation'],
}))

async function onSubmit(payload: FormSubmitEvent<z.output<typeof schema.value>>) {
  isLoading.value = true
  try {
    await client(resetEndpoint, {
      method: 'POST',
      body: {
        token,
        email,
        password: payload.data.password,
        password_confirmation: payload.data.password_confirmation,
      },
    })

    await login({
      email: payload.data.email,
      password: payload.data.password,
      remember: true,
    })

    toast.add({
      title: t('reset.success.title'),
      description: t('reset.success.description'),
      color: 'success',
    })

    await navigateTo('/login')
  } catch (error: any) {
    const message = error?.data?.message || t('reset.fail.description')
    toast.add({ title: t('reset.fail.title'), description: message, color: 'error' })
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <UAuthForm
    :fields="fields"
    :schema="schema"
    :submit="{ label: t('reset.submit'), loading: isLoading }"
    @submit="onSubmit"
  >
    <template #title>
      <AppLogo alt="Logo" class="w-32 h-32 mx-auto" />
      {{ t('reset.title') }}
    </template>
    <template #description>
      {{ t('reset.description') }}

    </template>
    <template #footer>
      <div><LocaleSwitcher /></div>
    </template>
  </UAuthForm>
</template>
