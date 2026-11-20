import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Doc } from "./api";

export default function Documents({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setDocs((await api<{ documents: Doc[] }>("/api/documents")).documents); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(""); setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      await api("/api/documents", { method: "POST", body });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setUploading(false); if (input.current) input.current.value = ""; }
  }

  async function remove(d: Doc) {
    if (!confirm(`Delete "${d.fileName}" and its ${d._count.deadlines} deadline(s)?`)) return;
    try { await api(`/api/documents/${d.id}`, { method: "DELETE" }); await load(); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : "Delete failed"); }
  }

  return (
    <section>
      <label className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files[0]); }}>
        <input ref={input} type="file" accept="application/pdf" hidden onChange={(e) => upload(e.target.files?.[0])} />
        {uploading ? "Uploading…" : "Drop a PDF here, or click to choose one"}
        <small className="muted">We find the deadlines and remind you automatically.</small>
      </label>
      {error && <p className="error">{error}</p>}
      {docs?.map((d) => (
        <article key={d.id} className="card row">
          <div>
            <h3>{d.fileName}</h3>
            <p className="muted small">{new Date(d.createdAt).toLocaleString()} · {d._count.deadlines} deadline(s)</p>
          </div>
          <div className="row">
            <span className={`pill ${d.status.toLowerCase()}`}>{d.status === "PROCESSING" ? "processing…" : d.status.toLowerCase()}</span>
            <button className="link danger" onClick={() => remove(d)}>Delete</button>
          </div>
        </article>
      ))}
      {docs?.length === 0 && <p className="muted">No documents yet.</p>}
    </section>
  );
}
