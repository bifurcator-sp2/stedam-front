// app/composables/useAuth.ts

export type Direction = 'ltr' | 'rtl'

export interface AuthUser {
  id: number
  name: string
  email: string
  roles: string[]
  rolesCount: number
  allRoles: string[]
  permissions: string[]
  direction: Direction
}

export const useAuth = () => {
  const { user, login, logout, refresh } = useSanctumAuth<AuthUser>()

  const roles = computed<string[]>(() => user.value?.roles ?? [])
  const allRoles = computed<string[]>(() => user.value?.allRoles ?? [])
  const permissions = computed<string[]>(() => user.value?.permissions ?? [])
  const rolesCount = computed<number>(() => user.value?.rolesCount ?? 0)

  // direction — отдельный useState, чтобы можно было писать
  const direction = useState<Direction>('auth.direction', () => 'ltr')

  // Синхронизация: когда Sanctum обновляет user — подтягиваем direction
  watch(
    () => user.value?.direction,
    (val) => {
      if (val && val !== direction.value) {
        direction.value = val
      }
    },
    { immediate: true },
  )

  const isRtl = computed(() => direction.value === 'rtl')

  // Роли
  function hasRole(name: string): boolean {
    return roles.value.includes(name)
  }
  function hasAnyRole(names: string[]): boolean {
    return names.some((n) => roles.value.includes(n))
  }
  function hasAllRoles(names: string[]): boolean {
    return names.every((n) => roles.value.includes(n))
  }

  // Разрешения
  function can(permission: string): boolean {
    return permissions.value.includes(permission)
  }
  function canAny(list: string[]): boolean {
    return list.some((p) => permissions.value.includes(p))
  }
  function canAll(list: string[]): boolean {
    return list.every((p) => permissions.value.includes(p))
  }

  // Направление — оптимистичное обновление + откат при ошибке
  async function setDirection(value: Direction): Promise<void> {
    direction.value = value
  }

  async function toggleDirection(): Promise<void> {
    await setDirection(direction.value === 'ltr' ? 'rtl' : 'ltr')
  }

  return {
    user,
    roles,
    allRoles,
    rolesCount,
    permissions,
    direction,
    isRtl,
    setDirection,
    toggleDirection,
    hasRole,
    hasAnyRole,
    hasAllRoles,
    can,
    canAny,
    canAll,
    login,
    logout,
    refresh,
  }
}
