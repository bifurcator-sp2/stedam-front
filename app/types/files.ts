// types/files.ts

export interface ImageItem {
  url: string
  thumbnail: string | null
  source: 'temp' | 'stored'
  title: string | null
}

export interface FileItem {
  url: string
  source: 'temp' | 'stored'
  title: string | null
}

export interface FilesListResponse {
  images: ImageItem[]
  files: FileItem[]
  temp: {
    images: ImageItem[]
    files: FileItem[]
  }
  stored: {
    images: ImageItem[]
    files: FileItem[]
  }
}
