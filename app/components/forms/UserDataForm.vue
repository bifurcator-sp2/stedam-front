<!-- app/components/UserDataForm.vue -->
<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '#ui/types'

const { t } = useI18n()

const { show, save, countries } = useUserDataApi()
const { user: authUser, refreshIdentity } = useSanctumAuth()

// после: const { user: authUser } = useSanctumAuth()


// Загрузка данных и справочника через useAsyncData (SSR-friendly)
const { data: userData, } = await useAsyncData(
  'user-data',
  () => show(),
)

const { data: countryOptions } = await useAsyncData(
  'countries-list',
  () => countries(),
)

// Локальный стейт формы
const state = reactive({
  first_name: userData.value?.first_name ?? '',
  last_name: userData.value?.last_name ?? '',
  middle_name: userData.value?.middle_name ?? '',
  birth_year: userData.value?.birth_year ?? null,
  gender: userData.value?.gender ?? null,
  country_id: userData.value?.country_id ?? null,
  direction: userData.value?.direction ?? 'ltr',
})

// Опции для селектов (через t())
const genderOptions = computed(() => [
  { label: t('profile.gender.male'), value: 'male' },
  { label: t('profile.gender.female'), value: 'female' },
])

const directionOptions = computed(() => [
  { label: t('profile.direction.ltr'), value: 'ltr' },
  { label: t('profile.direction.rtl'), value: 'rtl' },
])

// Валидация
function validate(state: typeof state): FormError[] {
  const errors: FormError[] = []
  if (
    state.birth_year &&
    (state.birth_year < 1900 || state.birth_year > new Date().getFullYear())
  ) {
    errors.push({
      path: 'birth_year',
      message: t('profile.validation.birth_year'),
    })
  }
  return errors
}

const loading = ref(false)
const toast = useToast()

async function onSubmit(event: FormSubmitEvent<typeof state>) {
  loading.value = true
  try {
    await save({
      first_name: event.data.first_name || null,
      last_name: event.data.last_name || null,
      middle_name: event.data.middle_name || null,
      birth_year: event.data.birth_year || null,
      gender: event.data.gender || null,
      country_id: event.data.country_id || null,
      direction: event.data.direction || 'ltr',
    })
    await refreshIdentity()

    toast.add({
      title: t('profile.messages.saved'),
      color: 'success',
    })

    /*await reloadNuxtApp({
      path: '/app/profile', // Путь, на который нужно перезагрузиться
      ttl: 1000, // Защита от циклов: игнорировать повторные вызовы в течение 10 секунд
    })*/

  } catch (e: any) {
    toast.add({
      title: t('profile.messages.save_error'),
      description: e?.data?.message ?? t('profile.messages.unknown_error'),
      color: 'error',
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard variant="subtle">
    <template #header>
      <div class="flex items-center gap-3">
        <UIcon name="i-lucide-user" class="w-6 h-6 text-primary" />
        <div>
          <h3 class="font-semibold text-highlighted">
            {{ t('profile.title') }}
          </h3>
          <p class="text-sm text-muted">
            {{ t('profile.subtitle', { name: authUser?.name ?? '' }) }}
          </p>
        </div>
      </div>
    </template>

    <UForm
      :state="state"
      :validate="validate"
      class="space-y-4"
      @submit="onSubmit"
    >
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UFormField :label="t('profile.fields.last_name')" name="last_name">
          <UInput v-model="state.last_name" class="w-full" />
        </UFormField>

        <UFormField :label="t('profile.fields.first_name')" name="first_name">
          <UInput v-model="state.first_name" class="w-full" />
        </UFormField>

        <UFormField :label="t('profile.fields.middle_name')" name="middle_name">
          <UInput v-model="state.middle_name" class="w-full" />
        </UFormField>

        <UFormField :label="t('profile.fields.birth_year')" name="birth_year">
          <UInput
            v-model.number="state.birth_year"
            type="number"
            :min="1900"
            :max="new Date().getFullYear()"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('profile.fields.gender')" name="gender">
          <USelect
            v-model="state.gender"
            :items="genderOptions"
            :placeholder="t('profile.placeholders.gender')"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('profile.fields.country')" name="country_id">
          <USelectMenu
            v-model="state.country_id"
            :items="countryOptions ?? []"
            value-key="id"
            label-key="name"
            :search-input="{ placeholder: t('profile.placeholders.search') }"
            :placeholder="t('profile.placeholders.country')"
            searchable
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('profile.fields.direction')"
          name="direction"
          :help="t('profile.help.direction')"
          class="md:col-span-2"
        >
          <URadioGroup
            v-model="state.direction"
            :items="directionOptions"
            orientation="horizontal"
          />
        </UFormField>
      </div>

      <div class="flex justify-end">
        <UButton
          type="submit"
          :loading="loading"
          trailing-icon="i-lucide-save"
        >
          {{ t('profile.actions.save') }}
        </UButton>
      </div>
    </UForm>
  </UCard>
</template>
