import { Icon } from "./Icon";

export function EmptyState({ onOpen, loading }: { onOpen(): void; loading: boolean }) {
  return (
    <div className="empty-state">
      <div className="empty-card">
        <div className="empty-icon">
          <Icon name="doc" size={40} />
        </div>
        <h1>{loading ? "Opening…" : "Open a PDF"}</h1>
        <p>Drop a PDF here or choose a file. Vietnamese text will be masked automatically.</p>
        <button className="btn btn-primary" onClick={onOpen} disabled={loading}>
          Choose PDF…
        </button>
        <p className="empty-note">Everything is processed on this computer. Nothing is uploaded.</p>
      </div>
    </div>
  );
}
