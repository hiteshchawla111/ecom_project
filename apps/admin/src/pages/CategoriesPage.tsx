import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  createCategory,
  deleteCategory,
  flattenCategories,
  listCategories,
  updateCategory,
  type Category,
  type CategoryOption,
  type UpdateCategoryInput,
} from '../lib/categories';
import { ApiError } from '../lib/types';
import { CategoryEditForm } from '../components/categories/CategoryEditForm';
import { useConfirm } from '../components/ui/confirm';

const inputClass =
  'w-full border border-line bg-surface px-3.5 py-2.5 text-sm text-content focus:border-content focus:outline-none focus:ring-1 focus:ring-content';

export function CategoriesPage() {
  const confirm = useConfirm();
  const [tree, setTree] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create-form state.
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [parentId, setParentId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setTree(await listCategories());
    } catch {
      setError('Could not load categories.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const data = await listCategories();
        if (!cancelled) setTree(data);
      } catch {
        if (!cancelled) setError('Could not load categories.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !slug.trim()) {
      setFormError('Name and slug are required.');
      return;
    }
    setSubmitting(true);
    try {
      await createCategory({
        name: name.trim(),
        slug: slug.trim(),
        parentId: parentId || undefined,
      });
      setName('');
      setSlug('');
      setParentId('');
      await reload();
    } catch (err) {
      setFormError(createErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(category: Category) {
    const ok = await confirm({
      title: 'Delete category',
      description: `Delete “${category.name}”? This can’t be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    setBusyId(category.id);
    try {
      await deleteCategory(category.id);
      await reload();
    } catch (err) {
      setError(deleteErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onEditSubmit(id: string, input: UpdateCategoryInput) {
    await updateCategory(id, input); // errors surface in the edit form
    setEditingId(null);
    await reload();
  }

  const parentOptions = flattenCategories(tree);

  return (
    <section className="flex flex-col gap-8">
      <header className="border-b border-line pb-6">
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-content-subtle">
          Catalog
        </span>
        <h2 className="font-serif text-3xl font-medium tracking-tight text-content">
          Categories
        </h2>
      </header>

      <form
        onSubmit={onCreate}
        className="flex flex-col gap-4 border border-line bg-surface p-5 sm:flex-row sm:items-end"
        noValidate
      >
        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor="cat-name" className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-content-subtle">
            Name
          </label>
          <input
            id="cat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor="cat-slug" className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-content-subtle">
            Slug
          </label>
          <input
            id="cat-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="lowercase-with-hyphens"
            className={inputClass}
          />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <label
            htmlFor="cat-parent"
            className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-content-subtle"
          >
            Parent (optional)
          </label>
          <select
            id="cat-parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className={inputClass}
          >
            <option value="">No parent (root)</option>
            {parentOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="bg-primary-600 px-6 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors duration-300 hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-50"
        >
          Add category
        </button>
      </form>

      {formError && (
        <p
          role="alert"
          className="max-w-2xl rounded-md bg-error-500/10 px-4 py-3 text-sm text-error-500"
        >
          {formError}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="max-w-2xl rounded-md bg-error-500/10 px-4 py-3 text-sm text-error-500"
        >
          {error}
        </p>
      )}

      {loading ? (
        <p role="status" aria-live="polite" className="text-content-muted">
          Loading…
        </p>
      ) : tree.length === 0 ? (
        <p className="text-content-muted">No categories yet.</p>
      ) : (
        <CategoryNodes
          categories={tree}
          busyId={busyId}
          editingId={editingId}
          parentOptions={parentOptions}
          onDelete={onDelete}
          onEditStart={(c) => setEditingId(c.id)}
          onEditCancel={() => setEditingId(null)}
          onEditSubmit={onEditSubmit}
        />
      )}
    </section>
  );
}

interface CategoryNodesProps {
  categories: Category[];
  busyId: string | null;
  editingId: string | null;
  parentOptions: CategoryOption[];
  onDelete: (c: Category) => void;
  onEditStart: (c: Category) => void;
  onEditCancel: () => void;
  onEditSubmit: (id: string, input: UpdateCategoryInput) => Promise<void>;
}

function CategoryNodes({
  categories,
  busyId,
  editingId,
  parentOptions,
  onDelete,
  onEditStart,
  onEditCancel,
  onEditSubmit,
}: CategoryNodesProps) {
  return (
    <ul className="flex flex-col gap-1">
      {categories.map((category) => (
        <li key={category.id}>
          <div className="flex items-center justify-between border-b border-line px-1 py-3 transition-colors hover:bg-surface-muted/50">
            <span className="text-content">
              <span className="font-medium">{category.name}</span>{' '}
              <span className="text-xs text-content-subtle">/{category.slug}</span>
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onEditStart(category)}
                className="border border-line px-3 py-1.5 text-[0.7rem] font-medium uppercase tracking-[0.1em] text-content transition-colors hover:border-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={busyId === category.id}
                onClick={() => onDelete(category)}
                className="border border-line px-3 py-1.5 text-[0.7rem] font-medium uppercase tracking-[0.1em] text-error-600 transition-colors hover:border-error-500 hover:bg-error-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-error-500 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
          {editingId === category.id && (
            <CategoryEditForm
              category={{
                id: category.id,
                name: category.name,
                slug: category.slug,
                parentId: category.parentId,
              }}
              parentOptions={parentOptions}
              onSubmit={(input) => onEditSubmit(category.id, input)}
              onCancel={onEditCancel}
            />
          )}
          {category.children && category.children.length > 0 && (
            <div className="ml-4 border-l border-line pl-2">
              <CategoryNodes
                categories={category.children}
                busyId={busyId}
                editingId={editingId}
                parentOptions={parentOptions}
                onDelete={onDelete}
                onEditStart={onEditStart}
                onEditCancel={onEditCancel}
                onEditSubmit={onEditSubmit}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Friendly message for create failures (duplicate slug, bad parent). */
function createErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return 'That slug is already taken. Choose another.';
    if (err.status === 400) {
      return 'Invalid input. Check the slug format and parent category.';
    }
  }
  return 'Could not create the category. Please try again.';
}

/** Friendly message for delete failures (in-use guard). */
function deleteErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) {
    return 'This category is in use — it still has subcategories or products. Move or remove them first.';
  }
  return 'Could not delete the category. Please try again.';
}
