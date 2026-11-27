// app/plugins/browser-push.client.ts
//
// Триггер подписки «по входу» (см. docs/browser-push-spec.md §4.3):
// если пользователь авторизован и браузер уже разрешил уведомления —
// тихо (без запроса разрешения) обновляем/создаём push-подписку.
export default defineNuxtPlugin(() => {
  const { user } = useSanctumAuth()
  const { syncOnLogin, refreshState } = useBrowserPush()

  if (user.value) {
    refreshState()
      .then(() => syncOnLogin())
      .catch(() => {})
  }
})
