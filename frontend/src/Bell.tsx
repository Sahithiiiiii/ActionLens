import { useState } from "react";
import { api, type Notification } from "./api";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

interface Props { items: Notification[]; unread: number; setItems: (f: (n: Notification[]) => Notification[]) => void; setUnread: (n: number) => void }

export default function Bell({ items, unread, setItems, setUnread }: Props) {
  const [open, setOpen] = useState(false);

  async function read(n: Notification) {
    if (n.readAt) return;
    setItems((l) => l.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    setUnread(Math.max(0, unread - 1));
    await api(`/api/notifications/${n.id}/read`, { method: "PATCH" }).catch(() => {});
  }
  async function readAll() {
    setItems((l) => l.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    setUnread(0);
    await api("/api/notifications/read-all", { method: "POST" }).catch(() => {});
  }

  return (
    <div className="bell">
      <button className="icon" onClick={() => setOpen(!open)} aria-label="Notifications">
        🔔{unread > 0 && <span className="badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="dropdown">
          <div className="dropdown-head">
            <strong>Notifications</strong>
            {unread > 0 && <button className="link" onClick={readAll}>Mark all read</button>}
          </div>
          {items.length === 0 && <p className="muted pad">Nothing yet.</p>}
          {items.map((n) => (
            <div key={n.id} className={`note ${n.readAt ? "" : "unread"}`} onClick={() => read(n)}>
              <strong>{n.title}</strong>
              <span>{n.message}</span>
              <small className="muted">{ago(n.createdAt)}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
