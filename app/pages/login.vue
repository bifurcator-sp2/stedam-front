
<script setup lang="ts">
const { t } = useI18n();
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'


definePageMeta({
  layout: 'auth',
  sanctum: {
    excluded: true, // Страница не проверяется globalMiddleware
  },
})

useSeoMeta({
  title: 'Login',
  description: 'Login to your account to continue'
})

const toast = useToast()

const form = ref({ email: '', password: '' });

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

const providers = useRegProviders()


const { login, isAuthenticated, user } = useSanctumAuth();


const schema = z.object({
  email: z.email(t('login.validation.email')),
  password: z.string().min(8, t('login.validation.passwordMin', { min: 8 })),
  remember: z.boolean().optional().default(false),
})

type Schema = z.output<typeof schema>


async function onSubmit(payload: FormSubmitEvent<Schema>) {

  try {
    await login({
      email: payload.data.email,
      password: payload.data.password,
      remember: payload.data.remember ?? false,
    })

    toast.add({
      title: t('login.success.title'),
      description: t('login.success.description'),
      color: 'success',
    })

    await navigateTo('/')
  } catch (error: any) {
    const message =
      error?.data?.errors?.email?.[0] ||
      error?.data?.message ||
      t('login.fail.description')+" "+error
    //console.log(error);
    toast.add({
      title: t('login.fail.title'),
      description: message,
      color: 'error',
    })
  }

  /*const route = useRoute()
  console.log('LOGIN ROUTE:', route.path, route.name)*/

}
</script>

<template>

  <UAuthForm
    v-if="!isAuthenticated"
    :fields="fields"
    :schema="schema"
    :providers="providers"
    :title="t('login.title')"
    :separator="t('login.or')"
    :submit="{ label: t('login.submit') }"
    @submit="onSubmit"
  >

    <template #title>
      <AppLogo alt="Logo" class="w-32 h-32 mx-auto" />
      {{t('login.title')}}
    </template>

    <template #description>

      {{t('login.noAccount')}} <ULink
        to="/signup"
        class="text-primary font-medium"
      >{{t('login.signUp')}}</ULink>.
    </template>

    <template #password-hint>
      <ULink
        to="/forgot-password"
        class="text-primary font-medium"
        tabindex="-1"
      >{{t('login.forgotPassword')}}</ULink>
    </template>

    <template #footer>
      {{t('terms.agree')}} <ULink
        to="/"
        class="text-primary font-medium"
      >{{t('terms.terms')}}</ULink>.
      <br>
      <LocaleSwitcher />
    </template>
  </UAuthForm>
</template>

