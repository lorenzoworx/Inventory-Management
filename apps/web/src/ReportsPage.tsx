import { type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { lowStockReportSchema, movementReportSchema, storeListSchema, valuationReportSchema, type MovementReport } from "@ims/contracts";
import { ErrorNotice, formatPrice, Pagination } from "./catalog-components";
import { useResource } from "./use-resource";

export type ReportView = "valuation" | "low-stock" | "movements";
const titles = { valuation: "Stock valuation", "low-stock": "Low stock", movements: "Movement totals" };
const descriptions = {
  valuation: "Current on-hand stock valued at each product's catalog cost. Prices are in NGN.",
  "low-stock": "Active products at or below their location's reorder point, including products with no opening stock.",
  movements: "Fourteen calendar days of stock activity. Day boundaries follow Africa/Lagos."
};
const count = (value: string | number) => BigInt(value).toLocaleString("en-NG");
const signed = (value: string) => `${BigInt(value) > 0n ? "+" : ""}${count(value)}`;
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00Z`));
const generatedLabel = (value: string) => new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function ReportsPage({ view }: { view: ReportView }) {
  const [params, setParams] = useSearchParams();
  const stores = useResource("/api/stores?pageSize=100", storeListSchema);
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget); const next = new URLSearchParams();
    for (const field of ["storeId", "q", "endDate"]) { const value = String(values.get(field) ?? "").trim(); if (value) next.set(field, value); }
    setParams(next);
  }
  return <>
    <section className="page-heading"><div><p className="eyebrow">REPORTS</p><h1>{titles[view]}</h1><p>{descriptions[view]}</p></div></section>
    <nav className="report-tabs" aria-label="Report types">{(["valuation", "low-stock", "movements"] as const).map((kind) => {
      const query = new URLSearchParams(); for (const key of ["storeId", "q"]) { const value = params.get(key); if (value) query.set(key, value); }
      return <Link key={kind} to={`/reports/${kind}?${query}`} aria-current={view === kind ? "page" : undefined}>{titles[kind]}</Link>;
    })}</nav>
    <form className="filters catalog-panel report-filters" key={params.toString()} onSubmit={filter}>
      <label><span id="report-location-label">Location</span><select aria-labelledby="report-location-label" name="storeId" defaultValue={params.get("storeId") ?? ""}><option value="">All accessible locations</option>{stores.state.phase === "ready" && stores.state.data.items.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      <label className="search-field">Search report products<input type="search" name="q" maxLength={100} defaultValue={params.get("q") ?? ""} placeholder="Product name or SKU" /></label>
      {view === "movements" && <label>Through date<input name="endDate" type="date" min="2000-01-01" max="2100-12-31" defaultValue={params.get("endDate") ?? ""} aria-describedby="report-date-hint" /></label>}
      <button>Apply filters</button>
    </form>
    {view === "movements" && <p id="report-date-hint" className="catalog-note">Leave the date blank to include today in Lagos and the previous 13 days. Today's totals can still change.</p>}
    {stores.state.phase === "error" && <ErrorNotice message={stores.state.message} retry={stores.reload} />}
    {view === "valuation" ? <Valuation /> : view === "low-stock" ? <LowStock /> : <Movements />}
  </>;
}
function ReportMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="report-metric"><p>{label}</p><strong>{value}</strong><span>{hint}</span></div>;
}
function ReportFooter({ generatedAt, refresh }: { generatedAt: string; refresh: () => void }) { return <div className="report-footer"><p className="catalog-note">Generated {generatedLabel(generatedAt)} · Africa/Lagos. Totals include every matching row, across all pages.</p><button className="secondary" onClick={refresh}>Refresh report</button></div>; }
function Valuation() {
  const [params, setParams] = useSearchParams(); const report = useResource(`/api/reports/valuation?${params}`, valuationReportSchema);
  if (report.state.phase === "loading") return <p role="status" className="empty-state">Calculating stock value…</p>;
  if (report.state.phase === "error") return <ErrorNotice message={report.state.message} retry={report.reload} />;
  const data = report.state.data;
  return <>
    <div className="report-metrics"><ReportMetric label="On-hand value" value={formatPrice(data.totalValue)} hint="At current catalog cost" /><ReportMetric label="Units on hand" value={count(data.totalQuantity)} hint="Across matching locations" /><ReportMetric label="Product / location records" value={count(data.total)} hint="With a positive balance" /></div>
    <p className="report-explanation">Includes inactive products that still have stock. Goods in transit are excluded. This is a current cost estimate; changing a catalog cost changes this report.</p>
    <section className="catalog-panel">{data.items.length === 0 ? <div className="empty-state"><h2>No valued stock on this page</h2><p>Choose another page or filter. Products with zero stock have no on-hand value.</p></div> : <div className="table-scroll" role="region" aria-label="Stock valuation" tabIndex={0}><table className="product-table"><thead><tr><th>Product</th><th>Location</th><th className="number">Quantity</th><th className="number">Unit cost</th><th className="number">Value · NGN</th></tr></thead><tbody>{data.items.map((item) => <tr key={`${item.storeId}-${item.productId}`}><th scope="row">{item.name}<span className="product-detail">{item.sku} · {item.unit}{!item.isActive && " · Inactive"}</span></th><td>{item.storeName}</td><td className="number">{count(item.quantity)}</td><td className="number">{formatPrice(item.costPrice)}</td><td className="number selling-price">{formatPrice(item.value)}</td></tr>)}</tbody></table></div>}
      <Pagination {...data} changePage={(page) => { const next = new URLSearchParams(params); next.set("page", String(page)); setParams(next); }} />
    </section><ReportFooter generatedAt={data.generatedAt} refresh={report.reload} />
  </>;
}
function LowStock() {
  const [params, setParams] = useSearchParams(); const report = useResource(`/api/reports/low-stock?${params}`, lowStockReportSchema);
  if (report.state.phase === "loading") return <p role="status" className="empty-state">Checking reorder points…</p>;
  if (report.state.phase === "error") return <ErrorNotice message={report.state.message} retry={report.reload} />;
  const data = report.state.data;
  return <>
    <div className="report-metrics"><ReportMetric label="Needs attention" value={count(data.total)} hint="Product / location records" /><ReportMetric label="Out of stock" value={count(data.outOfStock)} hint="Zero units available" /><ReportMetric label="At or below reorder point" value={count(data.total - data.outOfStock)} hint="With stock still available" /></div>
    <section className="catalog-panel">{data.items.length === 0 ? <div className="empty-state"><h2>No low-stock records on this page</h2><p>Change your filters or page to see other records.</p></div> : <div className="table-scroll" role="region" aria-label="Low-stock products" tabIndex={0}><table className="product-table"><thead><tr><th>Product</th><th>Location</th><th className="number">On hand</th><th className="number">Reorder point</th><th>Status</th><th>Details</th></tr></thead><tbody>{data.items.map((item) => <tr key={`${item.storeId}-${item.productId}`}><th scope="row">{item.name}<span className="product-detail">{item.sku} · {item.unit}</span></th><td>{item.storeName}</td><td className="number">{count(item.quantity)}</td><td className="number">{count(item.reorderPoint)}</td><td className="stock-state low">{item.quantity === 0 ? "Out of stock" : "Low stock"}</td><td><Link to={`/stock?storeId=${item.storeId}&q=${encodeURIComponent(item.sku)}`} aria-label={`View stock for ${item.name} at ${item.storeName}`}>View stock</Link></td></tr>)}</tbody></table></div>}
      <Pagination {...data} changePage={(page) => { const next = new URLSearchParams(params); next.set("page", String(page)); setParams(next); }} />
    </section><ReportFooter generatedAt={data.generatedAt} refresh={report.reload} />
  </>;
}
function Movements() {
  const [params] = useSearchParams(); const report = useResource(`/api/reports/movements?${params}`, movementReportSchema);
  if (report.state.phase === "loading") return <p role="status" className="empty-state">Summing 14 days of movements…</p>;
  if (report.state.phase === "error") return <ErrorNotice message={report.state.message} retry={report.reload} />;
  const data = report.state.data;
  return <>
    <div className="report-metrics"><ReportMetric label="Units in" value={count(data.totals.incoming)} hint={`${data.startDate} to ${data.endDate}`} /><ReportMetric label="Units out" value={count(data.totals.outgoing)} hint={`${count(data.totals.movementCount)} recorded movements`} /><ReportMetric label="Net change" value={signed(data.totals.net)} hint="Units in minus units out" /></div>
    <p className="report-explanation">Transfers count at their dispatch and receipt locations on the days recorded. Units include openings and adjustments; these totals are not revenue or profit.</p>
    <MovementChart data={data} />
    <section className="catalog-panel"><div className="table-caption"><h2>Daily breakdown</h2><span>{data.startDate} – {data.endDate} · Lagos</span></div><div className="table-scroll" role="region" aria-label="Daily movement totals" tabIndex={0}><table className="product-table"><thead><tr><th>Date</th><th className="number">Opening</th><th className="number">Purchases</th><th className="number">Sales out</th><th className="number">Adjustments in</th><th className="number">Adjustments out</th><th className="number">Transfers in</th><th className="number">Transfers out</th><th className="number">Net</th></tr></thead><tbody>{data.days.map((day) => <tr key={day.date}><th scope="row"><time dateTime={day.date}>{dateLabel(day.date)}</time></th><td className="number">{count(day.opening)}</td><td className="number">{count(day.purchases)}</td><td className="number">{count(day.sales)}</td><td className="number">{count(day.adjustmentIn)}</td><td className="number">{count(day.adjustmentOut)}</td><td className="number">{count(day.transferIn)}</td><td className="number">{count(day.transferOut)}</td><td className="number">{signed(day.net)}</td></tr>)}</tbody></table></div></section>
    <div className="report-footer"><p className="catalog-note">Generated {generatedLabel(data.generatedAt)} · Africa/Lagos. Dates with no activity are shown as zero.</p><button className="secondary" onClick={report.reload}>Refresh report</button></div>
  </>;
}
function MovementChart({ data }: { data: MovementReport }) {
  // Convert only for drawing relative bar lengths. Exact quantities stay strings in labels and the table.
  const maximum = Math.max(1, ...data.days.flatMap((day) => [Number(day.incoming), Number(day.outgoing)]));
  return <figure className="catalog-panel movement-chart"><figcaption>Daily stock flow <span>Units in / units out</span></figcaption><div aria-hidden="true">{data.days.map((day) => <div className="movement-chart-row" key={day.date}><span>{dateLabel(day.date)}</span><div className="movement-bars"><div className="movement-bar incoming" style={{ width: `${Number(day.incoming) / maximum * 100}%` }} /><div className="movement-bar outgoing" style={{ width: `${Number(day.outgoing) / maximum * 100}%` }} /></div><span>{count(day.incoming)} / {count(day.outgoing)}</span></div>)}</div><p className="form-hint">Green: units in. Amber: units out. Exact quantities by movement type are in the table below.</p></figure>;
}
