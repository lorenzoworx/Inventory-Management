import { useSearchParams } from "react-router-dom";
import { storeListSchema } from "@ims/contracts";
import { useAuth } from "./Auth";
import { ErrorNotice, Pagination } from "./catalog-components";
import { useResource } from "./use-resource";

export function StoresPage() {
  const [params, setParams] = useSearchParams();
  const stores = useResource(`/api/stores?${params}`, storeListSchema);
  const { user } = useAuth();
  return <>
    <section className="page-heading"><div><p className="eyebrow">WORKSPACE</p><h1>Locations</h1><p>{user?.storeId ? "Your assigned location." : "Your shops and warehouse, with a separate stock record at each location."}</p></div></section>
    {stores.state.phase === "loading" && <p role="status">Loading locations…</p>}
    {stores.state.phase === "error" && <ErrorNotice message={stores.state.message} retry={stores.reload} />}
    {stores.state.phase === "ready" && <section className="catalog-panel" aria-label="Locations"><ul className="location-list">{stores.state.data.items.map((store) => <li key={store.id}><span className="location-mark" aria-hidden="true">{store.kind === "SHOP" ? "S" : "W"}</span><div><h2>{store.name}</h2><p>{store.code} · {store.kind === "SHOP" ? "Shop" : "Warehouse"}</p></div></li>)}</ul><Pagination {...stores.state.data} changePage={(page) => setParams({ page: String(page) })} /></section>}
  </>;
}
