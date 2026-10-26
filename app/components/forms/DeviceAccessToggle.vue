<!-- app/components/DeviceAccessToggle.vue -->
<script setup lang="ts">
const toast = useToast()
const api = useApi()
const { deviceId, getDeviceId } = useDeviceFingerprint()

const isAllowed = ref(false)
const loading = ref(true)
const updating = ref(false)

onMounted(async () => {
  // Получаем отпечаток устройства
  const id = await getDeviceId()

  if (!id) {
    loading.value = false
    return
  }

  try {
    // Проверяем статус устройства на бэкенде
    const res = await api.get<{ allowed: boolean }>(`/devices/${id}/check`)
    isAllowed.value = res.allowed
  } catch (e) {
    console.error('Ошибка при проверке устройства:', e)
  } finally {
    loading.value = false
  }
})

// Обработчик переключения
async function handleToggle(value: boolean) {
  if (!deviceId.value) return

  updating.value = true
  // Оптимистичное обновление: меняем UI сразу
  const previous = isAllowed.value
  isAllowed.value = value

  try {
    if (value) {
      // Добавляем устройство в белый список
      await api.post(`/admin/devices/${deviceId.value}`, {
        description: 'Разрешено через профиль администратора'
      })
      toast.add({
        title: 'Устройство разрешено',
        description: 'Теперь на этом планшете можно входить по паролю.',
        color: 'success',
      })
    } else {
      // Удаляем устройство из белого списка
      await api.delete(`/admin/devices/${deviceId.value}`)
      toast.add({
        title: 'Устройство заблокировано',
        description: 'Вход по паролю на этом планшете запрещен.',
        color: 'warning',
      })
    }
  } catch (e) {
    // Откат UI при ошибке
    isAllowed.value = previous
    // Ошибку 403 или 500 уже покажет глобальный обработчик в useApi
  } finally {
    updating.value = false
  }
}
</script>

<template>
  <UCard variant="subtle" class="mt-6">
    <template #header>
      <div class="flex items-center gap-3">
        <UIcon name="i-lucide-tablet-smartphone" class="w-6 h-6 text-primary" />
        <div>
          <h3 class="font-semibold text-highlighted">
            Управление доступом с устройства
          </h3>
          <p class="text-sm text-muted">
            Настройка входа по паролю для школьных планшетов.
          </p>
        </div>
      </div>
    </template>

    <!-- Загрузка -->
    <div v-if="loading" class="flex items-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
      Определение ID устройства...
    </div>

    <!-- Не удалось получить ID -->
    <div v-else-if="!deviceId" class="text-sm text-error flex items-center gap-2">
      <UIcon name="i-lucide-triangle-alert" class="w-4 h-4" />
      Не удалось определить устройство. Проверьте настройки браузера.
    </div>

    <!-- Тумблер -->
    <div v-else class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="space-y-1">
        <p class="font-medium text-sm text-highlighted">
          Разрешить на этом устройстве авторизацию по паролю
        </p>
        <p class="text-xs text-muted break-all">
          ID: <code class="bg-elevated px-1 py-0.5 rounded text-xs">{{ deviceId }}</code>
        </p>
      </div>

      <div class="flex items-center gap-3">
        <span
          class="text-xs font-medium"
          :class="isAllowed ? 'text-success' : 'text-error'"
        >
          {{ isAllowed ? 'Разрешено' : 'Запрещено' }}
        </span>
        <USwitch
          v-model="isAllowed"
          :loading="updating"
          :disabled="updating"
          @update:model-value="handleToggle"
        />
      </div>
    </div>
  </UCard>
</template>
