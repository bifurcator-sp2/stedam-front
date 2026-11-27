// app/composables/useRegProviders.ts
// Реестр внешних провайдеров входа/регистрации. См. docs/auth-providers.md

export interface RegProvider {
  key: 'vk' | 'max'
  label: string
  icon?: string
  enabled: boolean
  onClick: () => void
}

export function useRegProviders() {
  const config = useRuntimeConfig()
  const apiBase = config.public.apiBase

  function start(provider: RegProvider['key']) {
    // Бэк отвечает 302 на authorize-URL провайдера (см. docs/auth-providers.md)
    window.location.href = `${apiBase}/auth/${provider}/redirect`
  }

  const providers: RegProvider[] = [
    {
      key: 'vk',
      label: 'VK',
      icon: 'i-simple-icons-vk',
      enabled: true,
      onClick: () => start('vk'),
    },
    {
      key: 'max',
      label: 'MAX',
      enabled: false,
      onClick: () => start('max'),
    },
  ]

  // В UAuthForm попадают только включённые провайдеры
  return computed(() =>
    providers.filter((p) => p.enabled).map(({ key, label, icon, onClick }) => ({
      key,
      label,
      icon,
      onClick,
    })),
  )
}
