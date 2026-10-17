// app/utils/constructors.ts
import { defineAsyncComponent, type Component } from 'vue'

export interface SettingNode {
  key: string
  label?: string
  type?: string
  default?: any
  allowed?: any[]
  purpose?: string
  public?: boolean
  children?: SettingNode[]
}

export function isPlainObject(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// ==================== Merge ====================

export function mergeFlat(
  schema: SettingNode[] | undefined,
  blockValues?: Record<string, any> | null,
  lessonValues?: Record<string, any> | null,
): SettingNode[] {
  if (!Array.isArray(schema)) return []

  const block = isPlainObject(blockValues) ? blockValues : {}
  const lesson = isPlainObject(lessonValues) ? lessonValues : {}

  return schema.map((node) => {
    const blockRaw = block[node.key]
    const lessonRaw = lesson[node.key]

    // Группа или гибрид (image + children)
    if (Array.isArray(node.children) && node.children.length > 0) {
      let finalDefault = node.default
      let blockChildren = undefined
      let lessonChildren = undefined

      // Разбираем blockRaw
      if (Array.isArray(blockRaw)) {
        finalDefault = blockRaw
      } else if (isPlainObject(blockRaw)) {
        if ('default' in blockRaw) finalDefault = blockRaw.default
        blockChildren = blockRaw
      }

      // Разбираем lessonRaw (приоритетнее)
      if (Array.isArray(lessonRaw)) {
        finalDefault = lessonRaw
      } else if (isPlainObject(lessonRaw)) {
        if ('default' in lessonRaw) finalDefault = lessonRaw.default
        lessonChildren = lessonRaw
      }

      return {
        ...node,
        default: finalDefault,
        children: mergeFlat(node.children, blockChildren, lessonChildren),
      }
    }

    // Лист
    const overrideRaw = lessonRaw !== undefined ? lessonRaw : blockRaw
    return {
      ...node,
      default: overrideRaw !== undefined ? overrideRaw : node.default,
    }
  })
}

// ==================== Unmerge ====================

export function unmergeFlat(
  fullTree: SettingNode[] | undefined,
  typeSchema: SettingNode[] | undefined,
  parentValues?: Record<string, any> | null,
): Record<string, any> {
  if (!Array.isArray(fullTree)) return {}

  const schema = Array.isArray(typeSchema) ? typeSchema : []
  const parent = isPlainObject(parentValues) ? parentValues : {}

  const result: Record<string, any> = {}

  for (const node of fullTree) {
    const typeNode = schema.find((t) => t.key === node.key)
    if (!typeNode) continue

    const parentRaw = parent[node.key]

    // Группа или гибрид
    if (Array.isArray(node.children) && node.children.length > 0) {
      // Достаем родительский default (если есть)
      let parentDefault = typeNode.default
      if (Array.isArray(parentRaw)) {
        parentDefault = parentRaw
      } else if (isPlainObject(parentRaw) && 'default' in parentRaw) {
        parentDefault = parentRaw.default
      }

      const nested = unmergeFlat(node.children, typeNode.children ?? [], isPlainObject(parentRaw) ? parentRaw : undefined)

      // Сравниваем картинки (или другие дефолтные значения)
      const valueChanged = JSON.stringify(node.default ?? null) !== JSON.stringify(parentDefault ?? null)

      if (valueChanged || Object.keys(nested).length > 0) {
        result[node.key] = {
          ...(valueChanged ? { default: node.default } : {}),
          ...nested,
        }
      }
      continue
    }

    // Лист
    const parentEffective = parentRaw !== undefined ? parentRaw : typeNode.default
    if (node.default !== parentEffective) {
      result[node.key] = node.default
    }
  }

  return result
}

// ==================== Public-настройки ====================

export interface PublicSettingRef {
  item: SettingNode
  path: number[]
}

export function collectPublicSettingsWithPaths(
  nodes: SettingNode[] | null | undefined,
  basePath: number[] = [],
): PublicSettingRef[] {
  if (!Array.isArray(nodes)) return []

  const result: PublicSettingRef[] = []

  nodes.forEach((node, index) => {
    const path = [...basePath, index]
    if (node.public === true) result.push({ item: node, path })
    if (Array.isArray(node.children) && node.children.length > 0) {
      result.push(...collectPublicSettingsWithPaths(node.children, path))
    }
  })

  return result
}

export function replaceNodeAtPath(
  nodes: SettingNode[],
  path: number[],
  replacer: (node: SettingNode) => SettingNode,
): SettingNode[] {
  if (path.length === 0) return nodes
  const [head, ...rest] = path
  const target = nodes[head]
  if (target === undefined) return nodes
  const copy = nodes.slice()
  if (rest.length === 0) {
    copy[head] = replacer(target)
    return copy
  }
  const childArray = target.children
  if (!Array.isArray(childArray)) return nodes
  copy[head] = { ...target, children: replaceNodeAtPath(childArray, rest, replacer) }
  return copy
}

// ==================== Резолв компонента блока ====================

const blockModules = import.meta.glob('~/components/Constructor/Components/*.vue')
const componentCache: Record<string, Component> = {}

function normalizeCode(code: string): string {
  return code.trim().toLowerCase()
}

function findModulePath(code: string): string | null {
  const normalized = normalizeCode(code)
  const suffix = `/${normalized}.vue`
  for (const path of Object.keys(blockModules)) {
    if (path.toLowerCase().endsWith(suffix)) return path
  }
  return null
}

export function resolveBlockComponent(code: string | null | undefined): Component | null {
  if (!code || typeof code !== 'string') return null
  const key = normalizeCode(code)
  if (componentCache[key]) return componentCache[key]
  const path = findModulePath(key)
  if (!path) return null
  const loader = blockModules[path] as () => Promise<any>
  const asyncComponent = defineAsyncComponent({ loader, delay: 0, timeout: 10000 })
  componentCache[key] = asyncComponent
  return asyncComponent
}

export function hasBlockComponent(code: string | null | undefined): boolean {
  return resolveBlockComponent(code) !== null
}
