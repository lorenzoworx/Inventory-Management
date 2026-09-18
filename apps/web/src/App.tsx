import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import { ConnectionPage } from "./ConnectionPage";
import { ProductsPage, ProductEditor } from "./ProductsPage";
import { CategoriesPage } from "./CategoriesPage";

function Layout() {
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current !== pathname) {
      main.current?.focus();
      window.scrollTo(0, 0);
      previous.current = pathname;
    }
    document.title = `${pathname.startsWith("/categories") ? "Categories" : "Products"} · Uba Inventory`;
  }, [pathname]);
  return <div className="catalog-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="catalog-header">
      <Link className="brand" to="/products" aria-label="Uba Inventory home"><span className="brand-mark" aria-hidden="true">u.</span><span>Uba <span className="brand-light">Inventory</span></span></Link>
      <nav aria-label="Main navigation"><NavLink to="/products">Products</NavLink><NavLink to="/categories">Categories</NavLink></nav>
      <span className="workspace-label">Shared catalog <span aria-hidden="true">↗</span></span>
    </header>
    <main id="main-content" ref={main} tabIndex={-1}><Outlet /></main>
    <footer><span>Uba Inventory</span><div>Prices in NGN <span aria-hidden="true">·</span> <Link to="/connection">Connection check</Link></div></footer>
  </div>;
}

export function App() {
  return <BrowserRouter><Routes>
    <Route path="/connection" element={<ConnectionPage />} />
    <Route element={<Layout />}>
      <Route path="/" element={<Navigate to="/products" replace />} />
      <Route path="/products" element={<ProductsPage />} />
      <Route path="/products/new" element={<ProductEditor />} />
      <Route path="/products/:id/edit" element={<ProductEditor />} />
      <Route path="/categories" element={<CategoriesPage />} />
      <Route path="*" element={<section className="page-heading"><h1>Page not found</h1><Link to="/products">Return to products</Link></section>} />
    </Route>
  </Routes></BrowserRouter>;
}
