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

    await new Promise(resolve => setTimeout(resolve, 100))

    //console.log('login', login);

    await login({
      email: payload.data.email,
      password: payload.data.password,
      remember: true,
    })

    toast.add({
      title: t('signup.success.title'),
      description: t('signup.success.description'),
      color: 'success'
    })

    await navigateTo('/')
  } catch (error: any) {
    //console.log('reg: '+error);
    const message = error?.data?.message || t('signup.fail.description')
    toast.add({
      title: t('signup.fail.title'),
      description: message,
      color: 'error'
    })
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <UAuthForm
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
