<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import AppLogo from "../components/AppLogo.vue";

const { t } = useI18n()

definePageMeta({
  layout: 'auth',
  sanctum: {
    excluded: true, // Страница доступна без авторизации
  },
})

useSeoMeta({
  title: 'Forgot password',
  description: 'Reset your password',
})

const toast = useToast()
const client = useSanctumClient()
const config = useRuntimeConfig()
const { login } = useSanctumAuth();
const forgotEndpoint = config.public.sanctum.endpoints.forgotPassword

const isLoading = ref(false)
const isSent = ref(false)

const fields = computed(() => [{
  name: 'email',
  type: 'text' as const,
  label: t('forgot.email'),
  placeholder: t('forgot.emailPlaceholder'),
  required: true,
}])

const schema = computed(() => z.object({
  email: z.email(t('forgot.validation.email')),
}))

type Schema = z.output<typeof schema.value>

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  isLoading.value = true
  try {
    await client(forgotEndpoint, {
      method: 'POST',
      body: { email: payload.data.email },
    })

    isSent.value = true

    toast.add({
      title: t('forgot.success.title'),
      description: t('forgot.success.description'),
      color: 'success',
    })
  } catch (error: any) {
    const message =
      error?.data?.errors?.email?.[0] ||
      error?.data?.message ||
      t('forgot.fail.description')

    toast.add({
      title: t('forgot.fail.title'),
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
    v-if="!isSent"
    :fields="fields"
    :schema="schema"
    :submit="{ label: t('forgot.submit'), loading: isLoading }"
    @submit="onSubmit"
  >
    <template #title>
      <AppLogo alt="Logo" class="w-32 h-32 mx-auto" />
      {{t('forgot.title')}}
    </template>

    <template #description>
      <div class="whitespace-pre-line">{{ t('forgot.description') }}</div>

      <ULink to="/login" class="text-primary font-medium">
        {{ t('forgot.backToLogin') }}
      </ULink>
    </template>
    <template #footer>
      <div><LocaleSwitcher /></div>
    </template>
  </UAuthForm>

  <UPageCard
    v-else
    variant="subtle"
    class="max-w-sm w-full text-center"
  >
    <img src="/images/stedam560.jpg" alt="Logo" class="w-16 h-16 mx-auto" />
    <UIcon name="i-lucide-mail-check" class="w-12 h-12 mx-auto text-primary" />
    <h2 class="text-lg font-semibold mt-4">{{ t('forgot.sent.title') }}</h2>
    <p class="text-sm text-gray-500 mt-2">{{ t('forgot.sent.description') }}</p>
    <UButton to="/login" class="mt-6" block>
      {{ t('forgot.backToLogin') }}
    </UButton>
  </UPageCard>
</template>
