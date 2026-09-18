import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { categoryInputSchema, categoryListSchema, categorySchema, type Category } from "@ims/contracts";
import { errorMessage, RequestError, requestJson } from "./catalog-api";
import { ErrorNotice, Pagination } from "./catalog-components";
import { useResource } from "./use-resource";
import { useAuth } from "./Auth";

export function CategoriesPage() {
  const canEdit = useAuth().user?.role === "ADMIN";
  const [params, setParams] = useSearchParams();
  const categories = useResource(`/api/categories?${params}`, categoryListSchema);
  const [editing, setEditing] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = categoryInputSchema.safeParse({ name: String(new FormData(form).get("name") ?? "") });
    if (!parsed.success) { setError("Enter a category name of 1–120 characters."); input.current?.focus(); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await requestJson(editing ? `/api/categories/${editing.id}` : "/api/categories", categorySchema, { method: editing ? "PUT" : "POST", body: JSON.stringify(parsed.data) });
      setNotice(`${saved.name} ${editing ? "updated" : "created"}.`);
      setEditing(null); form.reset(); categories.reload();
    } catch (problem) {
      setError(problem instanceof RequestError ? problem.fields.name ?? problem.message : errorMessage(problem));
    } finally { setBusy(false); }
  }

  return <>
    <section className="page-heading"><div><p className="eyebrow">CATALOG</p><h1>Categories</h1><p>Organize products into groups that make sense for your business.</p></div></section>
    {notice && <p className="success-notice" role="status">{notice}</p>}
    <div className={canEdit ? "category-layout" : ""}>
      <section className="catalog-panel" aria-label="Categories">
        <div className="table-caption"><h2>Product categories {categories.state.phase === "ready" && <span className="count-badge">{categories.state.data.total}</span>}</h2></div>
        {categories.state.phase === "loading" && <p className="empty-state" role="status">Loading categories…</p>}
        {categories.state.phase === "error" && <ErrorNotice message={categories.state.message} retry={categories.reload} />}
        {categories.state.phase === "ready" && <>
          {categories.state.data.items.length === 0 ? <p className="empty-state">No categories on this page.</p> : <ul className="category-list">{categories.state.data.items.map((category) => <li key={category.id}><span>{category.name}</span>{canEdit && <button className="text-button" disabled={busy} aria-label={`Edit ${category.name}`} onClick={() => { setError(""); setEditing(category); }}>Edit</button>}</li>)}</ul>}
          <Pagination {...categories.state.data} changePage={(page) => setParams({ page: String(page) })} />
        </>}
      </section>
      {canEdit && <form className="catalog-panel category-form" key={editing?.id ?? "new"} onSubmit={(event) => { void submit(event); }} noValidate>
        <h2>{editing ? "Rename category" : "Add a category"}</h2><p>Names update everywhere this category is used.</p>
        <fieldset disabled={busy}>
          <label>Category name<input ref={input} name="name" maxLength={120} defaultValue={editing?.name ?? ""} aria-invalid={Boolean(error)} aria-describedby={error ? "category-error" : undefined} /></label>
          {error && <p className="field-error" id="category-error" role="alert">{error}</p>}
          <div className="form-actions"><button type="submit">{busy ? "Saving…" : editing ? "Save category" : "Create category"}</button>{editing && <button type="button" className="secondary" onClick={() => { setEditing(null); setError(""); }}>Cancel</button>}</div>
        </fieldset>
      </form>}
    </div>
  </>;
}
