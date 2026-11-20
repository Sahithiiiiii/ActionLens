import { useCallback, useEffect, useState } from "react";
import { api, getToken, setToken, streamUrl, ApiError, type Notification, type User } from "./api";
import Auth from "./Auth";
import Bell from "./Bell";
import Deadlines from "./Deadlines";
import Documents from "./Documents";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(!!getToken());
  const [tab, setTab] = useState<"deadlines" | "documents">("deadlines");
  const [notes, setNotes] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<Notification | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  const logout = useCallback(() => { setToken(null); setUser(null); setNotes([]); setUnread(0); }, []);

  // Restore the session on page load.
  useEffect(() => {
    if (!getToken()) return;
    api<{ user: User }>("/api/auth/me")
      .then((r) => setUser(r.user))
      .catch((e) => e instanceof ApiError && e.status === 401 && logout())
      .finally(() => setBooting(false));
  }, [logout]);

  // Initial notification list + live stream (SSE) once logged in.
  useEffect(() => {
    if (!user) return;
    api<{ notifications: Notification[]; unreadCount: number }>("/api/notifications?limit=30")
      .then((r) => { setNotes(r.notifications); setUnread(r.unreadCount); });

    const es = new EventSource(streamUrl());
    es.addEventListener("notification", (e) => {
      const n = JSON.parse((e as MessageEvent).data) as Notification;
      setNotes((l) => [n, ...l]);
      setUnread((u) => u + 1);
      setToast(n);
      bump(); // a reminder may have changed deadline state
    });
    es.addEventListener("document", bump);
    return () => es.close();
  }, [user, bump]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  if (booting) return <p className="muted center">Loading…</p>;
  if (!user) return <Auth onAuth={setUser} />;

  return (
    <>
      <header>
        <strong className="logo">ActionLens</strong>
        <nav className="tabs">
          <button className={tab === "deadlines" ? "tab active" : "tab"} onClick={() => setTab("deadlines")}>Deadlines</button>
          <button className={tab === "documents" ? "tab active" : "tab"} onClick={() => setTab("documents")}>Documents</button>
        </nav>
        <div className="row">
          <Bell items={notes} unread={unread} setItems={setNotes} setUnread={setUnread} />
          <span className="muted small hide-sm">{user.name}</span>
          <button className="link" onClick={logout}>Log out</button>
        </div>
      </header>
      <main>
        {tab === "deadlines" ? <Deadlines user={user} refreshKey={refreshKey} /> : <Documents refreshKey={refreshKey} onChanged={bump} />}
      </main>
      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          <strong>{toast.title}</strong><span>{toast.message}</span>
        </div>
      )}
    </>
  );
}
