<!-- app/components/forms/PushNotificationsToggle.vue -->
<!--
  Переключатель браузерных push-уведомлений (см. docs/browser-push-spec.md §4.3).
  Запрос разрешения идёт только по user gesture (клик по переключателю).
-->
<script setup lang="ts">
const toast = useToast()
const { supported, permission, subscribed, refreshState, enablePush, disablePush } = useBrowserPush()

const loading = ref(true)
const updating = ref(false)

onMounted(async () => {
  await refreshState()
  loading.value = false
})

// Состояние переключателя: подписан и разрешение выдано.
const isOn = computed(() => subscribed.value && permission.value === 'granted')

const denied = computed(() => permission.value === 'denied')

async function handleToggle(value: boolean) {
  if (updating.value) return
  updating.value = true

  try {
    if (value) {
      const result = await enablePush()
      if (result === 'denied') {
        toast.add({
          title: 'Уведомления заблокированы',
          description: 'Разрешите уведомления для этого сайта в настройках браузера.',
          color: 'warning',
          icon: 'i-lucide-bell-off',
        })
      } else if (result === 'granted') {
        toast.add({ title: 'Уведомления включены', color: 'success' })
      } else {
        toast.add({
          title: 'Не поддерживается',
          description: 'Ваш браузер не поддерживает push-уведомления.',
          color: 'warning',
          icon: 'i-lucide-bell-off',
        })
      }
    } else {
      await disablePush()
      toast.add({ title: 'Уведомления отключены', color: 'neutral' })
    }
  } catch (e: any) {
    toast.add({
      title: 'Не удалось изменить настройку',
      description: e?.message ?? undefined,
      color: 'error',
    })
  } finally {
    await refreshState()
    updating.value = false
  }
}
</script>

<template>
  <UCard variant="subtle" class="mt-6">
    <template #header>
      <div class="flex items-center gap-3">
        <UIcon name="i-lucide-bell-ring" class="w-6 h-6 text-primary" />
        <div>
          <h3 class="font-semibold text-highlighted">Push-уведомления</h3>
          <p class="text-sm text-muted">Присылать уведомления на это устройство, даже когда вкладка закрыта.</p>
        </div>
      </div>
    </template>

    <!-- Загрузка -->
    <div v-if="loading" class="flex items-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
      Проверка состояния...
    </div>

    <!-- Браузер не поддерживает -->
    <div v-else-if="!supported" class="text-sm text-muted flex items-center gap-2">
      <UIcon name="i-lucide-bell-off" class="w-4 h-4" />
      Этот браузер не поддерживает push-уведомления.
    </div>

    <!-- Тумблер -->
    <div v-else class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="space-y-1">
        <p class="font-medium text-sm text-highlighted">
          Включить уведомления на этом устройстве
        </p>
        <p v-if="denied" class="text-xs text-error">
          Уведомления заблокированы в настройках браузера. Разрешите их для этого сайта.
        </p>
      </div>

      <div class="flex items-center gap-3">
        <span class="text-xs font-medium" :class="isOn ? 'text-success' : 'text-muted'">
          {{ isOn ? 'Включены' : 'Выключены' }}
        </span>
        <USwitch
          :model-value="isOn"
          :loading="updating"
          :disabled="updating || denied"
          @update:model-value="handleToggle"
        />
      </div>
    </div>
  </UCard>
</template>
