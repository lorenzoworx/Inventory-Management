export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-notice" role="alert"><p>{message}</p>{retry && <button type="button" className="secondary" onClick={retry}>Try again</button>}</div>;
}

export function Pagination({ page, pageSize, total, changePage }: { page: number; pageSize: number; total: number; changePage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="pagination">
    <span>{total === 0 ? "No results" : `${(page - 1) * pageSize + 1 > total ? 0 : (page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}</span>
    <nav aria-label="Pagination"><button type="button" className="secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button type="button" className="secondary" disabled={page >= pages} onClick={() => changePage(page + 1)}>Next</button></nav>
  </div>;
}

// Formatting only: stored amounts and API payloads remain decimal strings.
export function formatPrice(value: string) {
  const [whole, fraction = "00"] = value.split(".");
  return `₦${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
}
