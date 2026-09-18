import { useEffect, useState } from "react";
import type { HealthResponse } from "@ims/contracts";
import { getHealth } from "./api";

type ConnectionState =
  | { phase: "loading" }
  | { phase: "connected"; data: HealthResponse }
  | { phase: "error"; message: string };

export function ConnectionPage() {
  const [attempt, setAttempt] = useState(0);
  const [connection, setConnection] = useState<ConnectionState>({ phase: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function checkConnection() {
      setConnection({ phase: "loading" });
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);
        const data = await getHealth(signal);
        if (!controller.signal.aborted) setConnection({ phase: "connected", data });
      } catch (error) {
        // Ignore results from an effect that has already been cleaned up.
        if (controller.signal.aborted) return;
        const message = error instanceof DOMException && error.name === "TimeoutError"
          ? "The API took too long to respond. Try again."
          : error instanceof TypeError
            ? "Could not reach the API. Make sure it is running, then try again."
            : error instanceof Error
              ? error.message
              : "The connection check failed. Try again.";
        setConnection({ phase: "error", message });
      }
    }

    void checkConnection();
    return () => controller.abort();
  }, [attempt]);

  const status = connection.phase === "connected"
    ? "API connected"
    : connection.phase === "error" ? "Connection failed" : "Checking connection…";

  return (
    <div className="page">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Uba Inventory home">
          <span className="brand-mark" aria-hidden="true">u.</span>
          <span>Uba <span className="brand-light">Inventory</span></span>
        </a>
        <span className="milestone">Milestone 01</span>
      </header>

      <main>
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">THE FOUNDATION</p>
          <h1 id="page-title">Every system starts<br />with a connection.</h1>
          <p className="intro-copy">
            A first working piece of Uba Inventory: the browser asks,
            the server responds, and the result appears here.
          </p>
        </section>

        <section className="connection-card" aria-labelledby="connection-title">
          <div className="card-heading">
            <div>
              <p className="eyebrow">SERVICE STATUS</p>
              <h2 id="connection-title">Connection check</h2>
            </div>
            <span className={`status-badge ${connection.phase}`} role="status" aria-live="polite">
              <span className="status-dot" aria-hidden="true" />{status}
            </span>
          </div>

          <div className="connection-body">
            <div className="connection-description">
              <p>
                {connection.phase === "connected" && connection.data.message}
                {connection.phase === "loading" && "Waiting for the inventory API to respond."}
                {connection.phase === "error" && connection.message}
              </p>
              <button disabled={connection.phase === "loading"} onClick={() => setAttempt((value) => value + 1)}>
                {connection.phase === "loading" ? "Checking…" : connection.phase === "error" ? "Try again" : "Check again"}
                <span aria-hidden="true">↗</span>
              </button>
              <p className="scope-note">This checks the API process. Catalog requests also query PostgreSQL.</p>
            </div>
            <div className="response-panel">
              <div className="response-heading"><span>RESPONSE BODY</span><code>GET /api/health</code></div>
              <pre aria-label="API response">{connection.phase === "connected"
                ? JSON.stringify(connection.data, null, 2)
                : connection.phase === "loading" ? "Waiting for response…" : "No valid response received."}</pre>
            </div>
          </div>
        </section>

        <section className="request-section" aria-labelledby="request-title">
          <div className="section-heading"><h2 id="request-title">One request, round trip.</h2><span>How this page works</span></div>
          <ol className="request-steps">
            <li><span className="step-number">01</span><h3>The browser asks</h3><p>React calls <code>fetch</code> to send a GET request to <code>/api/health</code>.</p></li>
            <li><span className="step-number">02</span><h3>The server responds</h3><p>Express handles the route and sends back a status, service name, and timestamp as JSON.</p></li>
            <li><span className="step-number">03</span><h3>The page updates</h3><p>The response is validated, saved in React state, and displayed in the card above.</p></li>
          </ol>
        </section>
      </main>

      <footer><span>Uba Inventory</span><span>Learning reference · the first request round trip.</span></footer>
    </div>
  );
}
