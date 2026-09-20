import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { ConnectionPage } from "./ConnectionPage";
import { ProductsPage, ProductEditor } from "./ProductsPage";
import { CategoriesPage } from "./CategoriesPage";
import { AuthProvider, LoginPage, ProtectedPage, useAuth } from "./Auth";
import { StoresPage } from "./StoresPage";
import { ErrorNotice } from "./catalog-components";
import { errorMessage } from "./catalog-api";
import { ReportsPage } from "./ReportsPage";
import { StockPage } from "./StockPage";
import { NewTransferPage, TransferDetailPage, TransfersPage } from "./TransfersPage";
import { SuppliersPage } from "./SuppliersPage";
import { NewPurchasePage, PurchaseDetailPage, PurchasesPage } from "./PurchasesPage";

function Layout() {
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current !== pathname) {
      main.current?.focus();
      window.scrollTo(0, 0);
      previous.current = pathname;
    }
    document.title = `${pathname.startsWith("/reports") ? "Reports" : pathname.startsWith("/transfers") ? "Transfers" : pathname.startsWith("/purchases") ? "Purchases" : pathname === "/suppliers" ? "Suppliers" : pathname.startsWith("/categories") ? "Categories" : pathname.startsWith("/stores") ? "Locations" : pathname === "/stock" ? "Stock" : pathname === "/movements" ? "Stock history" : "Products"} · Uba Inventory`;
  }, [pathname]);
  return <div className="catalog-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="catalog-header">
      <Link className="brand" to="/products" aria-label="Uba Inventory home"><span className="brand-mark" aria-hidden="true">u.</span><span>Uba <span className="brand-light">Inventory</span></span></Link>
      <nav aria-label="Main navigation"><NavLink to="/products">Products</NavLink><NavLink to="/categories">Categories</NavLink><NavLink to="/stores">Locations</NavLink><NavLink to="/stock">Stock</NavLink><NavLink to="/movements">History</NavLink><NavLink to="/suppliers">Suppliers</NavLink><NavLink to="/purchases">Purchases</NavLink><NavLink to="/transfers">Transfers</NavLink><NavLink to="/reports">Reports</NavLink></nav>
      <div className="account-menu"><div><span>{user?.name}</span><small>{user?.role.toLowerCase()} · {user?.storeName ?? "All locations"}</small></div><button className="text-button" disabled={signingOut} onClick={() => { setSigningOut(true); setError(""); void logout().catch((problem: unknown) => { setError(errorMessage(problem)); setSigningOut(false); }); }}>{signingOut ? "Signing out…" : "Sign out"}</button></div>
    </header>
    <main id="main-content" ref={main} tabIndex={-1}>{error && <ErrorNotice message={error} />}<Outlet /></main>
    <footer><span>Uba Inventory</span><div>Prices in NGN <span aria-hidden="true">·</span> <Link to="/connection">Connection check</Link></div></footer>
  </div>;
}

export function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route path="/connection" element={<ConnectionPage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedPage><Layout /></ProtectedPage>}>
      <Route path="/" element={<Navigate to="/products" replace />} />
      <Route path="/products" element={<ProductsPage />} />
      <Route path="/products/new" element={<ProtectedPage admin><ProductEditor /></ProtectedPage>} />
      <Route path="/products/:id/edit" element={<ProtectedPage admin><ProductEditor /></ProtectedPage>} />
      <Route path="/categories" element={<CategoriesPage />} />
      <Route path="/stores" element={<StoresPage />} />
      <Route path="/stock" element={<StockPage key="stock" />} />
      <Route path="/movements" element={<StockPage key="history" history />} />
      <Route path="/suppliers" element={<SuppliersPage />} />
      <Route path="/purchases" element={<PurchasesPage />} />
      <Route path="/purchases/new" element={<NewPurchasePage />} />
      <Route path="/purchases/:id" element={<PurchaseDetailPage />} />
      <Route path="/transfers" element={<TransfersPage />} />
      <Route path="/transfers/new" element={<NewTransferPage />} />
      <Route path="/transfers/:id" element={<TransferDetailPage />} />
      <Route path="/reports" element={<Navigate to="/reports/valuation" replace />} />
      <Route path="/reports/valuation" element={<ReportsPage key="valuation" view="valuation" />} />
      <Route path="/reports/low-stock" element={<ReportsPage key="low-stock" view="low-stock" />} />
      <Route path="/reports/movements" element={<ReportsPage key="movements" view="movements" />} />
      <Route path="*" element={<section className="page-heading"><h1>Page not found</h1><Link to="/products">Return to products</Link></section>} />
    </Route>
  </Routes></AuthProvider></BrowserRouter>;
}
