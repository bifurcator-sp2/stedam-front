// app/composables/useApi.ts
import { getCurrentInstance } from 'vue'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions<B = any> {
  body?: B
  headers?: Record<string, string>
  credentials?: RequestCredentials
  params?: Record<string, any>
  signal?: AbortSignal
  silent?: boolean
  /** Принудительно обновить данные (игнорировать кэш) */
  refresh?: boolean
}

const DEFAULT_HEADERS: Record<string, string> = {
  Accept: 'application/json',
}

const DEFAULT_CREDENTIALS: RequestCredentials = 'include'

// ============================================================
// Impersonation (см. ImpersonateFromHeader на бэкенде)
// ============================================================
// Смотровая вкладка хранит session-токен в sessionStorage (на вкладку),
// все запросы шлют X-Impersonate-Token — middleware подменяет пользователя.
const IMPERSONATION_STORAGE_KEY = 'impersonation_session'
const IMPERSONATION_HEADER = 'X-Impersonate-Token'

function readImpersonationToken(): string | null {
  if (import.meta.server) return null
  try {
    return window.sessionStorage.getItem(IMPERSONATION_STORAGE_KEY) || null
  } catch {
    return null
  }
}

// ============================================================
// Справочник ошибок по HTTP-кодам
// ============================================================
interface ErrorMeta {
  title: string
  description: string
  color: 'error' | 'warning' | 'neutral'
}

const HTTP_ERRORS: Record<number, ErrorMeta> = {
  400: { title: 'Некорректный запрос', description: 'Сервер не понял запрос', color: 'error' },
  401: { title: 'Не авторизован', description: 'Войдите в систему заново', color: 'warning' },
  403: { title: 'Доступ запрещён', description: 'У вас нет прав на это действие', color: 'error' },
  404: { title: 'Не найдено', description: 'Запрашиваемый ресурс не существует', color: 'warning' },
  422: { title: 'Ошибка валидации', description: 'Проверьте правильность заполнения полей', color: 'warning' },
  500: { title: 'Ошибка сервера', description: 'Что-то пошло не так', color: 'error' },
}

function getErrorMeta(status: number | undefined): ErrorMeta {
  return HTTP_ERRORS[status || 0] || {
    title: 'Ошибка',
    description: 'Произошла неизвестная ошибка',
    color: 'error',
  }
}

// ============================================================
// Глобальный кэш запросов (вынесен за пределы функции)
// ============================================================
// Хранит выполняющиеся прямо сейчас запросы, чтобы не дублировать их
const pendingRequests = new Map<string, Promise<any>>()

// ============================================================
// useApi
// ============================================================
export const useApi = () => {
  const config = useRuntimeConfig()
  const baseURL = config.public.apiBase
  const toast = useToast()

  // Текущая локаль пользователя (i18n). Берём через nuxtApp, а не useI18n():
  // useApi вызывается и из плагинов/middleware, где useI18n() падает (E1005).
  const nuxtApp = useNuxtApp()
  function currentLocale(): string {
    return (nuxtApp.$i18n as any)?.locale?.value ?? 'ru'
  }

  // Используем useState для SSR-совместимого кэша данных
  const apiCache = useState<Record<string, any>>('api-get-cache', () => ({}))

  async function request<T = any, B = any>(
    method: HttpMethod,
    url: string,
    options: RequestOptions<B> = {},
  ): Promise<T> {
    const {
      body,
      headers = {},
      credentials = DEFAULT_CREDENTIALS,
      params,
      signal,
      silent = false,
    } = options

    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
    const finalHeaders = { ...DEFAULT_HEADERS, 'Accept-Language': currentLocale(), ...headers }
    if (isFormData) delete finalHeaders['Content-Type']

    // Смотровая вкладка: каждый запрос несёт токен подмены пользователя.
    const impersonationToken = readImpersonationToken()
    if (impersonationToken) finalHeaders[IMPERSONATION_HEADER] = impersonationToken

    try {
      return await $fetch<T>(url, {
        baseURL,
        method,
        body,
        params,
        signal,
        credentials,
        headers: finalHeaders,
      })
    } catch (error: any) {
      if (!silent) showErrorToast(error)
      throw error
    }
  }

  function showErrorToast(error: any) {
    const status: number | undefined = error?.status ?? error?.response?.status
    const meta = getErrorMeta(status)
    const backendMessage = error?.data?.message ?? error?.data?.error ?? error?.message ?? null
    const validationErrors = error?.data?.errors && typeof error.data.errors === 'object'
      ? Object.values(error.data.errors).flat().filter(Boolean)
      : null

    const description = validationErrors && validationErrors.length
      ? String(validationErrors[0])
      : backendMessage || meta.description

    toast.add({
      title: meta.title,
      description,
      color: meta.color,
      icon: meta.color === 'error' ? 'i-lucide-circle-x' : 'i-lucide-triangle-alert',
    })
  }

  function get<T = any>(url: string, options: Omit<RequestOptions, 'body'> = {}): Promise<T> {
    const hasParams = options.params && Object.keys(options.params).length > 0
    // Локаль входит в ключ: при смене языка кэш не отдаёт данные другого языка.
    const base = hasParams ? `${url}?${JSON.stringify(options.params)}` : url
    const key = `${currentLocale()}:${base}`

    // 1. Проверяем кэш данных (если не просят принудительно обновить)
    if (!options.refresh && apiCache.value[key] !== undefined) {
      return Promise.resolve(apiCache.value[key] as T)
    }

    // 2. Проверяем, не выполняется ли этот запрос прямо сейчас (Mutex)
    if (pendingRequests.has(key)) {
      return pendingRequests.get(key)!
    }

    // 3. Делаем запрос и сохраняем Promise в Mutex
    const promise = request<T>('GET', url, options)
      .then((res) => {
        // Сохраняем в кэш (для SSR и клиента)
        apiCache.value[key] = res
        pendingRequests.delete(key)
        return res
      })
      .catch((err) => {
        pendingRequests.delete(key)
        throw err
      })

    pendingRequests.set(key, promise)
    return promise
  }

  function post<T = any, B = any>(url: string, body?: B, options: Omit<RequestOptions<B>, 'body'> = {}) {
    return request<T, B>('POST', url, { ...options, body })
  }

  function put<T = any, B = any>(url: string, body?: B, options: Omit<RequestOptions<B>, 'body'> = {}) {
    return request<T, B>('PUT', url, { ...options, body })
  }

  function patch<T = any, B = any>(url: string, body?: B, options: Omit<RequestOptions<B>, 'body'> = {}) {
    return request<T, B>('PATCH', url, { ...options, body })
  }

  function del<T = any, B = any>(url: string, options: RequestOptions<B> = {}) {
    return request<T, B>('DELETE', url, options)
  }

  return { request, get, post, put, patch, delete: del }
}
