<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
const { t } = useI18n()
interface Props {
  /** Вариант отображения: кнопка или пункт меню */
  variant?: 'button' | 'menu-item'
  /** Текст кнопки (для variant="button") */
  label?: string
  /** Иконка */
  icon?: string
  /** Цвет кнопки */
  color?: 'primary' | 'neutral' | 'error' | 'warning' | 'success' | 'info'
  /** Размер кнопки */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'button',
  label: 'Выйти',
  icon: 'i-lucide-log-out',
  color: 'neutral',
  size: 'md',
})

const { logout } = useSanctumAuth()
const user = useSanctumUser()
const toast = useToast()


const isLoading = ref(false)

async function handleLogout() {
  if (isLoading.value) return

  isLoading.value = true
  try {
    await logout()

    // Явно сбрасываем состояние пользователя
    user.value = null

    toast.add({
      title: t('logout.successTitle'),
      description: t('logout.successDescription'),
      color: 'success',
    })

    await navigateTo('/login')
  } catch (error: any) {
    toast.add({
      title: t('logout.errorTitle'),
      description: error?.data?.message || t('logout.errorDescription'),
      color: 'error',
    })
  } finally {
    isLoading.value = false
  }
}

// Если используется как пункт меню — отдаём item наружу через слот
const menuItem = computed<DropdownMenuItem>(() => ({
  label: props.label,
  icon: props.icon,
  color: 'error',
  onSelect: handleLogout,
}))
</script>

<template>
  <!-- Вариант 1: обычная кнопка -->
  <UButton
    v-if="variant === 'button'"
    :label="label"
    :icon="icon"
    :color="color"
    :size="size"
    :loading="isLoading"
    @click="handleLogout"
  />

  <!-- Вариант 2: пункт выпадающего меню -->
  <UDropdownMenu
    v-else
    :items="[[menuItem]]"
  >
    <UButton
      :label="label"
      :icon="icon"
      :color="color"
      :size="size"
      :loading="isLoading"
      variant="ghost"
      trailing-icon="i-lucide-chevron-down"
    />
  </UDropdownMenu>
</template>
