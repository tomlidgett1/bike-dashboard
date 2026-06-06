import type { LightspeedCategory } from '@/lib/services/lightspeed/types'

export function normaliseCategoryLookup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s*>\s*/g, '/')
    .replace(/\/+/g, '/')
}

export function normaliseCategoryPathInput(value: string): string {
  return value.trim().replace(/\s*>\s*/g, '/').replace(/\/+/g, '/')
}

export function buildFullPathName(
  name: string,
  parentId: string | undefined,
  categoriesById: Map<string, LightspeedCategory>,
): string {
  const trimmedName = name.trim()
  if (!parentId || parentId === '0') {
    return trimmedName
  }

  const parent = categoriesById.get(parentId)
  if (!parent?.fullPathName) {
    return trimmedName
  }

  return `${parent.fullPathName}/${trimmedName}`
}

export function findCategoryByPath(
  categories: LightspeedCategory[],
  pathOrName: string,
): LightspeedCategory | undefined {
  const lookup = normaliseCategoryLookup(pathOrName)
  return categories.find((category) => {
    const path = normaliseCategoryLookup(category.fullPathName || category.name)
    const name = normaliseCategoryLookup(category.name)
    const leaf = normaliseCategoryLookup(
      (category.fullPathName || category.name).split('/').pop() || category.name,
    )
    return path === lookup || name === lookup || leaf === lookup
  })
}

export function parseCategoryPathInput(path: string): { name: string; parentPath: string | null } {
  const normalised = normaliseCategoryPathInput(path)
  const parts = normalised.split('/').filter(Boolean)
  if (parts.length <= 1) {
    return { name: parts[0] || '', parentPath: null }
  }
  return {
    name: parts[parts.length - 1],
    parentPath: parts.slice(0, -1).join('/'),
  }
}

export function resolveParentCategoryId(
  categories: LightspeedCategory[],
  parentCategoryId?: string | null,
  parentCategoryName?: string | null,
): string {
  const parentIdInput = parentCategoryId != null ? String(parentCategoryId).trim() : ''
  if (parentIdInput && /^\d+$/.test(parentIdInput)) {
    return parentIdInput
  }

  const parentNameInput = parentCategoryName != null ? String(parentCategoryName).trim() : ''
  if (parentNameInput) {
    const parent = findCategoryByPath(categories, parentNameInput)
    if (parent) return String(parent.categoryID)
  }

  return '0'
}

export interface ResolvedCategoryCreation {
  name: string
  path: string
  parentId: string
  create: boolean
  id: string | null
}

export function resolveCategoryCreationTarget(args: {
  categories: LightspeedCategory[]
  categoryId?: string | null
  categoryName?: string | null
  categoryPath?: string | null
  parentCategoryId?: string | null
  parentCategoryName?: string | null
}): { target?: ResolvedCategoryCreation; error?: string } {
  let categoryId = args.categoryId != null ? String(args.categoryId).trim() : ''
  let categoryName = args.categoryName != null ? String(args.categoryName).trim() : ''
  const categoryPath = args.categoryPath != null ? String(args.categoryPath).trim() : ''
  const byId = new Map(args.categories.map((category) => [String(category.categoryID), category]))

  if (categoryPath && !categoryName) {
    const parsed = parseCategoryPathInput(categoryPath)
    categoryName = parsed.name
  }

  if (categoryId && !/^\d+$/.test(categoryId)) {
    if (!categoryName && !categoryPath) categoryName = categoryId
    categoryId = ''
  }

  if (!categoryId && !categoryName && !categoryPath) {
    return { error: 'Provide category_id, category_name, or category_path.' }
  }

  if (categoryId) {
    const category = args.categories.find((row) => String(row.categoryID) === categoryId)
    if (category) {
      return {
        target: {
          id: categoryId,
          name: category.name,
          path: category.fullPathName || category.name,
          parentId: category.parentID ?? '0',
          create: false,
        },
      }
    }
    if (categoryName || categoryPath) {
      categoryId = ''
    } else {
      return { error: `Category id ${categoryId} was not found.` }
    }
  }

  const lookupValue = categoryPath || categoryName
  const existing = findCategoryByPath(args.categories, lookupValue)
  if (existing) {
    return {
      target: {
        id: String(existing.categoryID),
        name: existing.name,
        path: existing.fullPathName || existing.name,
        parentId: existing.parentID ?? '0',
        create: false,
      },
    }
  }

  const parsedPath = categoryPath ? parseCategoryPathInput(categoryPath) : null
  const leafName = (parsedPath?.name || categoryName).trim()
  if (!leafName) {
    return { error: 'Category name is required.' }
  }

  let parentId = resolveParentCategoryId(
    args.categories,
    args.parentCategoryId,
    args.parentCategoryName ?? parsedPath?.parentPath,
  )

  if (parentId !== '0' && !byId.has(parentId)) {
    const parentLookup = args.parentCategoryName ?? parsedPath?.parentPath
    if (parentLookup) {
      const parent = findCategoryByPath(args.categories, parentLookup)
      if (!parent) {
        return { error: `Parent category "${parentLookup}" was not found in Lightspeed.` }
      }
      parentId = String(parent.categoryID)
    } else {
      return { error: `Parent category id ${parentId} was not found.` }
    }
  }

  const path = buildFullPathName(leafName, parentId, byId)

  return {
    target: {
      id: null,
      name: leafName,
      path,
      parentId,
      create: true,
    },
  }
}
