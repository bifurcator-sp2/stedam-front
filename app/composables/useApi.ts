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

    // Если тело — FormData, не ставим Content-Type:
    // браузер сам добавит multipart/form-data с boundary
    const isFormData =
      typeof FormData !== 'undefined' && body instanceof FormData

    const finalHeaders: Record<string, string> = {
      ...DEFAULT_HEADERS,
      ...headers,
    }

    if (isFormData) {
      delete finalHeaders['Content-Type']
    }

    return await $fetch<T>(url, {
      baseURL,
      method,
      body,
      params,
      signal,
      credentials,
      headers: finalHeaders,
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

  function del<T = any, B = any>(url: string, options: RequestOptions<B> = {}) {
    return request<T, B>('DELETE', url, options)
  }

  return { request, get, post, put, patch, delete: del }
}
