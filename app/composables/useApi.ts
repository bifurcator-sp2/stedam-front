// app/composables/useApi.ts

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions<B = any> {
  body?: B
  headers?: Record<string, string>
  credentials?: RequestCredentials
  params?: Record<string, any>
  signal?: AbortSignal
  /** Отключить глобальный тост об ошибке. */
  silent?: boolean
}

const DEFAULT_HEADERS: Record<string, string> = {
  Accept: 'application/json',
}

const DEFAULT_CREDENTIALS: RequestCredentials = 'include'

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
  405: { title: 'Метод не разрешён', description: 'Этот HTTP-метод не поддерживается', color: 'error' },
  408: { title: 'Тайм-аут', description: 'Сервер не ответил вовремя', color: 'warning' },
  409: { title: 'Конфликт', description: 'Данные конфликтуют с текущим состоянием', color: 'error' },
  410: { title: 'Удалено', description: 'Ресурс больше не доступен', color: 'warning' },
  413: { title: 'Слишком большой запрос', description: 'Размер данных превышает допустимый', color: 'error' },
  415: { title: 'Неподдерживаемый тип', description: 'Формат данных не поддерживается', color: 'error' },
  422: { title: 'Ошибка валидации', description: 'Проверьте правильность заполнения полей', color: 'warning' },
  423: { title: 'Заблокировано', description: 'Ресурс заблокирован', color: 'warning' },
  429: { title: 'Слишком много запросов', description: 'Попробуйте позже', color: 'warning' },
  500: { title: 'Ошибка сервера', description: 'Что-то пошло не так', color: 'error' },
  501: { title: 'Не реализовано', description: 'Функция ещё не реализована', color: 'error' },
  502: { title: 'Плохой шлюз', description: 'Сервер получил неверный ответ', color: 'error' },
  503: { title: 'Сервис недоступен', description: 'Сервер временно не работает', color: 'warning' },
  504: { title: 'Тайм-аут шлюза', description: 'Сервер не дождался ответа', color: 'warning' },
}

function getErrorMeta(status: number | undefined): ErrorMeta {
  if (status && HTTP_ERRORS[status]) {
    return HTTP_ERRORS[status]
  }

  return {
    title: 'Ошибка',
    description: 'Произошла неизвестная ошибка',
    color: 'error',
  }
}

// ============================================================
// useApi
// ============================================================

export const useApi = () => {
  const config = useRuntimeConfig()
  const baseURL = config.public.apiBase
  const toast = useToast()

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

    const isFormData =
      typeof FormData !== 'undefined' && body instanceof FormData

    const finalHeaders: Record<string, string> = {
      ...DEFAULT_HEADERS,
      ...headers,
    }

    if (isFormData) {
      delete finalHeaders['Content-Type']
    }

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
      if (!silent) {
        showErrorToast(error)
      }
      throw error
    }
  }

  /**
   * Показывает тост об ошибке.
   * Если бэк вернул свой message — используем его как description.
   */
  function showErrorToast(error: any) {
    const status: number | undefined = error?.status ?? error?.response?.status

    const meta = getErrorMeta(status)

    // Сообщение от бэка (Laravel `message` в JSON, или текст от Nuxt)
    const backendMessage =
      error?.data?.message ??
      error?.data?.error ??
      error?.message ??
      null

    // Ошибки валидации (Laravel 422) — массив полей
    const validationErrors =
      error?.data?.errors && typeof error.data.errors === 'object'
        ? Object.values(error.data.errors).flat().filter(Boolean)
        : null

    const description =
      validationErrors && validationErrors.length
        ? String(validationErrors[0])
        : backendMessage || meta.description

    toast.add({
      title: meta.title,
      description,
      color: meta.color,
      icon:
        meta.color === 'error'
          ? 'i-lucide-circle-x'
          : 'i-lucide-triangle-alert',
    })
  }

  function get<T = any>(url: string, options: Omit<RequestOptions, 'body'> = {}) {
    return request<T>('GET', url, options)
  }

  function post<T = any, B = any>(
    url: string,
    body?: B,
    options: Omit<RequestOptions<B>, 'body'> = {},
  ) {
    return request<T, B>('POST', url, { ...options, body })
  }

  function put<T = any, B = any>(
    url: string,
    body?: B,
    options: Omit<RequestOptions<B>, 'body'> = {},
  ) {
    return request<T, B>('PUT', url, { ...options, body })
  }

  function patch<T = any, B = any>(
    url: string,
    body?: B,
    options: Omit<RequestOptions<B>, 'body'> = {},
  ) {
    return request<T, B>('PATCH', url, { ...options, body })
  }

  function del<T = any, B = any>(url: string, options: RequestOptions<B> = {}) {
    return request<T, B>('DELETE', url, options)
  }

  return { request, get, post, put, patch, delete: del }
}
