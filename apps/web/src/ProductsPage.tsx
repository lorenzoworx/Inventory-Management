import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { productInputSchema, productListSchema, productSchema, type Product } from "@ims/contracts";
import { errorMessage, RequestError, requestJson } from "./catalog-api";
import { ErrorNotice, formatPrice, Pagination } from "./catalog-components";
import { useCategories, useResource } from "./use-resource";

export function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const products = useResource(`/api/products?${params}`, productListSchema);
  const categories = useCategories();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const result = products.state.phase === "ready" ? products.state.data : undefined;
  useEffect(() => {
    if (!result) return;
    const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
    if (result.page > lastPage) {
      const next = new URLSearchParams(params);
      next.set("page", String(lastPage));
      setParams(next, { replace: true });
    }
  }, [result, params, setParams]);

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of ["q", "categoryId", "status", "pageSize"]) {
      const value = String(values.get(key) ?? "").trim();
      if (value) next.set(key, value);
    }
    setNotice("");
    setParams(next);
  }

  async function setStatus(product: Product) {
    setBusy(product.id); setError(""); setNotice("");
    try {
      await requestJson(`/api/products/${product.id}/status`, productSchema, { method: "PATCH", body: JSON.stringify({ isActive: !product.isActive }) });
      setNotice(`${product.name} ${product.isActive ? "deactivated" : "reactivated"}.`);
      products.reload();
    } catch (problem) { setError(errorMessage(problem)); }
    finally { setBusy(null); }
  }

  return <>
    <section className="page-heading"><div><p className="eyebrow">CATALOG</p><h1>Products</h1><p>One catalog for every location. Keep your product details in order.</p></div><Link className="button-link" to="/products/new"><span aria-hidden="true">＋</span> Add product</Link></section>
    <section className="catalog-panel" aria-label="Product catalog">
      <form className="filters" onSubmit={filter} key={params.toString()}>
        <label className="search-field">Search products<input name="q" type="search" maxLength={100} defaultValue={params.get("q") ?? ""} placeholder="Name, SKU, or barcode" /></label>
        <label><span id="filter-category-label">Category</span><select aria-labelledby="filter-category-label" key={categories.state.phase} name="categoryId" defaultValue={params.get("categoryId") ?? ""} disabled={categories.state.phase !== "ready"}>
          <option value="">All categories</option>
          {categories.state.phase === "ready" && categories.state.data.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select></label>
        <label><span id="filter-status-label">Status</span><select aria-labelledby="filter-status-label" name="status" defaultValue={params.get("status") ?? "active"}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All statuses</option></select></label>
        <label><span id="filter-page-size-label">Per page</span><select aria-labelledby="filter-page-size-label" name="pageSize" defaultValue={params.get("pageSize") ?? "20"}><option>20</option><option>50</option><option>100</option></select></label>
        <button type="submit">Apply filters</button>
      </form>
      {categories.state.phase === "error" && <ErrorNotice message={`Categories: ${categories.state.message}`} retry={categories.reload} />}
      {error && <ErrorNotice message={error} />}
      {notice && <p className="success-notice" role="status">{notice}</p>}
      {products.state.phase === "loading" && <p className="empty-state" role="status">Loading products…</p>}
      {products.state.phase === "error" && <ErrorNotice message={products.state.message} retry={products.reload} />}
      {result && <>
        <div className="table-caption"><h2>{params.get("status") === "all" ? "All products" : params.get("status") === "inactive" ? "Inactive products" : "Active products"} <span className="count-badge">{result.total}</span></h2><span>Cost & selling prices in NGN</span></div>
        {result.items.length === 0 ? <div className="empty-state"><h2>No products found</h2><p>Try a different search or add a product to your catalog.</p><Link to="/products/new">Add your first matching product</Link></div> : <div className="table-scroll" role="region" aria-label="Products" tabIndex={0}><table className="product-table"><thead><tr><th scope="col">Product</th><th scope="col">Category</th><th scope="col" className="number">Cost price</th><th scope="col" className="number">Selling price</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {result.items.map((product) => <tr key={product.id}>
            <th scope="row"><Link to={`/products/${product.id}/edit`} className="product-name">{product.name}</Link><span className="product-detail">{product.sku} <span aria-hidden="true">·</span> {product.unit}</span></th>
            <td><span className="category-label">{product.categoryName}</span></td>
            <td className="number">{formatPrice(product.costPrice)}</td><td className="number selling-price">{formatPrice(product.sellPrice)}</td>
            <td><span className={`product-status ${product.isActive ? "active" : "inactive"}`}><span aria-hidden="true">●</span> {product.isActive ? "Active" : "Inactive"}</span></td>
            <td><div className="row-actions"><Link to={`/products/${product.id}/edit`} aria-label={`Edit ${product.name}`}>Edit</Link><button className="text-button" disabled={busy !== null} onClick={() => { void setStatus(product); }} aria-label={`${product.isActive ? "Deactivate" : "Reactivate"} ${product.name}`}>{busy === product.id ? "Saving…" : product.isActive ? "Deactivate" : "Reactivate"}</button></div></td>
          </tr>)}
        </tbody></table></div>}
        <Pagination {...result} changePage={(page) => { const next = new URLSearchParams(params); next.set("page", String(page)); setParams(next); }} />
      </>}
    </section>
    <p className="catalog-note">Product details are shared across locations. Each location keeps its own stock balance.</p>
  </>;
}

