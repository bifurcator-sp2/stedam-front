// app/composables/useAuth.ts

export type Direction = 'ltr' | 'rtl'

export interface AuthUser {
  id: number
  name: string
  email: string
  email_verified_at: string | null
  roles: string[] // ['admin', 'student']
  allow_password_auth: boolean
  rolesCount: number
  allRoles: { name: string; label: string | null }[] // [{ name: 'student', label: 'Ученик' }]
  permissions: string[]
  direction: Direction
}

export const useAuth = () => {
  const { user, login, logout, refreshIdentity } = useSanctumAuth<AuthUser>()

  // Инстанцируем api здесь — в setup/middleware-контексте.
  // Так методы ниже могут вызывать api.* безопасно, без "nuxt instance unavailable".
  const api = useApi()

  const roles = computed<string[]>(() => user.value?.roles ?? [])
  const allRoles = computed<string[]>(() => user.value?.allRoles ?? [])
  const permissions = computed<string[]>(() => user.value?.permissions ?? [])
  const rolesCount = computed<number>(() => user.value?.rolesCount ?? 0)
  const isEmailVerified = computed<boolean>(() =>
    Boolean(user.value?.email_verified_at),
  )

  async function fetchUser(): Promise<void> {
    await refreshIdentity()
  }

  async function resendVerificationEmail(): Promise<void> {
    await api.post('/email/verification-notification')
  }

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

  // Направление
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
    isEmailVerified,
    fetchUser,
    resendVerificationEmail,
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
    refreshIdentity,
  }
}
