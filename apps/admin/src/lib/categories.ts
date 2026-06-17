import { apiClient } from './apiClient';

/** A category with nested children, as returned by GET /categories. */
export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  children?: Category[];
}

/** Flattened option for a category <select>. */
export interface CategoryOption {
  id: string;
  label: string;
}

/** Fields accepted when creating a category (mirrors the API CreateCategoryDto). */
export interface CreateCategoryInput {
  name: string;
  slug: string;
  parentId?: string;
}

/**
 * Fields accepted when updating a category. `parentId` is tri-state:
 * a string reparents, `null` detaches to a root, `undefined` leaves it
 * unchanged (mirrors the API UpdateCategoryDto).
 */
export interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  parentId?: string | null;
}

/** Fetch the category tree. */
export function listCategories(): Promise<Category[]> {
  return apiClient.request<Category[]>('/categories');
}

/** Create a category (ADMIN). parentId is omitted for a root category. */
export function createCategory(input: CreateCategoryInput): Promise<Category> {
  const body: Record<string, string> = {
    name: input.name,
    slug: input.slug,
  };
  if (input.parentId) body.parentId = input.parentId;
  return apiClient.request<Category>('/categories', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Update a category (ADMIN): rename, re-slug, or reparent (parentId tri-state). */
export function updateCategory(
  id: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.slug !== undefined) body.slug = input.slug;
  // Tri-state: include parentId only when set (string or explicit null).
  if (input.parentId !== undefined) body.parentId = input.parentId;
  return apiClient.request<Category>(`/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** Delete a category (ADMIN). The API blocks deletion while it's in use. */
export function deleteCategory(id: string): Promise<void> {
  return apiClient.request<void>(`/categories/${id}`, { method: 'DELETE' });
}

/** Flatten the tree depth-first, indenting labels by depth for the hierarchy. */
export function flattenCategories(
  categories: Category[],
  depth = 0,
): CategoryOption[] {
  return categories.flatMap((c) => [
    { id: c.id, label: `${'— '.repeat(depth)}${c.name}` },
    ...flattenCategories(c.children ?? [], depth + 1),
  ]);
}
