import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Deadline, type User } from "./api";

type Status = Deadline["status"];
const LEADS = [[30, "30 min"], [60, "1 hour"], [120, "2 hours"], [360, "6 hours"], [1440, "1 day"], [2880, "2 days"]] as const;
const RANGES = [[0, "All"], [1, "Under 1 day"], [5, "Under 5 days"], [7, "Under 1 week"]] as const;
const REPEATS = [[5, "5 min"], [15, "15 min"], [30, "30 min"], [60, "1 hour"], [180, "3 hours"]] as const;

const dayKey = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });
const dayDiff = (iso: string, tz: string) =>
  Math.round((Date.parse(dayKey(iso, tz)) - Date.parse(dayKey(new Date().toISOString(), tz))) / 86_400_000);

function timeLeft(iso: string) {
  const m = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (m <= 0) return "now";
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
}

function groupOf(d: Deadline, tz: string) {
  const n = d.dueAt ? dayDiff(d.dueAt, tz) : 99;
  return n <= 0 ? "Today" : n === 1 ? "Tomorrow" : n <= 7 ? "This week" : "Later";
}

function urgency(d: Deadline) {
  if (d.status !== "PENDING" || !d.dueAt) return "";
  const h = (new Date(d.dueAt).getTime() - Date.now()) / 3_600_000;
  return h < 24 ? "urgent" : h < 72 ? "soon" : "";
}

