<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '#ui/types'

definePageMeta({
  layout: 'default',
  middleware: [
    function () {
      const { user, roles } = useAuth()
      if (user.value && roles.value.length > 0) {
        return navigateTo('/')
      }
    },
  ],
})

const { t } = useI18n()
const { rolesCount } = useAuth()
const api = useApi()
const toast = useToast()

const title = 'Stedam'
const description = 'Stedam'

useSeoMeta({
  titleTemplate: '',
  title,
  ogTitle: title,
  description,
  ogDescription: description,
  ogImage: 'https://ui.nuxt.com/assets/templates/nuxt/saas-light.png',
})

const rolesIcons: Record<string, string> = {
  student: 'i-lucide-graduation-cap',
  teacher: 'i-lucide-presentation',
  parent: 'i-lucide-users',
  methodologist: 'i-lucide-book-open',
}

// Загрузка ролей
const { useRoles } = useRolesApi()
const { data: roles, pending, error } = await useRoles()

// Выбранные роли
const selected = ref<Record<string, boolean>>({})

const selectedCount = computed(() =>
  Object.values(selected.value).filter(Boolean).length,
)
const limitReached = computed(() => selectedCount.value >= rolesCount.value)

function isRoleDisabled(roleName: string): boolean {
  if (selected.value[roleName]) return false
  return limitReached.value
}

// Валидация формы
function validate(): FormError[] {
  const errors: FormError[] = []
  if (selectedCount.value === 0) {
    errors.push({ path: 'roles', message: t('roles.validation.empty') })
  }
  if (selectedCount.value > rolesCount.value) {
    errors.push({
      path: 'roles',
      message: t('roles.validation.max', { max: rolesCount.value }),
    })
  }
  return errors
}

// Очистка selected: только ключи с true
function getSelectedRoleNames(): string[] {
  return Object.entries(selected.value)
    .filter(([, v]) => v)
    .map(([name]) => name)
}

// Локализованное название роли: приоритет у role.label из API, потом i18n, потом name
function roleTitle(role: { name: string; label?: string | null }): string {
  return role.label ?? t(`roles.names.${role.name}`, role.name) ?? role.name
}

const loading = ref(false)

async function onSubmit() {
  const roleNames = getSelectedRoleNames()

  if (roleNames.length === 0) {
    toast.add({
      title: t('roles.validation.empty'),
      color: 'warning',
    })
    return
  }

  loading.value = true

  try {
    await api.post('/set-user-roles', { roles: roleNames })

    toast.add({
      title: t('roles.messages.saved'),
      color: 'success',
    })

    const config = useRuntimeConfig()
    if (import.meta.client) {
      window.location.href = config.app.baseURL
    }
  } catch (e: any) {
    toast.add({
      title: t('roles.messages.save_error'),
      description: e?.data?.message ?? t('roles.messages.unknown_error'),
      color: 'error',
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UContainer>
    <div class="min-h-screen flex items-center justify-center px-4 py-8">
      <div class="flex flex-col items-center gap-4">
        <AppLogo alt="Logo" class="w-32 h-32" />

        <UCard
          class="w-full"
          :title="t('roles.page.title')"
          :description="t('roles.page.description')"
        >
          <LoadingOverlay :loading="loading">
            <!-- Загрузка -->
            <div v-if="pending" class="py-8 text-center text-muted">
              {{ t('roles.loading') }}
            </div>

            <!-- Ошибка -->
            <div v-else-if="error" class="py-8 text-center text-red-500">
              {{ t('roles.error') }}
            </div>

            <!-- Форма -->
            <UForm
              v-else
              :state="selected"
              :validate="validate"
              @submit="onSubmit"
            >
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <UCard
                  v-for="role in roles"
                  :key="role.name"
                  variant="subtle"
                  class="w-full"
                >
                  <template #header>
                    <div class="flex items-start gap-3">
                      <UIcon
                        :name="rolesIcons[role.name] ?? 'i-lucide-user'"
                        class="w-6 h-6 text-primary shrink-0 mt-0.5"
                      />
                      <div>
                        <h3 class="font-semibold text-highlighted">
                          {{ roleTitle(role) }}
                        </h3>
                        <p class="text-sm text-muted">
                          {{ role.description ?? '' }}
                        </p>
                      </div>
                    </div>
                  </template>

                  <template #footer>
                    <div class="flex justify-end">
                      <USwitch
                        v-model="selected[role.name]"
                        size="xl"
                        unchecked-icon="i-lucide-x"
                        checked-icon="i-lucide-check"
                        :label="t('roles.switchLabel', { role: roleTitle(role) })"
                        :disabled="isRoleDisabled(role.name)"
                      />
                    </div>
                  </template>
                </UCard>
              </div>

              <div class="flex flex-col gap-3 pt-6">
                <p class="text-sm text-muted text-center">
                  {{ t('roles.selected', { selected: selectedCount, total: rolesCount }) }}
                </p>
                <div class="flex justify-center">
                  <UButton
                    type="submit"
                    trailing-icon="i-lucide-arrow-right"
                    size="md"
                    :loading="loading"
                    :disabled="selectedCount === 0"
                  >
                    {{ t('roles.submit') }}
                  </UButton>
                </div>
              </div>
            </UForm>
          </LoadingOverlay>
        </UCard>
      </div>
    </div>
  </UContainer>
</template>
