// app/composables/useRolesApi.ts

export interface Role {
  name: string
  label: string | null
  description: string | null
}

export const useRolesApi = () => {
  const config = useRuntimeConfig()
  const baseURL = config.public.apiBase

  /**
   * Получить роли по списку name.
   * GET /api/roles?names[]=admin&names[]=editor
   */
  async function fetchRoles(): Promise<Role[]> {
    return await $fetch<Role[]>('/roles', {
      baseURL,
      headers: { Accept: 'application/json' },
      credentials: 'include',
    })
  }

  /**
   * Вариант через useFetch — если вызывается в setup.
   * Даёт SSR-загрузку и реактивность.
   */
  function useRoles() {
    return useFetch<Role[]>('/roles', {
      baseURL,
      headers: { Accept: 'application/json' },
      credentials: 'include',
      key: `roles-object`,
    })
  }

  return {
    fetchRoles,
    useRoles,
  }
}
