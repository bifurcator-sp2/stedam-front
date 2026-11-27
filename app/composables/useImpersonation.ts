// app/composables/useImpersonation.ts
//
// «Просмотр от лица пользователя» (impersonation) — клиентская часть.
// Бэкенд: App\Http\Controllers\Api\ImpersonationController.
//
// Сценарий:
//   1. start(userId)   → POST /admin/impersonate/start { user_id }
//                        ← { token, accept_url, target }
//   2. window.open(accept_url) — новая вкладка на странице /impersonate?token=...
//   3. страница /impersonate делает accept(token) → POST /admin/impersonate/accept
//      ← { token: <session>, user: <target> } → кладём session в sessionStorage.
//   4. useApi читает session-токен и шлёт заголовок X-Impersonate-Token.
//
// session-токен живёт в sessionStorage — это «per-tab» хранилище, поэтому
// админская вкладка не становится смотровой, и наоборот.

export interface ImpersonationStartResponse {
  token: string
  accept_url: string
  target: { id: number | null; name: string | null; email: string | null } | null
  expires_in: number
}

export interface ImpersonationAcceptResponse {
  token: string
  header: string
  user: Record<string, unknown>
  actor: { id: number; name: string | null } | null
  read_only: boolean
  expires_in: number
}

// Держим в синхроне с useApi.ts.
const IMPERSONATION_STORAGE_KEY = 'impersonation_session'

function getSessionStorage(): Storage | null {
  if (import.meta.server) return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export const useImpersonation = () => {
  // База API + CSRF-cookie-сессия: вызываем «сырой» sanctum-клиент напрямую,
  // чтобы accept в новой вкладке не зависел от старта (кэш useApi и т.п.).
  const client = useSanctumClient()
  const { user, refreshIdentity } = useAuth()

  function getSessionToken(): string | null {
    return getSessionStorage()?.getItem(IMPERSONATION_STORAGE_KEY) || null
  }

  function setSessionToken(token: string): void {
    getSessionStorage()?.setItem(IMPERSONATION_STORAGE_KEY, token)
  }

  function clearSessionToken(): void {
    getSessionStorage()?.removeItem(IMPERSONATION_STORAGE_KEY)
  }

  /**
   * Открыть просмотр от лица пользователя в новой вкладке.
   * Возвращает false, если браузер заблокировал popup.
   */
  async function openAs(userId: number): Promise<boolean> {
    // 1. Handoff-токен — обычный админский запрос (cookie админа).
    const res = await client<ImpersonationStartResponse>('/api/admin/impersonate/start', {
      method: 'POST',
      body: { user_id: userId },
    })

    // 2. Новую вкладку открываем СИНХРОННО в обработчике клика — сразу после
    //    await браузер может посчитать window.open нежелательным popup'ом.
    const popup = window.open(res.accept_url, '_blank')
    return popup !== null
  }

  /**
   * Обменять handoff → session (вызывается на странице /impersonate).
   * После успеха подтягиваем идентичность target-а.
   */
  async function accept(handoffToken: string, options: { reload?: boolean } = {}): Promise<ImpersonationAcceptResponse> {
    const res = await client<ImpersonationAcceptResponse>('/api/admin/impersonate/accept', {
      method: 'POST',
      body: { token: handoffToken },
    })

    setSessionToken(res.token)

    if (options.reload !== false) {
      // Перезагружаемся, чтобы ВСЕ запросы вкладки уже шли с X-Impersonate-Token
      // (client.initialRequest стартует заново и поднимет target как /api/user).
      window.location.replace('/app/')
    } else {
      await refreshIdentity().catch(() => {})
    }

    return res
  }

  /**
   * Выйти из просмотра: гасим серверную сессию и снимаем токен вкладки.
   */
  async function stop(options: { reload?: boolean } = {}): Promise<void> {
    const token = getSessionToken()

    if (token) {
      // Сначала шлём stop, пока токен ещё в sessionStorage — useApi подхватит
      // заголовок X-Impersonate-Token автоматически.
      await client('/api/admin/impersonate/stop', { method: 'POST' }).catch(() => {})
    }

    clearSessionToken()

    if (options.reload !== false) {
      window.location.replace('/app/')
    } else {
      await refreshIdentity().catch(() => {})
    }
  }

  const isImpersonating = computed(() => Boolean(getSessionToken()))

  return {
    user,
    isImpersonating,
    getSessionToken,
    openAs,
    accept,
    stop,
  }
}
