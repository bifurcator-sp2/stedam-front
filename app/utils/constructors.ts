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
  params?: Record<string, any>
  description?: string
  required?: boolean
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
    const overrideRaw = lessonRaw !== undefined ? lessonRaw : blockRaw

    if (Array.isArray(node.children) && node.children.length > 0) {
      const result: any = { ...node }
      result.children = mergeFlat(
        node.children,
        isPlainObject(blockRaw) ? blockRaw : undefined,
        isPlainObject(lessonRaw) ? lessonRaw : undefined,
      )

      if (overrideRaw !== undefined) {
        if (!isPlainObject(overrideRaw)) {
          result.default = overrideRaw
        } else {
          if (overrideRaw.default !== undefined) {
            result.default = overrideRaw.default
          }
          if (overrideRaw.public !== undefined) {
            result.public = overrideRaw.public
          }
        }
      }
      return result
    }

    let defaultVal = node.default
    let publicVal = node.public

    if (overrideRaw !== undefined) {
      if (!isPlainObject(overrideRaw)) {
        defaultVal = overrideRaw
      } else {
        if (overrideRaw.default !== undefined) defaultVal = overrideRaw.default
        if (overrideRaw.public !== undefined) publicVal = overrideRaw.public
      }
    }

    return {
      ...node,
      default: defaultVal,
      public: publicVal,
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

    if (Array.isArray(node.children) && node.children.length > 0) {
      const resultNode: any = {}
      let hasChanges = false

      const nested = unmergeFlat(
        node.children,
        typeNode.children ?? [],
        isPlainObject(parentRaw) ? parentRaw : undefined,
      )
      if (Object.keys(nested).length > 0) {
        Object.assign(resultNode, nested)
        hasChanges = true
      }

      const parentEffective = isPlainObject(parentRaw) && parentRaw.default !== undefined ? parentRaw.default : typeNode.default
      if (node.default !== parentEffective) {
        resultNode.default = node.default
        hasChanges = true
      }

      if (node.public !== typeNode.public) {
        resultNode.public = node.public
        hasChanges = true
      }

      if (hasChanges) {
        result[node.key] = resultNode
      }
    } else {
      const parentDefault = isPlainObject(parentRaw)
        ? (parentRaw.default !== undefined ? parentRaw.default : typeNode.default)
        : (parentRaw !== undefined ? parentRaw : typeNode.default)

      const isDefaultChanged = node.default !== parentDefault
      const isPublicChanged = node.public !== typeNode.public

      if (isDefaultChanged || isPublicChanged) {
        if (isDefaultChanged && !isPublicChanged) {
          result[node.key] = node.default
        } else {
          result[node.key] = {
            ...(isDefaultChanged ? { default: node.default } : {}),
            ...(isPublicChanged ? { public: node.public } : {})
          }
        }
      }
    }
  }

  return result
}

// ==================== Обогащение настроек схемными метаданными ====================

/** Не-boolean флаг трактуется как "не задан" (панель проверяет public === true). */
function normalizeBool(value: unknown): boolean | undefined {
  return value === true || value === false ? value : undefined
}

/** Ключи, которые берём из схемы без изменений. */
const SCHEMA_META_KEYS = ['label', 'type', 'purpose', 'params', 'description', 'required'] as const

/**
 * Дополняет дерево настроек урока метаданными из схемы (label/type/params/...).
 * Значения (default/public) остаются как в настройках урока, схема их не перетирает.
 */
export function enrichSettingsWithSchema(
  rawSettings: SettingNode | null | undefined,
  schema: SettingNode | null | undefined,
): SettingNode | null {
  if (!isPlainObject(rawSettings)) return null
  return mergeSchemaNode(rawSettings, isPlainObject(schema) ? schema : undefined)
}

