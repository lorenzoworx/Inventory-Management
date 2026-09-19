import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { storeListSchema, transferActionResultSchema, transferInputSchema, transferListSchema, transferSchema, transferStatusSchema, type Product, type Transfer } from "@ims/contracts";
import { useAuth } from "./Auth";
import { requestJson, errorMessage } from "./catalog-api";
import { ErrorNotice, Pagination } from "./catalog-components";
import { useResource } from "./use-resource";
import { ProductPicker } from "./ProductPicker";

const labels = { PENDING: "Pending", IN_TRANSIT: "In transit", RECEIVED: "Received", CANCELLED: "Cancelled" };
const time = new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });
function useCanCreate() { const role = useAuth().user!.role; return role === "ADMIN" || role === "MANAGER"; }

export function TransfersPage() {
  const canCreate = useCanCreate();
  const [params, setParams] = useSearchParams();
  const transfers = useResource(`/api/transfers?${params}`, transferListSchema);
  return <>
    <section className="page-heading"><div><p className="eyebrow">INVENTORY</p><h1>Transfers</h1><p>Follow stock from dispatch at one location to arrival at another.</p></div>{canCreate && <Link className="button-link" to="/transfers/new">New transfer</Link>}</section>
    <section className="catalog-panel">
      <form className="filters" key={params.toString()} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const next = new URLSearchParams({ q: String(data.get("q") ?? "") }); const status = String(data.get("status") ?? ""); if (status) next.set("status", status); setParams(next); }}>
        <label className="search-field">Search transfers<input type="search" name="q" defaultValue={params.get("q") ?? ""} maxLength={100} placeholder="Transfer number or location" /></label>
        <label><span id="transfer-status-filter">Status</span><select aria-labelledby="transfer-status-filter" name="status" defaultValue={params.get("status") ?? ""}><option value="">All statuses</option>{transferStatusSchema.options.map((status) => <option key={status} value={status}>{labels[status]}</option>)}</select></label><button>Apply filters</button>
      </form>
      {transfers.state.phase === "loading" && <p role="status" className="empty-state">Loading transfers…</p>}
      {transfers.state.phase === "error" && <ErrorNotice message={transfers.state.message} retry={transfers.reload} />}
      {transfers.state.phase === "ready" && <>
        {transfers.state.data.items.length === 0 ? <div className="empty-state"><h2>No transfers found</h2><p>Transfers involving your accessible locations will appear here.</p></div> : <div className="table-scroll" role="region" aria-label="Transfers" tabIndex={0}><table className="product-table"><thead><tr><th>Transfer</th><th>Source</th><th>Destination</th><th>Status</th><th className="number">Units</th><th>Created · Lagos</th></tr></thead><tbody>{transfers.state.data.items.map((transfer) => <tr key={transfer.id}><th scope="row"><Link className="product-name" to={`/transfers/${transfer.id}`}>{transfer.number}</Link></th><td>{transfer.sourceName}</td><td>{transfer.destinationName}</td><td>{labels[transfer.status]}</td><td className="number">{transfer.totalUnits}</td><td>{time.format(new Date(transfer.createdAt))}</td></tr>)}</tbody></table></div>}
        <Pagination {...transfers.state.data} changePage={(page) => { const next = new URLSearchParams(params); next.set("page", String(page)); setParams(next); }} />
      </>}
    </section>
  </>;
}

