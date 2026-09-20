import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { demoConfigSchema, publicDemoCredentials, okSchema, sessionSchema, type User } from "@ims/contracts";
import { errorMessage, requestJson } from "./catalog-api";
import { ErrorNotice } from "./catalog-components";
import { useResource } from "./use-resource";

type AuthContextValue = { user: User | null; loading: boolean; error?: string; refresh: () => void; logout: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { state, reload } = useResource("/api/auth/session", sessionSchema);
  useEffect(() => {
    window.addEventListener("ims:session-expired", reload);
    return () => window.removeEventListener("ims:session-expired", reload);
  }, [reload]);
  const value: AuthContextValue = {
    user: state.phase === "ready" ? state.data.user : null,
    loading: state.phase === "loading", error: state.phase === "error" ? state.message : undefined,
    refresh: reload,
    logout: async () => { await requestJson("/api/auth/logout", okSchema, { method: "POST" }); reload(); }
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider is missing.");
  return context;
}

export function ProtectedPage({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <div className="auth-shell"><p role="status">Checking your session…</p></div>;
  if (auth.error) return <div className="auth-shell"><ErrorNotice message={auth.error} retry={auth.refresh} /></div>;
  if (!auth.user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  if (admin && auth.user.role !== "ADMIN") return <section className="page-heading"><div><h1>Administrator access required</h1><p>Your account can browse the shared catalog.</p><Link to="/products">Back to products</Link></div></section>;
  return children;
}

export function LoginPage() {
  const auth = useAuth();
  const demo = useResource("/api/demo", demoConfigSchema);
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requested = (location.state as { from?: unknown } | null)?.from;
  const destination = typeof requested === "string" && requested.startsWith("/") && !requested.startsWith("//") ? requested : "/products";
  async function signIn(email: FormDataEntryValue | null, password: FormDataEntryValue | null) {
    setBusy(true); setError("");
    try {
      await requestJson("/api/auth/login", sessionSchema, { method: "POST", body: JSON.stringify({ email, password }) });
      auth.refresh();
      navigate(destination, { replace: true });
    } catch (problem) { setError(errorMessage(problem)); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    void signIn(values.get("email"), values.get("password"));
  }
  if (auth.user) return <Navigate to={destination} replace />;
  return <main className="auth-shell">
    <Link className="brand" to="/" aria-label="Uba Inventory home"><span className="brand-mark" aria-hidden="true">u.</span><span>Uba <span className="brand-light">Inventory</span></span></Link>
    <div className="login-panel"><p className="eyebrow">WELCOME BACK</p><h1>Sign in to your workspace.</h1><p className="login-copy">Your catalog, locations, and inventory in one place.</p>
      {auth.error && <ErrorNotice message={auth.error} retry={auth.refresh} />}
      {error && <ErrorNotice message={error} />}
      {demo.state.phase === "ready" && demo.state.data.enabled && <aside className="demo-welcome"><h2>Explore the portfolio demo</h2><p>Fictional stock for two shops and a warehouse. Browse every location with read-only access.</p><button type="button" disabled={busy || auth.loading || Boolean(auth.error)} onClick={() => { void signIn(publicDemoCredentials.email, publicDemoCredentials.password); }}>Explore read-only demo</button><p className="form-hint">Viewer: {publicDemoCredentials.email}<br />Password: {publicDemoCredentials.password}</p></aside>}
      <form onSubmit={(event) => { void submit(event); }}>
        <fieldset disabled={busy || auth.loading || Boolean(auth.error)}>
          <label>Email address<input type="email" name="email" autoComplete="username" maxLength={254} required /></label>
          <label>Password<input type="password" name="password" autoComplete="current-password" maxLength={72} required /></label>
          <button type="submit">{busy ? "Signing in…" : auth.loading ? "Checking session…" : "Sign in"}<span aria-hidden="true">→</span></button>
        </fieldset>
      </form>
    </div>
    <p className="login-footer">Uba Inventory <span aria-hidden="true">·</span> <Link to="/connection">Connection check</Link></p>
  </main>;
}
