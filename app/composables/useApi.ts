// app/composables/useApi.ts

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions<B = any> {
  body?: B
  headers?: Record<string, string>
  credentials?: RequestCredentials
  params?: Record<string, any>
  signal?: AbortSignal
}

const DEFAULT_HEADERS: Record<string, string> = {
  Accept: 'application/json',
}

const DEFAULT_CREDENTIALS: RequestCredentials = 'include'

export const useApi = () => {
  const config = useRuntimeConfig()
  const baseURL = config.public.apiBase

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
    } = options

    return await $fetch<T>(url, {
      baseURL,
      method,
      body,
      params,
      signal,
      credentials,
      headers: {
        ...DEFAULT_HEADERS,
        ...headers,
      },
    })
  }

  function get<T = any>(url: string, options: Omit<RequestOptions, 'body'> = {}) {
    return request<T>('GET', url, options)
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

  function del<T = any>(url: string, options: Omit<RequestOptions, 'body'> = {}) {
    return request<T>('DELETE', url, options)
  }

  return { request, get, post, put, patch, delete: del }
}

/*
const api = useApi()

// GET без параметров
const userData = await api.get<UserData>('/user-data')

// GET с query-параметрами
const countries = await api.get<Country[]>('/countries', {
  params: { active: true, search: 'рос' },
})

// POST с телом
await api.post('/set-user-roles', { roles: ['student'] })

// PUT с телом
await api.put('/user-data', { first_name: 'Иван' })

// DELETE
await api.delete('/user-data')

// Переопределить credentials (например, публичный запрос без cookie)
await api.get('/public/roles', { credentials: 'omit' })

// Добавить кастомный заголовок
await api.post('/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
})
* */
