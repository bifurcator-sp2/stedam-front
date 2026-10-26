// app/composables/useActiveRole.ts

export const useActiveRole = () => {
  // Теперь allRoles — это публичные роли (массив объектов)
  const { allRoles } = useAuth()

  const STORAGE_KEY = 'active_role'
  const NO_ROLES_FLAG = 'none'

  // Возвращаем публичные роли как есть (там уже есть name и label)
  const publicRoles = computed(() => allRoles.value ?? [])

  function getActiveRole(): string | null {
    if (!import.meta.client) return null

    const available = publicRoles.value
    const stored = localStorage.getItem(STORAGE_KEY)

    if (available.length === 0) {
      localStorage.setItem(STORAGE_KEY, NO_ROLES_FLAG)
      return null
    }

    const roleNames = available.map(r => typeof r === 'string' ? r : r.name)

    if (stored && stored !== NO_ROLES_FLAG && roleNames.includes(stored)) {
      return stored
    }

    // Берем первую доступную публичную роль
    const first = roleNames[0]
    localStorage.setItem(STORAGE_KEY, first)
    return first
  }

  function setActiveRole(roleName: string, reload = true) {
    if (!import.meta.client) return
    localStorage.setItem(STORAGE_KEY, roleName)
    if (reload) window.location.reload()
  }

  return {
    publicRoles,
    getActiveRole,
    setActiveRole
  }
}