/** Download an .ics file so the deadline can go into Google/Apple/Outlook calendar. */
function addToCalendar(d: Deadline) {
  const stamp = (dt: Date) => dt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (t: string) => t.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const when = d.time && d.dueAt
    ? `DTSTART:${stamp(new Date(d.dueAt))}\r\nDTEND:${stamp(new Date(new Date(d.dueAt).getTime() + 30 * 60000))}`
    : `DTSTART;VALUE=DATE:${d.date.replace(/-/g, "")}`;
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ActionLens//EN", "BEGIN:VEVENT",
    `UID:${d.id}@actionlens`, `DTSTAMP:${stamp(new Date())}`, when,
    `SUMMARY:${esc(d.event)}`, `DESCRIPTION:${esc(`From ${d.document.fileName}`)}`,
    "BEGIN:VALARM", "TRIGGER:-PT60M", "ACTION:DISPLAY", `DESCRIPTION:${esc(d.event)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = `${d.event.slice(0, 40).replace(/[^\w]+/g, "-")}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Deadlines({ user, refreshKey }: { user: User; refreshKey: number }) {
  const tz = user.timezone;
  const [all, setAll] = useState<Deadline[] | null>(null);
  const [tab, setTab] = useState<Status>("PENDING");
  const [query, setQuery] = useState("");
  const [docId, setDocId] = useState("");
  const [range, setRange] = useState(0); // days; 0 = no limit
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setAll((await api<{ deadlines: Deadline[] }>("/api/deadlines?limit=200")).deadlines); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  async function act(path: string, init: RequestInit) {
    setError("");
    try { await api(path, init); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
  }
  const patch = (id: string, body: object) => act(`/api/deadlines/${id}`, { method: "PATCH", body: JSON.stringify(body) });

  const view = useMemo(() => {
    const list = all ?? [];
    const pending = list.filter((d) => d.status === "PENDING");
    const counts = { PENDING: pending.length, COMPLETED: list.filter((d) => d.status === "COMPLETED").length, EXPIRED: list.filter((d) => d.status === "EXPIRED").length };
    const today = pending.filter((d) => d.dueAt && dayDiff(d.dueAt, tz) <= 0).length;
    const week = pending.filter((d) => d.dueAt && dayDiff(d.dueAt, tz) <= 7).length;
    const q = query.trim().toLowerCase();
    const within = (d: Deadline, days: number) =>
      days === 0 || (!!d.dueAt && new Date(d.dueAt).getTime() - Date.now() <= days * 86_400_000);
    const rangeCounts = Object.fromEntries(RANGES.map(([days]) => [days, pending.filter((d) => within(d, days)).length]));
    const shown = list
      .filter((d) => d.status === tab && (tab !== "PENDING" || within(d, range)) && (!docId || d.document.id === docId) && (!q || d.event.toLowerCase().includes(q) || d.document.fileName.toLowerCase().includes(q)))
      .sort((a, b) => ((a.dueAt ?? a.date) < (b.dueAt ?? b.date) ? -1 : 1) * (tab === "PENDING" ? 1 : -1));
    const docs = [...new Map(list.map((d) => [d.document.id, d.document.fileName])).entries()];
    const order = { PENDING: 0, EXPIRED: 1, COMPLETED: 2 } as const;
    const overview = [...list].sort((a, b) => order[a.status] - order[b.status] || ((a.dueAt ?? a.date) < (b.dueAt ?? b.date) ? -1 : 1));
    return { counts, today, week, shown, docs, rangeCounts, overview };
  }, [all, tab, query, docId, range, tz]);

  const groups = tab === "PENDING" ? ["Today", "Tomorrow", "This week", "Later"] : [""];

  if (all === null) return <p className="muted">{error || "Loading…"}</p>;

  return (
    <section>
      <div className="stats">
        <div className={`stat ${view.today ? "hot" : ""}`}><b>{view.today}</b><span>Due today</span></div>
        <div className="stat"><b>{view.week}</b><span>Next 7 days</span></div>
        <div className="stat"><b>{view.counts.PENDING}</b><span>Pending</span></div>
        <div className="stat ok"><b>{view.counts.COMPLETED}</b><span>Done</span></div>
      </div>

      <div className="toolbar">
        <div className="tabs">
          {(["PENDING", "COMPLETED", "EXPIRED"] as Status[]).map((s) => (
            <button key={s} className={s === tab ? "tab active" : "tab"} onClick={() => setTab(s)}>
              {s[0] + s.slice(1).toLowerCase()} <small>{view.counts[s]}</small>
            </button>
          ))}
        </div>
        <input className="search" placeholder="Search deadlines…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {view.docs.length > 1 && (
          <select value={docId} onChange={(e) => setDocId(e.target.value)}>
            <option value="">All documents</option>
            {view.docs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
      </div>

      {tab === "PENDING" && (
        <div className="chips">
          {RANGES.map(([days, label]) => (
            <button key={days} className={range === days ? "chip active" : "chip"} onClick={() => setRange(days)}>
              {label} <small>{view.rangeCounts[days]}</small>
            </button>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {view.shown.length === 0 && (
        <p className="muted empty">{all.length === 0 ? "No deadlines yet. Upload a PDF in Documents to get started." : "Nothing matches here."}</p>
      )}

      {groups.map((g) => {
        const rows = view.shown.filter((d) => !g || groupOf(d, tz) === g);
        if (rows.length === 0) return null;
        return (
          <div key={g || "all"} className="group">
            {g && <h2 className="group-title">{g} <small>{rows.length}</small></h2>}
            {rows.map((d) => (
              <article key={d.id} className={`card deadline ${urgency(d)}`}>
                <div className="row">
                  <h3>{d.event}</h3>
                  {d.status === "PENDING" && d.dueAt
                    ? <span className={`pill ${urgency(d) || "pending"}`}>in {timeLeft(d.dueAt)}</span>
                    : <span className={`pill ${d.status.toLowerCase()}`}>{d.status.toLowerCase()}</span>}
                </div>
                <p className="when">
                  {d.dueAt
                    ? d.time
                      ? new Date(d.dueAt).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: tz })
                      : `${new Date(d.dueAt).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", timeZone: tz })} · any time that day`
                    : d.date}
                </p>
                <p className="muted small">📄 {d.document.fileName}</p>
                <div className="row actions">
                  {d.status === "PENDING" && <button className="primary" onClick={() => act(`/api/deadlines/${d.id}/complete`, { method: "POST" })}>✓ Mark done</button>}
                  {d.status === "COMPLETED" && <button onClick={() => act(`/api/deadlines/${d.id}/reopen`, { method: "POST" })}>Reopen</button>}
                  <button onClick={() => addToCalendar(d)}>📅 Add to calendar</button>
                  <button className="link" onClick={() => setOpen(open === d.id ? null : d.id)}>{open === d.id ? "Hide details" : "Details"}</button>
                </div>
                {open === d.id && (
                  <div className="details">
                    <p className="small"><span className="muted">Found in document:</span> “{d.evidence}”</p>
                    <p className="small muted">Confidence {Math.round(d.confidence * 100)}% · timezone {d.timezone}</p>
                    {d.status === "PENDING" && (
                      <div className="row controls">
                        <label>Remind me
                          <select value={d.reminderLeadMinutes} disabled={!d.time} title={d.time ? "" : "No time in document: reminders start at 9:00 AM on the day"}
                            onChange={(e) => patch(d.id, { reminderLeadMinutes: Number(e.target.value) })}>
                            {LEADS.map(([v, l]) => <option key={v} value={v}>{l} before</option>)}
                          </select>
                        </label>
                        <label>every
                          <select value={d.repeatIntervalMinutes} onChange={(e) => patch(d.id, { repeatIntervalMinutes: Number(e.target.value) })}>
                            {REPEATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </label>
                      </div>
                    )}
                    <button className="link danger" onClick={() => confirm("Delete this deadline?") && act(`/api/deadlines/${d.id}`, { method: "DELETE" })}>Delete deadline</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        );
      })}

      {view.overview.length > 0 && (
        <div className="card overview">
          <h2 className="group-title">All deadlines at a glance <small>{view.overview.length}</small></h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Deadline</th><th>Due</th><th>Left</th><th>Status</th><th>Document</th><th>Why (from the PDF)</th></tr></thead>
              <tbody>
                {view.overview.map((d) => (
                  <tr key={d.id} className={urgency(d)}>
                    <td><b>{d.event}</b></td>
                    <td>{d.dueAt ? new Date(d.dueAt).toLocaleString([], { day: "numeric", month: "short", ...(d.time ? { hour: "numeric", minute: "2-digit" } : {}), timeZone: tz }) : d.date}</td>
                    <td>{d.status === "PENDING" && d.dueAt ? timeLeft(d.dueAt) : "—"}</td>
                    <td><span className={`pill ${d.status === "PENDING" ? urgency(d) || "pending" : d.status.toLowerCase()}`}>{d.status.toLowerCase()}</span></td>
                    <td className="muted">{d.document.fileName}</td>
                    <td className="muted" title={d.evidence}>{d.evidence.length > 60 ? d.evidence.slice(0, 60) + "…" : d.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
