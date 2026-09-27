import type { Bootstrap, Member } from "../types";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:8788";
const TOKEN_KEY = "roomie-ledger:token";
const CACHE_KEY = "roomie-ledger:last-view";
const OUTBOX_KEY = "roomie-ledger:outbox";

type QueuedMutation = { id: string; path: string; method: "POST" | "DELETE"; body?: unknown; createdAt: string };

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function signOut(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CACHE_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(payload.error || "Request failed", response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function getOutbox(): QueuedMutation[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]") as QueuedMutation[];
  } catch {
    return [];
  }
}

function setOutbox(items: QueuedMutation[]): void {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("roomie-outbox"));
}

async function mutate<T>(path: string, method: "POST" | "DELETE", body?: unknown): Promise<T | { queued: true }> {
  try {
    return await request<T>(path, { method, body: body ? JSON.stringify(body) : undefined });
  } catch (caught) {
    if (caught instanceof ApiError) throw caught;
    const item: QueuedMutation = { id: crypto.randomUUID(), path, method, body, createdAt: new Date().toISOString() };
    setOutbox([...getOutbox(), item]);
    return { queued: true };
  }
}

export const api = {
  url: API_URL,
  setup: (body: { name: string; memberNames: string[]; currency: string; timezone: string }) =>
    request<{ token: string; joinCode: string; memberId: string }>("/v1/households", { method: "POST", body: JSON.stringify(body) }),
  previewJoin: (code: string) =>
    request<{ householdName: string; members: Member[] }>(`/v1/join/preview?code=${encodeURIComponent(code)}`),
  join: (joinCode: string, memberId: string) =>
    request<{ token: string; memberId: string }>("/v1/sessions", { method: "POST", body: JSON.stringify({ joinCode, memberId }) }),
  bootstrap: async (month: string): Promise<Bootstrap> => {
    try {
      const data = await request<Bootstrap>(`/v1/bootstrap?month=${month}`);
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      return data;
    } catch (caught) {
      if (!(caught instanceof ApiError)) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) return { ...(JSON.parse(cached) as Bootstrap), month };
      }
      throw caught;
    }
  },
  createExpense: (body: unknown) => mutate<{ id: string }>("/v1/expenses", "POST", body),
  createTransfer: (body: unknown) => mutate<{ id: string }>("/v1/transfers", "POST", body),
  deleteExpense: (id: string) => mutate<void>(`/v1/expenses/${id}`, "DELETE"),
  flushOutbox: async (): Promise<number> => {
    const pending = getOutbox();
    const remaining: QueuedMutation[] = [];
    for (const item of pending) {
      try {
        await request(item.path, { method: item.method, body: item.body ? JSON.stringify(item.body) : undefined });
      } catch {
        remaining.push(item);
      }
    }
    setOutbox(remaining);
    return remaining.length;
  },
  outboxCount: () => getOutbox().length,
};
