// app/composables/useProfile.ts
import type { UserData, UserDataPayload } from './useUserDataApi'

export const useProfile = () => {
  const { user, refreshIdentity } = useAuth()
  const api = useUserDataApi()

  // Глобальное состояние для данных профиля
  const userData = useState<UserData | null>('profile.userData', () => null)
  const loading = useState<boolean>('profile.loading', () => false)
  const loaded = useState<boolean>('profile.loaded', () => false)

  /**
   * Загрузка профиля (защищена от повторных запросов)
   */
  async function fetchUserData(force = false) {
    if (!user.value) return null
    if (loaded.value && !force) return userData.value
    if (loading.value) return userData.value

    loading.value = true
    try {
      userData.value = await api.show()
      loaded.value = true
    } catch (e) {
      console.error('Failed to fetch user data', e)
    } finally {
      loading.value = false
    }
    return userData.value
  }

  /**
   * Сохранение настроек и данных профиля
   */
  async function saveUserData(payload: UserDataPayload) {
    loading.value = true
    try {
      const updated = await api.save(payload)
      userData.value = updated

      // Синхронизируем Sanctum (если обновился direction, он подтянется в useAuth)
      await refreshIdentity()

      return updated
    } finally {
      loading.value = false
    }
  }

  /**
   * Хелпер для обновления только куска settings (например, ink)
   */
  async function updateInkSettings(inkData: Record<string, any>) {
    if (!userData.value) return
    const payload = {
      settings: {
        ...userData.value.settings,
        ink: {
          ...(userData.value.settings?.ink || {}),
          ...inkData
        }
      }
    }
    return await saveUserData(payload)
  }

  return {
    user,
    userData,
    loading,
    loaded,
    fetchUserData,
    saveUserData,
    updateInkSettings,
  }
}