function mergeSchemaNode(raw: SettingNode, schema: SettingNode | undefined): SettingNode {
  const result: SettingNode = { ...raw }

  if (schema) {
    for (const field of SCHEMA_META_KEYS) {
      const value = schema[field]
      if (value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)) {
        (result as any)[field] = value
      }
    }

    const purpose = schema.params && typeof schema.params.purpose === 'string' ? schema.params.purpose : undefined
    if (purpose) result.purpose = purpose

    // Узлы-контейнеры (type 'array'/'object') — просто группы настроек
    if (schema.type === 'array' || schema.type === 'object') {
      delete result.type
    }

    const schemaPublic = normalizeBool(schema.public)
    if (schemaPublic !== undefined) result.public = schemaPublic
  }

  const publicValue = normalizeBool(raw.public)
  if (publicValue !== undefined) result.public = publicValue

  if (Array.isArray(raw.children) && raw.children.length > 0) {
    result.children = raw.children.map((child) => {
      const schemaChild = schema?.children?.find((c) => c.key === child.key)
      return mergeSchemaNode(child, schemaChild)
    })
  }

  return result
}

// ==================== Очистка настроек перед сохранением ====================

/** Убирает добавленные клиентом схемные метаданные (label/type/params/...), чтобы не менять формат сохранения. */
export function stripSchemaMeta(node: SettingNode | null | undefined): SettingNode | null {
  if (!isPlainObject(node)) return null

  const copy: SettingNode = { ...node }
  for (const field of SCHEMA_META_KEYS) delete (copy as any)[field]
  if (Array.isArray(node.children) && node.children.length > 0) {
    copy.children = node.children.map(child => stripSchemaMeta(child) as SettingNode)
  }
  return copy
}

// ==================== Public-настройки ====================

export interface PublicSettingRef {
  item: SettingNode
  path: number[]
  keyPath: string
}

export function collectPublicSettingsWithPaths(
  nodes: SettingNode[] | null | undefined,
  basePath: number[] = [],
  baseKeyPath: string = '',
): PublicSettingRef[] {
  if (!Array.isArray(nodes)) return []

  const result: PublicSettingRef[] = []

  nodes.forEach((node, index) => {
    const path = [...basePath, index]
    const keyPath = baseKeyPath ? `${baseKeyPath}.${node.key}` : node.key

    if (node.public === true) {
      result.push({ item: node, path, keyPath })
    }

    if (Array.isArray(node.children) && node.children.length > 0) {
      result.push(...collectPublicSettingsWithPaths(node.children, path, keyPath))
    }
  })

  return result
}

export function findNodeAtPath(
  nodes: SettingNode[] | null | undefined,
  path: number[],
): SettingNode | null {
  if (!Array.isArray(nodes) || path.length === 0) return null

  const [head, ...rest] = path as [number, ...number[]]
  const target = nodes[head]
  if (!target) return null
  if (rest.length === 0) return target

  return findNodeAtPath(target.children, rest)
}

export function replaceNodeAtPath(
  nodes: SettingNode[],
  path: number[],
  replacer: (node: SettingNode) => SettingNode,
): SettingNode[] {
  if (path.length === 0) return nodes

  const [head, ...rest] = path as [number, ...number[]]
  const target = nodes[head]
  if (target === undefined) return nodes

  const copy = nodes.slice()

  if (rest.length === 0) {
    copy[head] = replacer(target)
    return copy
  }

  const childArray = target.children
  if (!Array.isArray(childArray)) return nodes

  copy[head] = {
    ...target,
    children: replaceNodeAtPath(childArray, rest, replacer),
  }

  return copy
}

// ==================== Резолв компонента блока по code ====================

const blockModules = import.meta.glob(
  '~/components/Constructor/Components/*.vue',
)

const componentCache: Record<string, Component> = {}

function normalizeCode(code: string): string {
  return code.trim().toLowerCase()
}

function findModulePath(code: string): string | null {
  const normalized = normalizeCode(code)
  const suffix = `/${normalized}.vue`

  for (const path of Object.keys(blockModules)) {
    if (path.toLowerCase().endsWith(suffix)) {
      return path
    }
  }

  return null
}

export function resolveBlockComponent(code: string | null | undefined): Component | null {
  if (!code || typeof code !== 'string') return null

  const key = normalizeCode(code)

  if (componentCache[key]) {
    return componentCache[key]
  }

  const path = findModulePath(key)
  if (!path) return null

  const loader = blockModules[path] as () => Promise<any>
  const asyncComponent = defineAsyncComponent({
    loader,
    delay: 0,
    timeout: 10000,
  })

  componentCache[key] = asyncComponent
  return asyncComponent
}

export function hasBlockComponent(code: string | null | undefined): boolean {
  return resolveBlockComponent(code) !== null
}
