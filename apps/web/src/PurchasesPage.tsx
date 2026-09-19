import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { productListSchema, purchaseInputSchema, purchaseListSchema, purchaseReceiptResultSchema, purchaseReceiptSchema, purchaseSchema, purchaseStatusSchema, storeListSchema, supplierListSchema, type Product, type PurchaseOrder } from "@ims/contracts";
import { useAuth } from "./Auth";
import { errorMessage, requestJson } from "./catalog-api";
import { ErrorNotice, formatPrice, Pagination } from "./catalog-components";
import { useResource } from "./use-resource";

const statusLabels = { DRAFT: "Draft", ORDERED: "Ordered", PARTIALLY_RECEIVED: "Partially received", RECEIVED: "Received", CANCELLED: "Cancelled" };
const date = new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium" });
function useCanManage() { const role = useAuth().user!.role; return role === "ADMIN" || role === "MANAGER"; }

export function PurchasesPage() {
  const canManage = useCanManage();
  const [params, setParams] = useSearchParams();
  const orders = useResource(`/api/purchase-orders?${params}`, purchaseListSchema);
  const stores = useResource("/api/stores?pageSize=100", storeListSchema);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const next = new URLSearchParams();
    for (const key of ["q", "status", "storeId"]) { const value = String(data.get(key) ?? "").trim(); if (value) next.set(key, value); }
    setParams(next);
  }
  return <>
    <section className="page-heading"><div><p className="eyebrow">PURCHASING</p><h1>Purchase orders</h1><p>Track what you ordered, what arrived, and what is still outstanding.</p></div>{canManage && <Link className="button-link" to="/purchases/new">New purchase order</Link>}</section>
    <section className="catalog-panel">
      <form className="filters" key={params.toString()} onSubmit={search}>
        <label className="search-field">Search orders<input type="search" name="q" maxLength={100} placeholder="Order number or supplier" defaultValue={params.get("q") ?? ""} /></label>
        <label><span id="purchase-location-filter">Location</span><select aria-labelledby="purchase-location-filter" name="storeId" defaultValue={params.get("storeId") ?? ""}><option value="">All accessible locations</option>{stores.state.phase === "ready" && stores.state.data.items.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
        <label><span id="purchase-status-filter">Status</span><select aria-labelledby="purchase-status-filter" name="status" defaultValue={params.get("status") ?? ""}><option value="">All statuses</option>{purchaseStatusSchema.options.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label><button>Apply filters</button>
      </form>
      {stores.state.phase === "error" && <ErrorNotice message={stores.state.message} retry={stores.reload} />}
      {orders.state.phase === "loading" && <p role="status" className="empty-state">Loading purchases…</p>}
      {orders.state.phase === "error" && <ErrorNotice message={orders.state.message} retry={orders.reload} />}
      {orders.state.phase === "ready" && <>
        {orders.state.data.items.length === 0 ? <div className="empty-state"><h2>No purchases found</h2><p>Create a draft order or change your filters.</p></div> : <div className="table-scroll" role="region" aria-label="Purchase orders" tabIndex={0}><table className="product-table"><thead><tr><th>Order</th><th>Supplier</th><th>Location</th><th>Status</th><th className="number">Total · NGN</th><th>Created · Lagos</th></tr></thead><tbody>{orders.state.data.items.map((order) => <tr key={order.id}><th scope="row"><Link className="product-name" to={`/purchases/${order.id}`}>{order.number}</Link></th><td>{order.supplierName}</td><td>{order.storeName}</td><td>{statusLabels[order.status]}</td><td className="number">{formatPrice(order.total)}</td><td>{date.format(new Date(order.createdAt))}</td></tr>)}</tbody></table></div>}
        <Pagination {...orders.state.data} changePage={(page) => { const next = new URLSearchParams(params); next.set("page", String(page)); setParams(next); }} />
      </>}
    </section>
  </>;
}

type DraftLine = { product: Product; quantity: string; cost: string };
export function NewPurchasePage() {
  const canManage = useCanManage();
  const navigate = useNavigate();
  const stores = useResource("/api/stores?pageSize=100", storeListSchema);
  const [supplierSearch, setSupplierSearch] = useState("");
  const suppliers = useResource(`/api/suppliers?pageSize=100&q=${encodeURIComponent(supplierSearch)}`, supplierListSchema);
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!canManage) return <section className="page-heading"><h1>Access restricted</h1><p>Your role cannot create purchase orders.</p></section>;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    const parsed = purchaseInputSchema.safeParse({ supplierId: Number(supplierId), storeId: Number(values.get("storeId")), notes: String(values.get("notes") ?? ""), lines: lines.map((line) => ({ productId: line.product.id, orderedQty: /^\d+$/.test(line.quantity) ? Number(line.quantity) : NaN, unitCost: line.cost })) });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the order details."); return; }
    setBusy(true); setError("");
    try { const order = await requestJson("/api/purchase-orders", purchaseSchema, { method: "POST", body: JSON.stringify(parsed.data) }); navigate(`/purchases/${order.id}`); }
    catch (problem) { setError(errorMessage(problem)); } finally { setBusy(false); }
  }
  function changeLine(productId: number, key: "quantity" | "cost", value: string) { setLines((previous) => previous.map((line) => line.product.id === productId ? { ...line, [key]: value } : line)); }
  return <>
    <section className="page-heading"><div><Link className="back-link" to="/purchases">← Purchase orders</Link><p className="eyebrow">PURCHASING</p><h1>New purchase order</h1><p>Create a draft, review its lines, then mark it as ordered.</p></div></section>
    {error && <ErrorNotice message={error} />}
    <form className="catalog-panel product-form" onSubmit={(event) => { void save(event); }} noValidate><fieldset disabled={busy}>
      <div className="form-grid">
        <label><span id="purchase-destination-label">Receiving location</span><select aria-labelledby="purchase-destination-label" name="storeId" defaultValue=""><option value="" disabled>Choose a location</option>{stores.state.phase === "ready" && stores.state.data.items.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
        <div><label>Find supplier<input type="search" maxLength={100} value={supplierSearch} placeholder="Search by name" onChange={(event) => { setSupplierSearch(event.target.value); setSupplierId(""); }} /></label><label className="supplier-select"><span id="purchase-supplier-label">Supplier</span><select aria-labelledby="purchase-supplier-label" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Choose a supplier</option>{suppliers.state.phase === "ready" && suppliers.state.data.items.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>{suppliers.state.phase === "ready" && suppliers.state.data.total > 100 && <p className="form-hint">Showing 100 matches. Narrow your supplier search.</p>}</div>
        <label className="full-width">Notes (optional)<textarea name="notes" maxLength={500} rows={2} /></label>
      </div>
      {stores.state.phase === "error" && <ErrorNotice message={stores.state.message} retry={stores.reload} />}
      {suppliers.state.phase === "error" && <ErrorNotice message={suppliers.state.message} retry={suppliers.reload} />}
      <section className="form-section"><h2>Order lines</h2><p>Quantities are whole units. The purchase cost is saved on each line.</p>
        <div className="purchase-lines">{lines.map((line) => <div className="purchase-draft-line" key={line.product.id}><div><strong>{line.product.name}</strong><span className="product-detail">{line.product.sku}</span></div><label>Quantity · {line.product.name}<input inputMode="numeric" value={line.quantity} onChange={(event) => changeLine(line.product.id, "quantity", event.target.value)} /></label><label>Unit cost · {line.product.name}<input inputMode="decimal" value={line.cost} onChange={(event) => changeLine(line.product.id, "cost", event.target.value)} /></label><button type="button" className="text-button" aria-label={`Remove ${line.product.name}`} onClick={() => setLines((previous) => previous.filter((item) => item.product.id !== line.product.id))}>Remove</button></div>)}</div>
        {lines.length === 0 && <p>No products added yet.</p>}
        <ProductPicker selected={lines.map((line) => line.product.id)} add={(product) => setLines((previous) => [...previous, { product, quantity: "1", cost: product.costPrice }])} />
      </section>
      <div className="form-actions"><button type="submit" disabled={lines.length === 0}>{busy ? "Saving…" : "Create draft"}</button><Link to="/purchases">Cancel</Link></div>
    </fieldset></form>
  </>;
}

function ProductPicker({ selected, add }: { selected: number[]; add: (product: Product) => void }) {
  const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  const products = useResource(`/api/products?pageSize=5&page=${page}&q=${encodeURIComponent(q)}`, productListSchema);
  return <section className="product-picker" aria-label="Add order products"><label>Find products<input type="search" placeholder="Product name or SKU" maxLength={100} value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} /></label>
    {products.state.phase === "loading" && <p role="status">Finding products…</p>}
    {products.state.phase === "error" && <ErrorNotice message={products.state.message} retry={products.reload} />}
    {products.state.phase === "ready" && <><ul className="category-list">{products.state.data.items.map((product) => <li key={product.id}><span>{product.name}<span className="product-detail">{product.sku} · {formatPrice(product.costPrice)}</span></span><button type="button" className="secondary" disabled={selected.includes(product.id) || selected.length >= 50} aria-label={`Add ${product.name}`} onClick={() => add(product)}>{selected.includes(product.id) ? "Added" : "Add"}</button></li>)}</ul><Pagination {...products.state.data} changePage={setPage} /></>}
  </section>;
}

