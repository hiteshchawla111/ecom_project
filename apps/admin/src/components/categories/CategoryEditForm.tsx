import { useState, type FormEvent } from 'react';
import type { CategoryOption, UpdateCategoryInput } from '../../lib/categories';

interface EditableCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

interface CategoryEditFormProps {
  category: EditableCategory;
  parentOptions: CategoryOption[];
  onSubmit: (input: UpdateCategoryInput) => Promise<void>;
  onCancel: () => void;
}

const inputClass =
  'w-full rounded-md border border-line px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500';

/**
 * Inline edit form for a single category: rename, re-slug, reparent (or detach
 * to root). The category itself is excluded from the parent options to avoid
 * the obvious self-parent; the API still rejects deeper cycles (surfaced here).
 */
export function CategoryEditForm({
  category,
  parentOptions,
  onSubmit,
  onCancel,
}: CategoryEditFormProps) {
  const [name, setName] = useState(category.name);
  const [slug, setSlug] = useState(category.slug);
  const [parentId, setParentId] = useState(category.parentId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const options = parentOptions.filter((o) => o.id !== category.id);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !slug.trim()) {
      setError('Name and slug are required.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        slug: slug.trim(),
        parentId: parentId || null,
      });
    } catch {
      setError('Could not save the category. Check the slug and parent, then retry.');
    } finally {
      setSubmitting(false);
    }
  }

  const nameId = `edit-name-${category.id}`;
  const slugId = `edit-slug-${category.id}`;
  const parentSelId = `edit-parent-${category.id}`;

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 flex flex-col gap-3 rounded-md border border-line bg-surface-sunk p-3 sm:flex-row sm:items-end"
      noValidate
    >
      {error && (
        <p role="alert" className="text-sm text-error-500 sm:order-last sm:w-full">
          {error}
        </p>
      )}
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor={nameId} className="text-xs font-medium text-content-muted">
          Name
        </label>
        <input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor={slugId} className="text-xs font-medium text-content-muted">
          Slug
        </label>
        <input
          id={slugId}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <label
          htmlFor={parentSelId}
          className="text-xs font-medium text-content-muted"
        >
          Parent
        </label>
        <select
          id={parentSelId}
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className={inputClass}
        >
          <option value="">No parent (root)</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-line px-3 py-2 text-sm font-medium text-content transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
