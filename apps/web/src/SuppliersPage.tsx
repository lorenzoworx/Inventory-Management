import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { supplierInputSchema, supplierListSchema, supplierSchema, type Supplier } from "@ims/contracts";
import { useAuth } from "./Auth";
import { requestJson, errorMessage } from "./catalog-api";
import { ErrorNotice, Pagination } from "./catalog-components";
import { useResource } from "./use-resource";

export function SuppliersPage() {
  const canEdit = useAuth().user?.role === "ADMIN";
  const [params, setParams] = useSearchParams();
  const suppliers = useResource(`/api/suppliers?${params}`, supplierListSchema);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const parsed = supplierInputSchema.safeParse({ name: values.get("name"), email: String(values.get("email") ?? "").trim() || null, phone: String(values.get("phone") ?? "").trim() || null, address: String(values.get("address") ?? "").trim() || null });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the supplier details."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await requestJson(editing ? `/api/suppliers/${editing.id}` : "/api/suppliers", supplierSchema, { method: editing ? "PUT" : "POST", body: JSON.stringify(parsed.data) });
      setNotice(`${saved.name} saved.`); setEditing(null); form.reset(); suppliers.reload();
    } catch (problem) { setError(errorMessage(problem)); } finally { setBusy(false); }
  }
  async function toggle(supplier: Supplier) {
    setBusy(true); setError(""); setNotice("");
    try {
      await requestJson(`/api/suppliers/${supplier.id}/status`, supplierSchema, { method: "PATCH", body: JSON.stringify({ isActive: !supplier.isActive }) });
      setNotice(`${supplier.name} ${supplier.isActive ? "deactivated" : "reactivated"}.`); suppliers.reload();
    } catch (problem) { setError(errorMessage(problem)); } finally { setBusy(false); }
  }
  return <>
    <section className="page-heading"><div><p className="eyebrow">PURCHASING</p><h1>Suppliers</h1><p>Shared contacts for stock purchases across your locations.</p></div></section>
    {notice && <p role="status" className="success-notice">{notice}</p>}{error && <ErrorNotice message={error} />}
    <div className={canEdit ? "category-layout" : ""}>
      <section className="catalog-panel" aria-label="Suppliers">
        <form className="filters" key={params.toString()} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setParams({ q: String(data.get("q") ?? ""), status: String(data.get("status") ?? "active") }); }}>
          <label className="search-field">Search suppliers<input type="search" name="q" maxLength={100} defaultValue={params.get("q") ?? ""} /></label>
          <label><span id="supplier-status-label">Status</span><select aria-labelledby="supplier-status-label" name="status" defaultValue={params.get("status") ?? "active"}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All suppliers</option></select></label><button>Search</button>
        </form>
        {suppliers.state.phase === "loading" && <p role="status" className="empty-state">Loading suppliers…</p>}
        {suppliers.state.phase === "error" && <ErrorNotice message={suppliers.state.message} retry={suppliers.reload} />}
        {suppliers.state.phase === "ready" && <>
          {suppliers.state.data.items.length === 0 && <p className="empty-state">No matching suppliers.</p>}
          <ul className="category-list">{suppliers.state.data.items.map((supplier) => <li key={supplier.id}><div><strong>{supplier.name}</strong><span className="product-detail">{supplier.email ?? "No email"}{supplier.phone && ` · ${supplier.phone}`}</span><span className="product-detail">{supplier.address}</span>{!supplier.isActive && <span className="product-detail">Inactive</span>}</div>{canEdit && <div className="row-actions"><button className="text-button" disabled={busy} aria-label={`Edit ${supplier.name}`} onClick={() => { setEditing(supplier); setError(""); }}>Edit</button><button className="text-button" disabled={busy} aria-label={`${supplier.isActive ? "Deactivate" : "Reactivate"} ${supplier.name}`} onClick={() => { void toggle(supplier); }}>{supplier.isActive ? "Deactivate" : "Reactivate"}</button></div>}</li>)}</ul>
          <Pagination {...suppliers.state.data} changePage={(page) => { const next = new URLSearchParams(params); next.set("page", String(page)); setParams(next); }} />
        </>}
      </section>
      {canEdit && <form className="catalog-panel category-form supplier-form" key={editing?.id ?? "new"} onSubmit={(event) => { void save(event); }} noValidate>
        <h2>{editing ? "Edit supplier" : "Add a supplier"}</h2><p>Deactivation prevents new orders while preserving purchase history.</p>
        <fieldset disabled={busy}>
          <label>Supplier name<input name="name" maxLength={120} defaultValue={editing?.name ?? ""} /></label>
          <label>Email (optional)<input name="email" type="email" maxLength={254} defaultValue={editing?.email ?? ""} /></label>
          <label>Phone (optional)<input name="phone" type="tel" maxLength={40} defaultValue={editing?.phone ?? ""} /></label>
          <label>Address (optional)<textarea name="address" rows={3} maxLength={500} defaultValue={editing?.address ?? ""} /></label>
          <div className="form-actions"><button>{busy ? "Saving…" : editing ? "Save supplier" : "Create supplier"}</button>{editing && <button type="button" className="secondary" onClick={() => { setEditing(null); setError(""); }}>Cancel</button>}</div>
        </fieldset>
      </form>}
    </div>
  </>;
}