export function NewTransferPage() {
  const canCreate = useCanCreate(); const navigate = useNavigate();
  const sources = useResource("/api/stores?pageSize=100", storeListSchema);
  const destinations = useResource("/api/transfers/destinations?pageSize=100", storeListSchema);
  const [sourceId, setSourceId] = useState("");
  const [lines, setLines] = useState<{ product: Product; quantity: string }[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  if (!canCreate) return <section className="page-heading"><h1>Access restricted</h1><p>Your role cannot create transfers.</p></section>;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const input = transferInputSchema.safeParse({ sourceId: Number(sourceId), destinationId: Number(data.get("destinationId")), notes: String(data.get("notes") ?? ""), lines: lines.map((line) => ({ productId: line.product.id, quantity: /^\d+$/.test(line.quantity) ? Number(line.quantity) : NaN })) });
    if (!input.success) { setError(input.error.issues[0]?.message ?? "Check the transfer details."); return; }
    setBusy(true); setError("");
    try { const transfer = await requestJson("/api/transfers", transferSchema, { method: "POST", body: JSON.stringify(input.data) }); navigate(`/transfers/${transfer.id}`); }
    catch (problem) { setError(errorMessage(problem)); } finally { setBusy(false); }
  }
  return <>
    <section className="page-heading"><div><Link className="back-link" to="/transfers">← Transfers</Link><p className="eyebrow">INVENTORY</p><h1>New transfer</h1><p>Choose where the stock leaves from and where it should arrive.</p></div></section>
    {error && <ErrorNotice message={error} />}
    <form className="catalog-panel product-form" onSubmit={(event) => { void save(event); }} noValidate><fieldset disabled={busy}>
      <div className="form-grid">
        <label><span id="transfer-source-label">Source location</span><select aria-labelledby="transfer-source-label" value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">Choose a source</option>{sources.state.phase === "ready" && sources.state.data.items.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
        <label><span id="transfer-destination-label">Destination location</span><select aria-labelledby="transfer-destination-label" name="destinationId" defaultValue=""><option value="">Choose a destination</option>{destinations.state.phase === "ready" && destinations.state.data.items.map((store) => <option key={store.id} value={store.id} disabled={String(store.id) === sourceId}>{store.name}</option>)}</select></label>
        <label className="full-width">Transfer notes (optional)<textarea name="notes" rows={2} maxLength={500} /></label>
      </div>
      {sources.state.phase === "error" && <ErrorNotice message={sources.state.message} retry={sources.reload} />}
      {destinations.state.phase === "error" && <ErrorNotice message={destinations.state.message} retry={destinations.reload} />}
      <section className="form-section"><h2>Products to transfer</h2><p>Creating a transfer reserves no stock. Available quantities are checked when it is dispatched.</p>
        <div className="purchase-lines">{lines.map((line) => <div className="purchase-draft-line transfer-draft-line" key={line.product.id}><div><strong>{line.product.name}</strong><span className="product-detail">{line.product.sku} · {line.product.unit}</span></div><label>Transfer quantity · {line.product.name}<input inputMode="numeric" value={line.quantity} onChange={(event) => setLines((previous) => previous.map((item) => item.product.id === line.product.id ? { ...item, quantity: event.target.value } : item))} /></label><button type="button" className="text-button" aria-label={`Remove ${line.product.name}`} onClick={() => setLines((previous) => previous.filter((item) => item.product.id !== line.product.id))}>Remove</button></div>)}</div>
        <ProductPicker showCost={false} selected={lines.map((line) => line.product.id)} add={(product) => setLines((previous) => [...previous, { product, quantity: "1" }])} />
      </section>
      <div className="form-actions"><button disabled={lines.length === 0}>{busy ? "Saving…" : "Create transfer"}</button><Link to="/transfers">Cancel</Link></div>
    </fieldset></form>
  </>;
}

