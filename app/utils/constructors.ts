// app/utils/constructors.ts
//
// Общие утилиты для конструкторов блоков и уроков.
//
// Здесь живут:
//   • работа с деревом настроек (SettingNode) — merge/unmerge
//   • резолв компонентов блоков по code (defineAsyncComponent)
//   • общие хелперы
//
// По мере развития сюда будут добавляться другие общие функции.

import { defineAsyncComponent, type Component } from 'vue'

// ==================== Типы ====================

/**
 * Узел дерева настроек.
 * Определяет структуру поля: тип, лейбл, допустимые значения, детей.
 */
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

// ==================== Общие хелперы ====================

/**
 * Проверка: значение — простой объект (не массив, не null).
 */
export function isPlainObject(v: unknown): v is Record<string, any> {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v)
  )
}

// ==================== Merge: значения → полное дерево ====================

/**
 * Собирает полное дерево настроек из трёх источников:
 *   1. type.default_settings — структура + дефолтные значения
 *   2. blockValues          — переопределения из библиотечного блока
 *   3. lessonValues         — переопределения из блока урока
 *
 * Приоритет значений: lesson → block → type.default.
 * Структура (key, type, label, allowed, children) — всегда из type.default_settings.
 *
 * Для блока в библиотеке: mergeFlat(type.default_settings, block.settings, undefined)
 * Для блока урока:        mergeFlat(type.default_settings, block.settings, lessonBlock.settings)
 */
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

    // Приоритет: lesson → block → default
    const overrideRaw = lessonRaw !== undefined ? lessonRaw : blockRaw

    // Группа — рекурсия
    if (Array.isArray(node.children) && node.children.length > 0) {
      return {
        ...node,
        children: mergeFlat(
          node.children,
          isPlainObject(blockRaw) ? blockRaw : undefined,
          isPlainObject(lessonRaw) ? lessonRaw : undefined,
        ),
      }
    }

    // Лист — подставляем значение
    return {
      ...node,
      default: overrideRaw !== undefined ? overrideRaw : node.default,
    }
  })
}

// ==================== Unmerge: полное дерево → переопределения ====================

/**
 * Сжимает полное дерево настроек в плоский объект переопределений.
 *
 * Правило: значение сохраняется, если оно ОТЛИЧАЕТСЯ ОТ ЭФФЕКТИВНОГО РОДИТЕЛЯ.
 * Эффективный родитель — это:
 *   • parentValues[key], если задано (для блока урока — Block.settings)
 *   • type.default (из схемы), иначе
 *
 * @param fullTree      — полное дерево после редактирования
 * @param typeSchema    — схема типа (для поиска default)
 * @param parentValues  — переопределения родителя (для LessonBlock — Block.settings).
 *                        Для Block.settings родителя нет — передавать undefined.
 */
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
    if (!typeNode) continue // узла нет в типе — не сохраняем

    const parentRaw = parent[node.key]

    // Группа — рекурсия
    if (Array.isArray(node.children) && node.children.length > 0) {
      const nested = unmergeFlat(
        node.children,
        typeNode.children ?? [],
        isPlainObject(parentRaw) ? parentRaw : undefined,
      )
      if (Object.keys(nested).length > 0) {
        result[node.key] = nested
      }
      continue
    }

    // Лист — эффективный родитель
    const parentEffective = parentRaw !== undefined
      ? parentRaw
      : typeNode.default

    if (node.default !== parentEffective) {
      result[node.key] = node.default
    }
  }

  return result
}

// ==================== Public-настройки ====================

/**
 * Ссылка на public-узел: сам узел + путь до него в дереве.
 * Путь — массив индексов от корня (например, [9, 0] = settings[9].children[0]).
 */
export interface PublicSettingRef {
  item: SettingNode
  path: number[]
}

/**
 * Рекурсивно собирает плоский список узлов с public === true.
 * Порядок — pre-order, как в исходном дереве.
 *
 * Контейнеры не отбрасываются: если узел помечен public, он попадёт в результат,
 * и в его детей тоже спускаемся — на случай, если там есть public-потомки.
 */
export function collectPublicSettingsWithPaths(
  nodes: SettingNode[] | null | undefined,
  basePath: number[] = [],
): PublicSettingRef[] {
  if (!Array.isArray(nodes)) return []

  const result: PublicSettingRef[] = []

  nodes.forEach((node, index) => {
    const path = [...basePath, index]

    if (node.public === true) {
      result.push({ item: node, path })
    }

    if (Array.isArray(node.children) && node.children.length > 0) {
      result.push(...collectPublicSettingsWithPaths(node.children, path))
    }
  })

  return result
}

/**
 * Иммутабельно заменяет узел по пути и возвращает новое дерево.
 * Путь — массив индексов от корня. Пустой путь — no-op.
 *
 * Промежуточные узлы копируются поверхностно (spread), чтобы не мутировать
 * исходное дерево. Если по пути встречается узел без children — возвращаем
 * исходный массив без изменений.
 */
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

  copy[head] = {
    ...target,
    children: replaceNodeAtPath(childArray, rest, replacer),
  }

  return copy
}

// ==================== Резолв компонента блока по code ====================

/**
 * Автоматическая карта всех компонентов блоков.
 * Vite сам найдёт все .vue в папке Components/.
 * Ленивая загрузка — defineAsyncComponent при первом обращении.
 */
const blockModules = import.meta.glob(
  '~/components/Constructor/Components/*.vue',
)

/**
 * Кэш резолвнутых компонентов.
 * Ключ — code в lowercase.
 */
const componentCache: Record<string, Component> = {}

/**
 * Преобразует code в нормализованный ключ (lowercase).
 */
function normalizeCode(code: string): string {
  return code.trim().toLowerCase()
}

/**
 * Находит путь к файлу компонента по code.
 * code = 'text_image' → найдёт '.../Components/text_image.vue'.
 */
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

/**
 * Возвращает Vue-компонент для блока по его code.
 * Использует defineAsyncComponent — ленивая загрузка.
 * Возвращает null, если компонент не найден.
 */
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

/**
 * Возвращает true, если компонент для code существует.
 */
export function hasBlockComponent(code: string | null | undefined): boolean {
  return resolveBlockComponent(code) !== null
}
