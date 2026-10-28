// app/plugins/profile.ts
export default defineNuxtPlugin(() => {
  const { user } = useAuth()
  const { fetchUserData, userData, loaded } = useProfile()

  if (import.meta.client) {
    // Если на момент загрузки клиента пользователь уже есть, но данные не загружены
    if (user.value && !loaded.value) {
      fetchUserData()
    }

    // Следим за изменением статуса авторизации (например, при логауте)
    watch(user, (newUser) => {
      if (newUser) {
        fetchUserData()
      } else {
        // Если разлогинились — чистим данные
        userData.value = null
        loaded.value = false
      }
    })
  }
})
