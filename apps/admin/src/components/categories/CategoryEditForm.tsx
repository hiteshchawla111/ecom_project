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
  'w-full border border-line bg-surface px-3.5 py-2.5 text-sm text-content transition-colors focus:border-content focus:outline-none focus:ring-1 focus:ring-content';
const labelClass = 'text-[0.7rem] font-medium uppercase tracking-[0.14em] text-content-subtle';

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
      className="mb-2 mt-2 flex flex-col gap-4 border border-line bg-surface-muted/40 p-4 sm:flex-row sm:items-end"
      noValidate
    >
      {error && (
        <p role="alert" className="text-sm text-error-600 sm:order-last sm:w-full">
          {error}
        </p>
      )}
      <div className="flex flex-1 flex-col gap-2">
        <label htmlFor={nameId} className={labelClass}>
          Name
        </label>
        <input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <label htmlFor={slugId} className={labelClass}>
          Slug
        </label>
        <input
          id={slugId}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <label htmlFor={parentSelId} className={labelClass}>
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
          className="bg-content px-5 py-2.5 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-surface transition-colors duration-300 hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-line px-5 py-2.5 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-content transition-colors duration-300 hover:border-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
