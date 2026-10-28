<!-- app/components/UserDataForm.vue -->
<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '#ui/types'
import Whiteboard from '~/components/Education/Whiteboard/Whiteboard.vue'

const { t } = useI18n()
const { countries } = useUserDataApi()
const { user: authUser } = useSanctumAuth()
const { hasRole } = useAuth()

// Глобальный стор профиля
const { userData, saveUserData } = useProfile()

// Загрузка стран
const { data: countryOptions } = await useAsyncData('countries-list', () => countries())

const bgOptions = [
  { label: 'Без фона', value: 'none' },
  { label: 'В линию', value: 'lined' },
  { label: 'В клетку', value: 'grid' },
  { label: 'В точки', value: 'dots' },
]

const presetColors = ['#d1d5db', '#93c5fd', '#86efac', '#fde047', '#fca5a5', '#c4b5fd']

// Локальный стейт формы (инициализируется из глобального профиля)
const state = reactive({
  first_name: userData.value?.first_name ?? '',
  last_name: userData.value?.last_name ?? '',
  middle_name: userData.value?.middle_name ?? '',
  birth_year: userData.value?.birth_year ?? null,
  gender: userData.value?.gender ?? null,
  country_id: userData.value?.country_id ?? null,
  direction: userData.value?.direction ?? 'ltr',

  settings: {
    ink: {
      penSize: userData.value?.settings?.ink?.penSize ?? 3,
      eraserSize: userData.value?.settings?.ink?.eraserSize ?? 30,
      bg: userData.value?.settings?.ink?.bg ?? 'none',
      bgOpacity: userData.value?.settings?.ink?.bgOpacity ?? 1,
      bgScale: userData.value?.settings?.ink?.bgScale ?? 1,
      bgColor: userData.value?.settings?.ink?.bgColor ?? '#d1d5db',
    }
  }
})

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
  if (state.birth_year && (state.birth_year < 1900 || state.birth_year > new Date().getFullYear())) {
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
    await saveUserData({
      first_name: event.data.first_name || null,
      last_name: event.data.last_name || null,
      middle_name: event.data.middle_name || null,
      birth_year: event.data.birth_year || null,
      gender: event.data.gender || null,
      country_id: event.data.country_id || null,
      direction: event.data.direction || 'ltr',
      settings: event.data.settings
    })

    toast.add({ title: t('profile.messages.saved'), color: 'success' })
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
  <div class="flex flex-col gap-6">
    <UCard variant="subtle">
      <template #header>
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-user" class="w-6 h-6 text-primary" />
          <div>
            <h3 class="font-semibold text-highlighted">{{ t('profile.title') }}</h3>
            <p class="text-sm text-muted">{{ t('profile.subtitle', { name: authUser?.name ?? '' }) }}</p>
          </div>
        </div>
      </template>

      <UForm :state="state" :validate="validate" class="space-y-6" @submit="onSubmit">
        <!-- Основные данные -->
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
            <UInput v-model.number="state.birth_year" type="number" :min="1900" :max="new Date().getFullYear()" class="w-full" />
          </UFormField>
          <UFormField :label="t('profile.fields.gender')" name="gender">
            <USelect v-model="state.gender" :items="genderOptions" :placeholder="t('profile.placeholders.gender')" class="w-full" />
          </UFormField>
          <UFormField :label="t('profile.fields.country')" name="country_id">
            <USelectMenu
              v-model="state.country_id" :items="countryOptions ?? []" value-key="id" label-key="name"
              :search-input="{ placeholder: t('profile.placeholders.search') }" :placeholder="t('profile.placeholders.country')"
              searchable class="w-full"
            />
          </UFormField>
          <UFormField :label="t('profile.fields.direction')" name="direction" :help="t('profile.help.direction')" class="md:col-span-2">
            <URadioGroup v-model="state.direction" :items="directionOptions" orientation="horizontal" />
          </UFormField>
        </div>

        <USeparator />

        <!-- Блок рукописного ввода (Whiteboard) -->
        <div class="space-y-5">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-pen-tool" class="w-5 h-5 text-primary" />
            <h4 class="text-base font-semibold text-highlighted">Настройки рукописного ввода</h4>
          </div>

          <!-- Настройки -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end bg-elevated/50 p-4 rounded-lg border border-default">
            <UFormField label="Толщина пера (px)">
              <USlider v-model="state.settings.ink.penSize" :min="1" :max="20" />
            </UFormField>

            <UFormField label="Размер ластика (px)">
              <USlider v-model="state.settings.ink.eraserSize" :min="10" :max="100" />
            </UFormField>

            <UFormField label="Фон">
              <USelect v-model="state.settings.ink.bg" :items="bgOptions" class="w-full" />
            </UFormField>

            <div class="flex gap-2">
              <UFormField label="Прозрачность" class="flex-1">
                <USlider v-model="state.settings.ink.bgOpacity" :min="0.1" :max="1" :step="0.05" :disabled="state.settings.ink.bg === 'none'" />
              </UFormField>
              <UFormField label="Масштаб" class="flex-1">
                <USlider v-model="state.settings.ink.bgScale" :min="0.25" :max="3" :step="0.05" :disabled="state.settings.ink.bg === 'none'" />
              </UFormField>
            </div>

            <UFormField label="Цвет линий фона" class="md:col-span-2 lg:col-span-4">
              <div class="flex flex-wrap items-center gap-2 mt-1">
                <button
                  v-for="color in presetColors" :key="color" type="button"
                  class="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                  :class="state.settings.ink.bgColor === color ? 'border-highlighted scale-110 shadow-sm' : 'border-transparent'"
                  :style="{ backgroundColor: color }"
                  @click="state.settings.ink.bgColor = color"
                ></button>
                <div class="relative w-6 h-6 rounded-full border border-default overflow-hidden bg-gradient-to-tr from-red-500 via-green-500 to-blue-500 cursor-pointer hover:scale-110 transition-transform ml-1">
                  <input type="color" v-model="state.settings.ink.bgColor" class="absolute inset-[-10px] w-10 h-10 cursor-pointer opacity-0">
                </div>
              </div>
            </UFormField>
          </div>

          <!-- Превью (под настройками) -->
          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium text-muted">Предпросмотр</span>
            <div class="w-full h-[300px] border border-default rounded-lg overflow-hidden relative bg-default shadow-inner">
              <!-- Передаем локальный стейт настроек для живого предпросмотра -->
              <Whiteboard
                :settings="state.settings.ink"
                hide-toolbar
              />
            </div>
          </div>
        </div>

        <!-- Кнопка сохранения -->
        <div class="flex justify-end pt-4">
          <UButton type="submit" :loading="loading" trailing-icon="i-lucide-save">
            {{ t('profile.actions.save') }}
          </UButton>
        </div>
      </UForm>
    </UCard>

    <FormsDeviceAccessToggle v-if="hasRole('admin')" />
  </div>
</template>
