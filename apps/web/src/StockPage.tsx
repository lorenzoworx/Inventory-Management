import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { movementListSchema, okSchema, stockChangeResultSchema, stockChangeSchema, stockListSchema, storeListSchema, type StockItem } from "@ims/contracts";
import { useAuth } from "./Auth";
import { errorMessage, requestJson } from "./catalog-api";
import { ErrorNotice, Pagination } from "./catalog-components";
import { useResource } from "./use-resource";

const lagosTime = new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });
const kindLabel = { OPENING: "Opening balance", SALE: "Sale", ADJUSTMENT: "Adjustment", REORDER: "Reorder point" };
type EntryKind = keyof typeof kindLabel;

export function StockPage({ history = false }: { history?: boolean }) {
  const [params, setParams] = useSearchParams();
  const locations = useResource("/api/stores?pageSize=100", storeListSchema);
  const storeId = params.get("storeId") ?? "";
  useEffect(() => {
    if (!storeId && locations.state.phase === "ready") {
      const first = locations.state.data.items.find((store) => store.code === "LAGOS") ?? locations.state.data.items[0];
      if (first) { const next = new URLSearchParams(params); next.set("storeId", String(first.id)); setParams(next, { replace: true }); }
    }
  }, [storeId, locations.state, params, setParams]);

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const next = new URLSearchParams({ storeId: String(values.get("storeId")), q: String(values.get("q") ?? "").trim() });
    const kind = String(values.get("kind") ?? ""); if (kind) next.set("kind", kind);
    setParams(next);
  }
  return <>
    <section className="page-heading"><div><p className="eyebrow">INVENTORY</p><h1>{history ? "Stock history" : "Stock by location"}</h1><p>{history ? "Every change, with its reason and the person who recorded it. Dates use Lagos time." : "Track opening balances, sales, and adjustments at each location."}</p></div></section>
    {locations.state.phase === "loading" && <p role="status">Loading locations…</p>}
    {locations.state.phase === "error" && <ErrorNotice message={locations.state.message} retry={locations.reload} />}
    {locations.state.phase === "ready" && <>
      <form className="filters stock-filters catalog-panel" key={params.toString()} onSubmit={filter}>
        <label><span id="stock-location-label">Location</span><select aria-labelledby="stock-location-label" name="storeId" defaultValue={storeId}><option value="" disabled>Choose a location</option>{locations.state.data.items.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
        <label className="search-field">{history ? "Search history" : "Search stock"}<input name="q" type="search" maxLength={100} defaultValue={params.get("q") ?? ""} placeholder={history ? "Product, SKU, or reason" : "Product name or SKU"} /></label>
        {history && <label><span id="movement-kind-label">Movement type</span><select aria-labelledby="movement-kind-label" name="kind" defaultValue={params.get("kind") ?? ""}><option value="">All movements</option>{(["OPENING", "SALE", "ADJUSTMENT"] as const).map((kind) => <option key={kind} value={kind}>{kindLabel[kind]}</option>)}</select></label>}
        <button type="submit" disabled={!storeId}>Apply filters</button>
      </form>
      {storeId && (history ? <History key={storeId} /> : <Balances key={storeId} storeId={Number(storeId)} />)}
    </>}
  </>;
}

function Balances({ storeId }: { storeId: number }) {
  const [params, setParams] = useSearchParams();
  const stock = useResource(`/api/stock?${params}`, stockListSchema);
  const role = useAuth().user!.role;
  const [entry, setEntry] = useState<{ item: StockItem; kind: EntryKind } | null>(null);
  const [notice, setNotice] = useState("");
  if (stock.state.phase === "loading") return <p className="empty-state" role="status">Loading stock…</p>;
  if (stock.state.phase === "error") return <ErrorNotice message={stock.state.message} retry={stock.reload} />;
  const result = stock.state.data;
  return <>
    {notice && <p className="success-notice" role="status">{notice}</p>}
    <section className="catalog-panel">
      {result.items.length === 0 ? <div className="empty-state"><h2>No matching products</h2><p>Change the search or add products to the shared catalog.</p></div> : <div className="table-scroll" role="region" aria-label="Stock balances" tabIndex={0}><table className="product-table"><thead><tr><th>Product</th><th className="number">On hand</th><th className="number">Reorder point</th><th>Status</th>{role !== "VIEWER" && <th>Actions</th>}</tr></thead><tbody>{result.items.map((item) => <tr key={item.productId}>
        <th scope="row"><span className="product-name">{item.name}</span><span className="product-detail">{item.sku} · {item.unit}{!item.isActive && " · Inactive product"}</span></th>
        <td className="number stock-quantity">{item.quantity}</td><td className="number">{item.reorderPoint}</td>
        <td><span className={`stock-state ${item.quantity <= item.reorderPoint ? "low" : ""}`}>{item.quantity === 0 ? "Out of stock" : item.quantity <= item.reorderPoint ? "Low stock" : "Available"}</span></td>
        {role !== "VIEWER" && <td><div className="row-actions"><button className="text-button" aria-label={`Record change for ${item.name}`} disabled={role === "STAFF" && !item.isActive} onClick={() => setEntry({ item, kind: !item.isActive ? "ADJUSTMENT" : item.hasMovements || role === "STAFF" ? "SALE" : "OPENING" })}>Record change</button>{role !== "STAFF" && <button className="text-button" aria-label={`Set reorder point for ${item.name}`} onClick={() => setEntry({ item, kind: "REORDER" })}>Reorder point</button>}</div></td>}
      </tr>)}</tbody></table></div>}
      <Pagination {...result} changePage={(page) => { const next = new URLSearchParams(params); next.set("page", String(page)); setParams(next); }} />
    </section>
    {entry && <StockEntry item={entry.item} initialKind={entry.kind} storeId={storeId} close={() => setEntry(null)} saved={(message) => { setEntry(null); setNotice(message); stock.reload(); }} />}
  </>;
}

