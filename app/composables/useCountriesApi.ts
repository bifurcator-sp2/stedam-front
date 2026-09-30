// app/composables/useCountriesApi.ts

export interface Country {
  id: number
  iso2: string
  iso3: string | null
  phone_code: string | null
  name: string
  is_active: boolean
}

export interface CountryDetail extends Country {
  translations: Array<{ locale: string; name: string }>
}

export const useCountriesApi = () => {
  const config = useRuntimeConfig()
  const baseURL = config.public.apiBase

  /**
   * Список стран.
   * @param options.active — только активные (по умолчанию true)
   * @param options.search — поиск по названию
   */
  async function list(options: { active?: boolean; search?: string } = {}): Promise<Country[]> {
    return await $fetch<Country[]>('/countries', {
      baseURL,
      params: {
        active: options.active ?? true,
        ...(options.search ? { search: options.search } : {}),
      },
      headers: { Accept: 'application/json' },
      credentials: 'include',
    })
  }

  /**
   * Одна страна с переводами.
   */
  async function get(id: number): Promise<CountryDetail> {
    return await $fetch<CountryDetail>(`/countries/${id}`, {
      baseURL,
      headers: { Accept: 'application/json' },
      credentials: 'include',
    })
  }

  return { list, get }
}
