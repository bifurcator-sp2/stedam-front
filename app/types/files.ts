// types/files.ts

export interface TempFile {
  name: string
  url: string
  ratio?: string | null
}

export interface StoredImage {
  original: string
  original_url: string | null
  thumbnail: string | null
  thumbnail_url: string | null
  ratio: string | null
  order: number
  source: 'stored'
}

export interface StoredFile {
  name: string
  url: string | null
  order: number
  source: 'stored'
}

export interface FilesListResponse {
  temp: {
    images: TempFile[]
    files: TempFile[]
  }
  stored: {
    images: StoredImage[]
    files: StoredFile[]
  }
}
