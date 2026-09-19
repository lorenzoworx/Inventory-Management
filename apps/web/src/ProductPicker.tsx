import { useState } from "react";
import { productListSchema, type Product } from "@ims/contracts";
import { useResource } from "./use-resource";
import { ErrorNotice, formatPrice, Pagination } from "./catalog-components";

export function ProductPicker({ selected, add, showCost = true }: { selected: number[]; showCost?: boolean; add: (product: Product) => void }) {
  const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  const products = useResource(`/api/products?pageSize=5&page=${page}&q=${encodeURIComponent(q)}`, productListSchema);
  return <section className="product-picker" aria-label="Add products"><label>Find products<input type="search" placeholder="Product name or SKU" maxLength={100} value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} /></label>
    {products.state.phase === "loading" && <p role="status">Finding products…</p>}
    {products.state.phase === "error" && <ErrorNotice message={products.state.message} retry={products.reload} />}
    {products.state.phase === "ready" && <><ul className="category-list">{products.state.data.items.map((product) => <li key={product.id}><span>{product.name}<span className="product-detail">{product.sku}{showCost && ` · ${formatPrice(product.costPrice)}`}</span></span><button type="button" className="secondary" disabled={selected.includes(product.id) || selected.length >= 50} aria-label={`Add ${product.name}`} onClick={() => add(product)}>{selected.includes(product.id) ? "Added" : "Add"}</button></li>)}</ul><Pagination {...products.state.data} changePage={setPage} /></>}
  </section>;
}

