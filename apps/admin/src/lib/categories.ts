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

/** Fetch the category tree. */
export function listCategories(): Promise<Category[]> {
  return apiClient.request<Category[]>('/categories');
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