export function PurchaseDetailPage() {
  const { id } = useParams();
  const order = useResource(`/api/purchase-orders/${id}`, purchaseSchema);
  return <>
    {order.state.phase === "loading" && <p role="status" className="empty-state">Loading purchase order…</p>}
    {order.state.phase === "error" && <ErrorNotice message={order.state.message} retry={order.reload} />}
    {order.state.phase === "ready" && <PurchaseDetail key={order.state.data.id} order={order.state.data} reload={order.reload} />}
  </>;
}
function PurchaseDetail({ order, reload }: { order: PurchaseOrder; reload: () => void }) {
  const canManage = useCanManage(); const role = useAuth().user!.role;
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  async function transition(action: "order" | "cancel") {
    setBusy(true); setError("");
    try { await requestJson(`/api/purchase-orders/${order.id}/${action}`, purchaseSchema, { method: "POST" }); reload(); }
    catch (problem) { setError(errorMessage(problem)); } finally { setBusy(false); }
  }
  const canReceive = role !== "VIEWER" && ["ORDERED", "PARTIALLY_RECEIVED"].includes(order.status);
  return <>
    <section className="page-heading"><div><Link className="back-link" to="/purchases">← Purchase orders</Link><p className="eyebrow">PURCHASE ORDER</p><h1>{order.number}</h1><p>{order.supplierName} · {order.storeName}</p></div><span className="status-badge">{statusLabels[order.status]}</span></section>
    {error && <ErrorNotice message={error} />}
    <section className="catalog-panel"><div className="table-caption"><h2>Order details</h2><span>Created {date.format(new Date(order.createdAt))} · Lagos</span></div>
      <div className="table-scroll" role="region" aria-label="Purchase order lines" tabIndex={0}><table className="purchase-table"><thead><tr><th>Product</th><th className="number">Ordered</th><th className="number">Received</th><th className="number">Outstanding</th><th className="number">Unit cost · NGN</th></tr></thead><tbody>{order.lines.map((line) => <tr key={line.id}><th scope="row">{line.name}<span className="product-detail">{line.sku}</span></th><td className="number">{line.orderedQty}</td><td className="number">{line.receivedQty}</td><td className="number">{line.orderedQty - line.receivedQty}</td><td className="number">{formatPrice(line.unitCost)}</td></tr>)}</tbody></table></div>
      <div className="purchase-summary"><p>{order.notes || "No order notes."}</p><strong>Order total {formatPrice(order.total)}</strong></div>
      {canManage && ["DRAFT", "ORDERED"].includes(order.status) && <div className="purchase-actions">
        {order.status === "DRAFT" && <button disabled={busy} onClick={() => { void transition("order"); }}>Mark as ordered</button>}
        {!confirmCancel ? <button className="secondary" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancel order</button> : <div><p>Cancel {order.number}? Its details will remain in purchase history.</p><div className="form-actions"><button disabled={busy} onClick={() => { void transition("cancel"); }}>Confirm cancellation</button><button className="secondary" disabled={busy} onClick={() => setConfirmCancel(false)}>Keep order</button></div></div>}
      </div>}
    </section>
    {canReceive && <ReceiptForm order={order} saved={reload} />}
  </>;
}
function ReceiptForm({ order, saved }: { order: PurchaseOrder; saved: () => void }) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    const lines = order.lines.map((line) => ({ lineId: line.id, raw: String(values.get(`line-${line.id}`) ?? "").trim() })).filter((line) => line.raw !== "").map((line) => ({ lineId: line.lineId, quantity: /^\d+$/.test(line.raw) ? Number(line.raw) : NaN }));
    const parsed = purchaseReceiptSchema.safeParse({ requestId, lines });
    if (!parsed.success) { setError("Enter positive whole quantities for the lines arriving now. Leave other lines blank."); return; }
    setBusy(true); setError("");
    try { await requestJson(`/api/purchase-orders/${order.id}/receive`, purchaseReceiptResultSchema, { method: "POST", body: JSON.stringify(parsed.data) }); saved(); }
    catch (problem) { setError(`${errorMessage(problem)} Retry these quantities to check whether the receipt was recorded.`); } finally { setBusy(false); }
  }
  return <form className="catalog-panel product-form receipt-form" onSubmit={(event) => { void receive(event); }} noValidate><h2>Receive stock</h2><p className="form-description">Enter what arrived today. Leave lines that have not arrived blank.</p>{error && <ErrorNotice message={error} />}<fieldset disabled={busy}>
    <div className="form-grid">{order.lines.filter((line) => line.receivedQty < line.orderedQty).map((line) => <label key={line.id}>Receive {line.name}<span className="form-hint">{line.orderedQty - line.receivedQty} outstanding · {line.sku}</span><input name={`line-${line.id}`} inputMode="numeric" autoComplete="off" /></label>)}</div>
    <div className="form-actions"><button>{busy ? "Recording…" : "Record receipt"}</button></div>
  </fieldset></form>;
}
