const BASE = import.meta.env.VITE_API_URL ?? "";
const KEY = "actionlens_token";

export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY);

export interface User { id: string; name: string; email: string; timezone: string }
export interface Deadline {
  id: string; event: string; date: string; time: string | null; timezone: string | null;
  evidence: string; confidence: number; status: "PENDING" | "COMPLETED" | "EXPIRED";
  reminderLeadMinutes: number; repeatIntervalMinutes: number; nextReminderAt: string | null;
  dueAt: string | null; document: { id: string; fileName: string };
}
export interface Doc {
  id: string; fileName: string; status: "PROCESSING" | "COMPLETED" | "FAILED";
  createdAt: string; _count: { deadlines: number };
}
export interface Notification {
  id: string; title: string; message: string; readAt: string | null; createdAt: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message ?? `Request failed (${res.status})`, data.code);
  return data as T;
}

export const streamUrl = () => `${BASE}/api/notifications/stream?token=${getToken()}`;
