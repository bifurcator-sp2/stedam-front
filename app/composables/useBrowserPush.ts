// app/composables/useBrowserPush.ts
//
// Клиентская часть браузерных push-уведомлений (Web Push / VAPID).
// Контракт бэкенда:
//   GET    /api/push/vapid-public-key  → { publicKey }
//   POST   /api/push/subscriptions     → создать/обновить подписку (auth)
//   DELETE /api/push/subscriptions     → удалить по endpoint (auth)
//
// Service Worker лежит в public/sw.js. Nuxt собирает приложение под baseURL
// '/app/' (nitro.output.publicDir = /home/stedam/public/app), поэтому файл
// реально доступен по '/app/sw.js' — регистрируем его со scope '/app/'.
// Push будет работать на всех страницах SPA (они все под '/app/').
const SW_URL = '/app/sw.js'
const SW_SCOPE = '/app/'

export type PushSupport = 'granted' | 'denied' | 'unsupported'

export interface BrowserPushState {
  /** Браузер вообще поддерживает Service Worker + Push API. */
  supported: boolean
  /** Текущее состояние разрешения браузера. */
  permission: NotificationPermission | 'unsupported'
  /** У пользователя есть активная push-подписка в этом браузере. */
  subscribed: boolean
}

/**
 * Заголовки для запросов к API из контекста, где нет Nuxt (Service Worker
 * переподписка, вызовы до старта приложения). Cookie-сессия Sanctum + CSRF.
 */
function readXsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return match ? decodeURIComponent(match[1]!) : null
}

function apiHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (json) headers['Content-Type'] = 'application/json'
  const xsrf = readXsrfToken()
  if (xsrf) headers['X-XSRF-TOKEN'] = xsrf
  return headers
}

/** base64url (VAPID public key) → Uint8Array для applicationServerKey. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i)
  return out
}

function isSupported(): boolean {
  return (
    typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
  )
}

/** Регистрирует (или находит уже зарегистрированный) Service Worker. */
async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_SCOPE)
  if (existing) return existing
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE })
  await navigator.serviceWorker.ready
  return reg
}

/** Отправляет текущую подписку браузера на бэкенд. */
async function postSubscription(sub: PushSubscription): Promise<void> {
  const res = await fetch('/api/push/subscriptions', {
    method: 'POST',
    credentials: 'include',
    headers: apiHeaders(true),
    body: JSON.stringify(sub.toJSON())
  })
  if (!res.ok) {
    throw new Error(`push subscribe failed: ${res.status}`)
  }
}

export const useBrowserPush = () => {
  const supported = useState<boolean>('push.supported', () => false)
  const permission = useState<NotificationPermission | 'unsupported'>(
    'push.permission',
    () => 'unsupported'
  )
  const subscribed = useState<boolean>('push.subscribed', () => false)

  /** Локальное (без запроса разрешения) обновление состояния. */
  async function refreshState(): Promise<BrowserPushState> {
    if (!isSupported()) {
      supported.value = false
      permission.value = 'unsupported'
      subscribed.value = false
      return { supported: false, permission: 'unsupported', subscribed: false }
    }

    supported.value = true
    permission.value = Notification.permission

    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE)
      const sub = await reg?.pushManager.getSubscription()
      subscribed.value = Boolean(sub)
    } catch {
      subscribed.value = false
    }

    return { supported: supported.value, permission: permission.value, subscribed: subscribed.value }
  }

  /**
   * Запрос разрешения, регистрация SW, подписка и отправка на бэкенд.
   * Вызывать только по user gesture (кнопка «Включить уведомления»).
   */
  async function enablePush(): Promise<PushSupport> {
    if (!isSupported()) return 'unsupported'

    const result = await Notification.requestPermission()
    permission.value = result
    if (result !== 'granted') return 'denied'

    const reg = await getRegistration()

    // Если подписка уже есть — просто переотправим её (например, сменился аккаунт).
    let sub = await reg.pushManager.getSubscription()

    if (!sub) {
      const res = await fetch('/api/push/vapid-public-key', {
        credentials: 'include',
        headers: apiHeaders()
      })
      const { publicKey } = (await res.json()) as { publicKey: string }

      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      })
    }

    await postSubscription(sub)
    subscribed.value = true
    return 'granted'
  }

  /**
   * Отписка на этом устройстве: удаляем подписку на бэкенде и в браузере.
   * Идемпотентно — если подписки нет, ничего не падает.
   */
  async function disablePush(): Promise<void> {
    if (!isSupported()) return

    const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE)
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) {
      subscribed.value = false
      return
    }

    const { endpoint } = sub
    await sub.unsubscribe()
    subscribed.value = false

    try {
      await fetch('/api/push/subscriptions', {
        method: 'DELETE',
        credentials: 'include',
        headers: apiHeaders(true),
        body: JSON.stringify({ endpoint })
      })
    } catch {
      // Подписка уже снята в браузере — ошибку бэкенда не считаем критичной.
    }
  }

  /**
   * Тихо подписаться/переподписаться, если разрешение уже выдано.
   * Используется при входе в систему (см. plugins/browser-push.client.ts).
   */
  async function syncOnLogin(): Promise<void> {
    if (!isSupported()) return
    if (Notification.permission !== 'granted') return

    const reg = await getRegistration()
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      // Подписка уже есть — перепривяжем её к текущему пользователю.
      await postSubscription(sub).catch(() => {})
      subscribed.value = true
      return
    }

    await enablePush().catch(() => {})
  }

  return {
    supported,
    permission,
    subscribed,
    refreshState,
    enablePush,
    disablePush,
    syncOnLogin
  }
}
