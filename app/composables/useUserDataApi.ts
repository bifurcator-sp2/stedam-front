// app/composables/useUserDataApi.ts

export interface UserData {
  id: number
  user_id: number
  first_name: string | null
  last_name: string | null
  middle_name: string | null
  full_name: string | null
  birth_year: number | null
  age: number | null
  gender: 'male' | 'female' | null
  country_id: number | null
  country: {
    id: number
    iso2: string
    iso3: string | null
    name: string
  } | null
  created_at: string
  updated_at: string
}

export interface UserDataPayload {
  avatar?: string | null,
  first_name?: string | null
  last_name?: string | null
  middle_name?: string | null
  birth_year?: number | null
  gender?: 'male' | 'female' | null
  country_id?: number | null
}

export interface Country {
  id: number
  iso2: string
  iso3: string | null
  name: string
}

export const useUserDataApi = () => {
  const config = useRuntimeConfig()
  const baseURL = config.public.apiBase

  async function show(): Promise<UserData | null> {
    try {
      return await $fetch<UserData>('/user-data', {
        baseURL,
        headers: { Accept: 'application/json' },
        credentials: 'include',
      })
    } catch (e: any) {
      if (e?.response?.status === 404 || e?.status === 404) return null
      throw e
    }
  }

  async function save(payload: UserDataPayload): Promise<UserData> {
    // PUT сам создаст, если профиля нет
    payload.country_id = payload.country_id.value;
    return await $fetch<UserData>('/user-data', {
      baseURL,
      method: 'PUT',
      body: payload,
      headers: { Accept: 'application/json' },
      credentials: 'include',
    })
  }

  async function destroy(): Promise<void> {
    await $fetch('/user-data', {
      baseURL,
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    })
  }

  // Справочник стран для селекта
  async function countries(): Promise<Country[]> {
    return await $fetch<Country[]>('/countries', {
      baseURL,
      headers: { Accept: 'application/json' },
      credentials: 'include',
    })
  }

  return { show, save, destroy, countries }
}