export function TransferDetailPage() {
  const { id } = useParams(); const transfer = useResource(`/api/transfers/${id}`, transferSchema);
  return <>
    {transfer.state.phase === "loading" && <p role="status" className="empty-state">Loading transfer…</p>}
    {transfer.state.phase === "error" && <ErrorNotice message={transfer.state.message} retry={transfer.reload} />}
    {transfer.state.phase === "ready" && <TransferDetail transfer={transfer.state.data} reload={transfer.reload} />}
  </>;
}
function TransferDetail({ transfer, reload }: { transfer: Transfer; reload: () => void }) {
  const user = useAuth().user!;
  const canSource = user.role === "ADMIN" || (user.role !== "VIEWER" && user.storeId === transfer.sourceId);
  const canDestination = user.role === "ADMIN" || (user.role !== "VIEWER" && user.storeId === transfer.destinationId);
  const canCancel = canSource && user.role !== "STAFF" && transfer.status === "PENDING";
  const action = transfer.status === "PENDING" && canSource ? "dispatch" : transfer.status === "IN_TRANSIT" && canDestination ? "receive" : null;
  return <>
    <section className="page-heading"><div><Link className="back-link" to="/transfers">← Transfers</Link><p className="eyebrow">STOCK TRANSFER</p><h1>{transfer.number}</h1><p>{transfer.sourceName} → {transfer.destinationName}</p></div><span className="status-badge">{labels[transfer.status]}</span></section>
    <section className="catalog-panel"><div className="table-caption"><h2>Transfer details</h2><span>Created {time.format(new Date(transfer.createdAt))} · Lagos</span></div>
      <div className="table-scroll" role="region" aria-label="Transfer lines" tabIndex={0}><table className="transfer-table"><thead><tr><th>Product</th><th className="number">Quantity</th></tr></thead><tbody>{transfer.lines.map((line) => <tr key={line.id}><th scope="row">{line.name}<span className="product-detail">{line.sku}</span></th><td className="number">{line.quantity}</td></tr>)}</tbody></table></div>
      <div className="transfer-progress"><p>{transfer.status === "PENDING" ? "Stock remains available at the source until dispatch." : transfer.status === "IN_TRANSIT" ? `${transfer.totalUnits} units are in transit. They have left the source and are not yet available at the destination.` : transfer.status === "RECEIVED" ? "All transfer lines have arrived and are available at the destination." : "This transfer was cancelled before dispatch. No stock moved."}</p>
        {transfer.dispatchedAt && <p>Dispatched {time.format(new Date(transfer.dispatchedAt))} · Lagos</p>}{transfer.receivedAt && <p>Received {time.format(new Date(transfer.receivedAt))} · Lagos</p>}{transfer.notes && <p className="movement-note">{transfer.notes}</p>}
      </div>
    </section>
    {(action || canCancel) && <TransferActions key={`${transfer.id}-${transfer.status}`} transfer={transfer} action={action} canCancel={canCancel} saved={reload} />}
  </>;
}
function TransferActions({ transfer, action, canCancel, saved }: { transfer: Transfer; action: "dispatch" | "receive" | null; canCancel: boolean; saved: () => void }) {
  const [requestId] = useState(() => crypto.randomUUID()); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [cancel, setCancel] = useState(false);
  async function submit(operation: "dispatch" | "receive" | "cancel") {
    setBusy(true); setError("");
    try {
      if (operation === "cancel") await requestJson(`/api/transfers/${transfer.id}/cancel`, transferSchema, { method: "POST" });
      else await requestJson(`/api/transfers/${transfer.id}/${operation}`, transferActionResultSchema, { method: "POST", body: JSON.stringify({ requestId }) });
      saved();
    } catch (problem) { setError(`${errorMessage(problem)}${operation === "cancel" ? "" : " Retry this action to check whether it was recorded."}`); } finally { setBusy(false); }
  }
  return <section className="catalog-panel product-form receipt-form" aria-label="Transfer actions">{error && <ErrorNotice message={error} />}
    {action && <><h2>{action === "dispatch" ? "Dispatch stock" : "Receive transfer"}</h2><p className="form-description">{action === "dispatch" ? "Confirm that all listed goods are leaving the source location now." : "Confirm that all listed goods have arrived at the destination. Partial transfer receipts are not supported."}</p></>}
    <div className="form-actions">{action && <button disabled={busy} onClick={() => { void submit(action); }}>{action === "dispatch" ? "Confirm dispatch" : "Confirm receipt"}</button>}{canCancel && !cancel && <button className="secondary" disabled={busy} onClick={() => setCancel(true)}>Cancel transfer</button>}</div>
    {cancel && <><p>Cancel {transfer.number}? Its details will remain in transfer history.</p><div className="form-actions"><button disabled={busy} onClick={() => { void submit("cancel"); }}>Confirm cancellation</button><button className="secondary" disabled={busy} onClick={() => setCancel(false)}>Keep transfer</button></div></>}
  </section>;
}