export function ProductEditor() {
  const { id } = useParams();
  return <>
    <section className="page-heading"><div><Link className="back-link" to="/products">← Products</Link><h1>{id ? "Edit product" : "Add product"}</h1><p>{id ? "Update the details shared across your locations." : "Start with the details that identify and price your product."}</p></div></section>
    {id ? <ExistingProduct key={id} id={id} /> : <ProductForm />}
  </>;
}

function ExistingProduct({ id }: { id: string }) {
  const product = useResource(`/api/products/${encodeURIComponent(id)}`, productSchema);
  if (product.state.phase === "loading") return <p role="status">Loading product…</p>;
  if (product.state.phase === "error") return <ErrorNotice message={product.state.message} retry={product.reload} />;
  return <ProductForm product={product.state.data} />;
}

function ProductForm({ product }: { product?: Product }) {
  const categories = useCategories();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const alert = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) alert.current?.focus(); }, [error, fields]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const input = {
      name: String(values.get("name") ?? ""), sku: String(values.get("sku") ?? ""),
      barcode: String(values.get("barcode") ?? "").trim() || null,
      unit: String(values.get("unit") ?? ""), categoryId: Number(values.get("categoryId")),
      costPrice: String(values.get("costPrice") ?? ""), sellPrice: String(values.get("sellPrice") ?? "")
    };
    const parsed = productInputSchema.safeParse(input);
    if (!parsed.success) {
      setFields(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])));
      setError("Check the highlighted fields."); return;
    }
    setBusy(true); setError(""); setFields({});
    try {
      const saved = await requestJson(product ? `/api/products/${product.id}` : "/api/products", productSchema, { method: product ? "PUT" : "POST", body: JSON.stringify(parsed.data) });
      navigate(`/products?q=${encodeURIComponent(saved.sku)}&status=all`);
    } catch (problem) {
      setError(errorMessage(problem));
      if (problem instanceof RequestError) setFields(problem.fields);
    } finally { setBusy(false); }
  }
  function fieldError(name: string) { return fields[name] ? <span className="field-error" id={`${name}-error`}>{fields[name]}</span> : null; }
  function validation(name: string) { return { "aria-labelledby": `${name}-label`, "aria-invalid": Boolean(fields[name]), "aria-describedby": fields[name] ? `${name}-error` : undefined }; }

  if (categories.state.phase === "loading") return <p role="status">Loading categories…</p>;
  if (categories.state.phase === "error") return <ErrorNotice message={categories.state.message} retry={categories.reload} />;
  if (categories.state.data.length === 0) return <div className="empty-state"><h2>Add a category first</h2><p>Every product belongs to a category.</p><Link to="/categories">Manage categories</Link></div>;

  return <div className="editor-layout"><form className="catalog-panel product-form" onSubmit={(event) => { void submit(event); }} noValidate>
    {error && <div ref={alert} tabIndex={-1}><ErrorNotice message={error} /></div>}
    <fieldset disabled={busy}><legend>Product details</legend><p className="form-description">All fields are required except barcode.</p>
      <div className="form-grid">
        <label className="full-width"><span id="name-label">Product name</span><input name="name" autoComplete="off" maxLength={120} defaultValue={product?.name} {...validation("name")} />{fieldError("name")}</label>
        <label><span id="sku-label">SKU</span><input name="sku" autoComplete="off" maxLength={64} defaultValue={product?.sku} {...validation("sku")} />{fieldError("sku")}</label>
        <label><span id="barcode-label">Barcode (optional)</span><input name="barcode" autoComplete="off" maxLength={64} defaultValue={product?.barcode ?? ""} {...validation("barcode")} />{fieldError("barcode")}</label>
        <label><span id="categoryId-label">Category</span><select name="categoryId" defaultValue={product?.categoryId ?? ""} {...validation("categoryId")}><option value="" disabled>Choose a category</option>{categories.state.data.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{fieldError("categoryId")}</label>
        <label><span id="unit-label">Unit</span><input name="unit" maxLength={32} defaultValue={product?.unit ?? "each"} placeholder="each, bag, carton…" {...validation("unit")} />{fieldError("unit")}</label>
      </div>
      <div className="form-section"><h2>Pricing</h2><p>Enter the price per unit in Nigerian naira.</p><div className="form-grid">
        <label><span id="costPrice-label">Cost price (NGN)</span><input name="costPrice" inputMode="decimal" placeholder="0.00" defaultValue={product?.costPrice} {...validation("costPrice")} />{fieldError("costPrice")}</label>
        <label><span id="sellPrice-label">Selling price (NGN)</span><input name="sellPrice" inputMode="decimal" placeholder="0.00" defaultValue={product?.sellPrice} {...validation("sellPrice")} />{fieldError("sellPrice")}</label>
      </div></div>
      <div className="form-actions"><button type="submit">{busy ? "Saving…" : product ? "Save changes" : "Create product"}</button><Link to="/products">Cancel</Link></div>
    </fieldset>
  </form><aside className="editor-note"><p className="eyebrow">A SHARED CATALOG</p><h2>One product.<br />Every location.</h2><p>Use a unique SKU to identify a product across your shops and warehouse.</p><p>Deactivating a product keeps its record available for reference. You can reactivate it from the product list.</p><Link to="/categories">Manage categories →</Link></aside></div>;
}