function StockEntry({ item, initialKind, storeId, close, saved }: { item: StockItem; initialKind: EntryKind; storeId: number; close: () => void; saved: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState(initialKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const role = useAuth().user!.role;
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const rawQuantity = String(values.get("quantity") ?? "").trim();
    if (!/^-?\d+$/.test(rawQuantity)) { setError("Enter a whole-number quantity."); return; }
    const quantity = Number(rawQuantity);
    setBusy(true); setError("");
    try {
      if (kind === "REORDER") {
        if (quantity < 0 || quantity > 1000000) { setError("Reorder point must be between 0 and 1,000,000."); return; }
        await requestJson("/api/stock/reorder", okSchema, { method: "PUT", body: JSON.stringify({ productId: item.productId, storeId, reorderPoint: quantity }) });
        saved(`Reorder point updated for ${item.name}.`);
      } else {
        const input = stockChangeSchema.safeParse({ requestId, productId: item.productId, storeId, kind, quantity, note: String(values.get("note") ?? "") });
        if (!input.success) { setError(input.error.issues[0]?.message ?? "Check the entry."); return; }
        const result = await requestJson("/api/stock/changes", stockChangeResultSchema, { method: "POST", body: JSON.stringify(input.data) });
        saved(`${kindLabel[kind]} recorded for ${item.name}. Balance after entry: ${result.balance}.`);
      }
    } catch (problem) { setError(`${errorMessage(problem)} Retry this entry to check whether it was recorded.`); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="stock-dialog" aria-labelledby="stock-entry-title" onCancel={(event) => { event.preventDefault(); if (!busy) close(); }}>
    <p className="eyebrow">{item.sku}</p><h2 id="stock-entry-title">{initialKind === "REORDER" ? "Set reorder point" : "Record stock change"}</h2><p>{item.name} · {item.quantity} {item.unit} on hand</p>
    {error && <ErrorNotice message={error} />}
    <form onSubmit={(event) => { void submit(event); }} noValidate><fieldset disabled={busy}>
      {initialKind !== "REORDER" && <label><span id="entry-kind-label">Change type</span><select aria-labelledby="entry-kind-label" value={kind} onChange={(event) => setKind(event.target.value as EntryKind)}>
        {role !== "STAFF" && <option value="OPENING" disabled={item.hasMovements || !item.isActive}>Opening balance</option>}<option value="SALE" disabled={!item.isActive}>Sale</option>{role !== "STAFF" && <option value="ADJUSTMENT">Adjustment</option>}
      </select></label>}
      <label>{kind === "REORDER" ? "Reorder point" : "Quantity"}<input name="quantity" inputMode={kind === "ADJUSTMENT" ? "text" : "numeric"} defaultValue={initialKind === "REORDER" ? item.reorderPoint : ""} autoComplete="off" /></label>
      {kind === "ADJUSTMENT" && <p className="form-hint">Use a positive quantity to add stock or a negative quantity to remove it.</p>}
      {kind !== "REORDER" && <label>{kind === "ADJUSTMENT" ? "Reason" : "Note (optional)"}<textarea name="note" maxLength={500} rows={3} /></label>}
      <div className="form-actions"><button type="submit">{busy ? "Saving…" : "Save entry"}</button><button type="button" className="secondary" onClick={close}>Cancel</button></div>
    </fieldset></form>
  </dialog>;
}

function History() {
  const [params, setParams] = useSearchParams();
  const history = useResource(`/api/movements?${params}`, movementListSchema);
  if (history.state.phase === "loading") return <p className="empty-state" role="status">Loading stock history…</p>;
  if (history.state.phase === "error") return <ErrorNotice message={history.state.message} retry={history.reload} />;
  const result = history.state.data;
  return <section className="catalog-panel">
    {result.items.length === 0 ? <div className="empty-state"><h2>No movements found</h2><p>Recorded stock changes will appear here.</p></div> : <div className="table-scroll" role="region" aria-label="Stock history" tabIndex={0}><table className="product-table"><thead><tr><th>When · Lagos</th><th>Product</th><th>Movement</th><th className="number">Change</th><th className="number">Balance after</th><th>Recorded by / reason</th></tr></thead><tbody>{result.items.map((movement) => <tr key={movement.id}>
      <td className="movement-time">{lagosTime.format(new Date(movement.createdAt))}</td><th scope="row">{movement.name}<span className="product-detail">{movement.sku}</span></th><td>{kindLabel[movement.kind]}</td><td className="number">{movement.quantity > 0 ? "+" : ""}{movement.quantity}</td><td className="number">{movement.balanceAfter}</td><td className="movement-note">{movement.actorName}<span className="product-detail">{movement.note || "—"}</span></td>
    </tr>)}</tbody></table></div>}
    <Pagination {...result} changePage={(page) => { const next = new URLSearchParams(params); next.set("page", String(page)); setParams(next); }} />
  </section>;
}
