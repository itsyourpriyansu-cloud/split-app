import { calculateBalances, simplifySettlements } from "./settlement";

type MemberRow = { id: string; household_id: string; name: string; color: string; created_at: string };
type ExpenseRow = {
  id: string;
  paid_by_member_id: string;
  created_by_member_id: string;
  description: string;
  category: string;
  amount_minor: number;
  expense_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
type ShareRow = { expense_id: string; member_id: string; amount_minor: number };
type TransferRow = {
  id: string;
  from_member_id: string;
  to_member_id: string;
  amount_minor: number;
  transfer_date: string;
  note: string | null;
  created_at: string;
};
type SessionContext = { householdId: string; memberId: string };

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const MEMBER_COLORS = ["#6f7cff", "#f2789f", "#1da783", "#c977ed", "#e58c32", "#2488d8"];
const CATEGORIES = new Set(["groceries", "rent", "utilities", "food", "transport", "home", "other"]);

function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function now(): string {
  return new Date().toISOString();
}

function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function randomCode(length = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readBody<T>(request: Request): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 64_000) throw new Error("Request body is too large");
  return request.json<T>();
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function monthBounds(month: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, monthIndex] = month.split("-").map(Number);
  if (monthIndex < 1 || monthIndex > 12) return null;
  const start = `${year.toString().padStart(4, "0")}-${monthIndex.toString().padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, monthIndex, 1));
  const end = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const configured = env.ALLOWED_ORIGINS.split(",").map((item) => item.trim());
  if (configured.includes(origin)) return origin;
  if (/^https:\/\/roomie-ledger(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin)) return origin;
  return null;
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = allowedOrigin(request, env);
  return origin
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        Vary: "Origin",
      }
    : {};
}

async function getSession(request: Request, env: Env): Promise<SessionContext | null> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token.length !== 64) return null;
  const tokenHash = await sha256(token);
  const row = await env.ROOMIE_DB.prepare(
    "SELECT household_id, member_id FROM sessions WHERE token_hash = ? AND expires_at > ?",
  )
    .bind(tokenHash, now())
    .first<{ household_id: string; member_id: string }>();
  return row ? { householdId: row.household_id, memberId: row.member_id } : null;
}

async function createSession(env: Env, householdId: string, memberId: string): Promise<string> {
  const token = randomToken();
  const timestamp = now();
  const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  await env.ROOMIE_DB.prepare(
    "INSERT INTO sessions (id, token_hash, household_id, member_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), await sha256(token), householdId, memberId, expires, timestamp, timestamp)
    .run();
  return token;
}

async function setupHousehold(request: Request, env: Env): Promise<Response> {
  const body = await readBody<{ name?: string; memberNames?: string[]; currency?: string; timezone?: string }>(request);
  const name = cleanText(body.name, 60);
  const memberNames = Array.isArray(body.memberNames)
    ? [...new Set(body.memberNames.map((item) => cleanText(item, 40)).filter(Boolean))].slice(0, 6)
    : [];
  const currency = cleanText(body.currency, 3).toUpperCase() || "INR";
  const timezone = cleanText(body.timezone, 60) || "Asia/Kolkata";
  if (!name || memberNames.length < 2) return error("Add a household name and at least two different members");
  if (!/^[A-Z]{3}$/.test(currency)) return error("Currency must be a 3-letter code");

  const householdId = crypto.randomUUID();
  const joinCode = randomCode();
  const timestamp = now();
  const members = memberNames.map((memberName, index) => ({
    id: crypto.randomUUID(),
    householdId,
    name: memberName,
    color: MEMBER_COLORS[index % MEMBER_COLORS.length],
    createdAt: timestamp,
  }));
  await env.ROOMIE_DB.batch([
    env.ROOMIE_DB.prepare(
      "INSERT INTO households (id, name, join_code_hash, currency, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(householdId, name, await sha256(joinCode), currency, timezone, timestamp, timestamp),
    ...members.map((member) =>
      env.ROOMIE_DB.prepare(
        "INSERT INTO members (id, household_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(member.id, member.householdId, member.name, member.color, member.createdAt),
    ),
  ]);
  const token = await createSession(env, householdId, members[0].id);
  return json({ token, joinCode, memberId: members[0].id }, 201);
}

async function previewJoin(request: Request, env: Env): Promise<Response> {
  const code = normalizeCode(new URL(request.url).searchParams.get("code") ?? "");
  if (code.length !== 8) return error("Enter the 8-character home code");
  const household = await env.ROOMIE_DB.prepare("SELECT id, name FROM households WHERE join_code_hash = ?")
    .bind(await sha256(code))
    .first<{ id: string; name: string }>();
  if (!household) return error("That home code was not found", 404);
  const members = await env.ROOMIE_DB.prepare("SELECT id, name, color FROM members WHERE household_id = ? ORDER BY created_at")
    .bind(household.id)
    .all<{ id: string; name: string; color: string }>();
  return json({ householdName: household.name, members: members.results });
}

async function joinHousehold(request: Request, env: Env): Promise<Response> {
  const body = await readBody<{ joinCode?: string; memberId?: string }>(request);
  const code = normalizeCode(body.joinCode ?? "");
  const household = await env.ROOMIE_DB.prepare("SELECT id FROM households WHERE join_code_hash = ?")
    .bind(await sha256(code))
    .first<{ id: string }>();
  if (!household) return error("That home code was not found", 404);
  const member = await env.ROOMIE_DB.prepare("SELECT id FROM members WHERE id = ? AND household_id = ?")
    .bind(body.memberId ?? "", household.id)
    .first<{ id: string }>();
  if (!member) return error("Choose a valid household member", 404);
  const token = await createSession(env, household.id, member.id);
  return json({ token, memberId: member.id });
}

async function bootstrap(request: Request, env: Env, session: SessionContext): Promise<Response> {
  const month = new URL(request.url).searchParams.get("month") ?? now().slice(0, 7);
  const bounds = monthBounds(month);
  if (!bounds) return error("Month must use YYYY-MM format");
  const [householdResult, membersResult, expensesResult, sharesResult, transfersResult] = await env.ROOMIE_DB.batch([
    env.ROOMIE_DB.prepare("SELECT id, name, currency, timezone FROM households WHERE id = ?").bind(session.householdId),
    env.ROOMIE_DB.prepare("SELECT id, name, color, created_at FROM members WHERE household_id = ? ORDER BY created_at").bind(session.householdId),
    env.ROOMIE_DB.prepare(
      "SELECT id, paid_by_member_id, created_by_member_id, description, category, amount_minor, expense_date, notes, created_at, updated_at FROM expenses WHERE household_id = ? AND expense_date >= ? AND expense_date < ? AND deleted_at IS NULL ORDER BY expense_date DESC, created_at DESC LIMIT 500",
    ).bind(session.householdId, bounds.start, bounds.end),
    env.ROOMIE_DB.prepare(
      "SELECT s.expense_id, s.member_id, s.amount_minor FROM expense_shares s JOIN expenses e ON e.id = s.expense_id WHERE e.household_id = ? AND e.expense_date >= ? AND e.expense_date < ? AND e.deleted_at IS NULL",
    ).bind(session.householdId, bounds.start, bounds.end),
    env.ROOMIE_DB.prepare(
      "SELECT id, from_member_id, to_member_id, amount_minor, transfer_date, note, created_at FROM transfers WHERE household_id = ? AND transfer_date >= ? AND transfer_date < ? AND deleted_at IS NULL ORDER BY transfer_date DESC, created_at DESC",
    ).bind(session.householdId, bounds.start, bounds.end),
  ]);

  const household = householdResult.results[0] as { id: string; name: string; currency: string; timezone: string } | undefined;
  if (!household) return error("Household not found", 404);
  const members = membersResult.results as unknown as MemberRow[];
  const expenses = (expensesResult.results as unknown as ExpenseRow[]).map((expense) => ({
    id: expense.id,
    paidByMemberId: expense.paid_by_member_id,
    createdByMemberId: expense.created_by_member_id,
    description: expense.description,
    category: expense.category,
    amountMinor: expense.amount_minor,
    expenseDate: expense.expense_date,
    notes: expense.notes,
    createdAt: expense.created_at,
    updatedAt: expense.updated_at,
    shares: (sharesResult.results as unknown as ShareRow[])
      .filter((share) => share.expense_id === expense.id)
      .map((share) => ({ memberId: share.member_id, amountMinor: share.amount_minor })),
  }));
  const transfers = (transfersResult.results as unknown as TransferRow[]).map((transfer) => ({
    id: transfer.id,
    fromMemberId: transfer.from_member_id,
    toMemberId: transfer.to_member_id,
    amountMinor: transfer.amount_minor,
    transferDate: transfer.transfer_date,
    note: transfer.note,
    createdAt: transfer.created_at,
  }));
  const balances = calculateBalances({ memberIds: members.map((member) => member.id), expenses, transfers });
  const categoryTotals = Object.fromEntries(
    [...CATEGORIES].map((category) => [
      category,
      expenses.filter((expense) => expense.category === category).reduce((sum, expense) => sum + expense.amountMinor, 0),
    ]),
  );
  const dailyTotals: Record<string, number> = {};
  for (const expense of expenses) dailyTotals[expense.expenseDate] = (dailyTotals[expense.expenseDate] ?? 0) + expense.amountMinor;
  return json({
    household,
    currentMemberId: session.memberId,
    month,
    members: members.map((member) => ({ id: member.id, name: member.name, color: member.color })),
    expenses,
    transfers,
    summary: {
      totalSpentMinor: expenses.reduce((sum, expense) => sum + expense.amountMinor, 0),
      balances,
      settlements: simplifySettlements(balances),
      categoryTotals,
      dailyTotals,
    },
  });
}

async function createExpense(request: Request, env: Env, session: SessionContext): Promise<Response> {
  const body = await readBody<{
    description?: string;
    amountMinor?: number;
    category?: string;
    expenseDate?: string;
    paidByMemberId?: string;
    participantIds?: string[];
    notes?: string;
    clientMutationId?: string;
  }>(request);
  const description = cleanText(body.description, 100);
  const amountMinor = Number(body.amountMinor);
  const category = cleanText(body.category, 20);
  const participantIds = Array.isArray(body.participantIds) ? [...new Set(body.participantIds)].slice(0, 20) : [];
  const clientMutationId = cleanText(body.clientMutationId, 80) || request.headers.get("Idempotency-Key") || "";
  if (!description || !Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > 100_000_000) return error("Enter a valid description and amount");
  if (!CATEGORIES.has(category) || !isDate(body.expenseDate)) return error("Choose a valid category and date");
  if (!body.paidByMemberId || participantIds.length === 0 || !clientMutationId) return error("Choose a payer and at least one participant");

  const validMembers = await env.ROOMIE_DB.prepare(
    `SELECT id FROM members WHERE household_id = ? AND id IN (${[body.paidByMemberId, ...participantIds].map(() => "?").join(",")})`,
  )
    .bind(session.householdId, body.paidByMemberId, ...participantIds)
    .all<{ id: string }>();
  const validIds = new Set(validMembers.results.map((member) => member.id));
  if (!validIds.has(body.paidByMemberId) || participantIds.some((id) => !validIds.has(id))) return error("One or more selected members are invalid");

  const existing = await env.ROOMIE_DB.prepare("SELECT id FROM expenses WHERE household_id = ? AND client_mutation_id = ?")
    .bind(session.householdId, clientMutationId)
    .first<{ id: string }>();
  if (existing) return json({ id: existing.id, duplicate: true });

  const id = crypto.randomUUID();
  const timestamp = now();
  const baseShare = Math.floor(amountMinor / participantIds.length);
  const remainder = amountMinor % participantIds.length;
  const shares = participantIds.map((memberId, index) => ({ memberId, amountMinor: baseShare + (index < remainder ? 1 : 0) }));
  await env.ROOMIE_DB.batch([
    env.ROOMIE_DB.prepare(
      "INSERT INTO expenses (id, household_id, paid_by_member_id, created_by_member_id, description, category, amount_minor, expense_date, notes, client_mutation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, session.householdId, body.paidByMemberId, session.memberId, description, category, amountMinor, body.expenseDate, cleanText(body.notes, 400) || null, clientMutationId, timestamp, timestamp),
    ...shares.map((share) =>
      env.ROOMIE_DB.prepare("INSERT INTO expense_shares (expense_id, member_id, amount_minor) VALUES (?, ?, ?)").bind(id, share.memberId, share.amountMinor),
    ),
    env.ROOMIE_DB.prepare(
      "INSERT INTO audit_events (id, household_id, actor_member_id, action, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, 'created', 'expense', ?, ?, ?)",
    ).bind(crypto.randomUUID(), session.householdId, session.memberId, id, JSON.stringify({ description, amountMinor }), timestamp),
  ]);
  return json({ id }, 201);
}

async function deleteExpense(env: Env, session: SessionContext, expenseId: string): Promise<Response> {
  const timestamp = now();
  const result = await env.ROOMIE_DB.batch([
    env.ROOMIE_DB.prepare("UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ? AND household_id = ? AND deleted_at IS NULL").bind(timestamp, timestamp, expenseId, session.householdId),
    env.ROOMIE_DB.prepare(
      "INSERT INTO audit_events (id, household_id, actor_member_id, action, entity_type, entity_id, created_at) SELECT ?, ?, ?, 'deleted', 'expense', ?, ? WHERE EXISTS (SELECT 1 FROM expenses WHERE id = ? AND household_id = ?)",
    ).bind(crypto.randomUUID(), session.householdId, session.memberId, expenseId, timestamp, expenseId, session.householdId),
  ]);
  return result[0].meta.changes ? new Response(null, { status: 204 }) : error("Expense not found", 404);
}

async function createTransfer(request: Request, env: Env, session: SessionContext): Promise<Response> {
  const body = await readBody<{
    fromMemberId?: string;
    toMemberId?: string;
    amountMinor?: number;
    transferDate?: string;
    note?: string;
    clientMutationId?: string;
  }>(request);
  const amountMinor = Number(body.amountMinor);
  const clientMutationId = cleanText(body.clientMutationId, 80) || request.headers.get("Idempotency-Key") || "";
  if (!body.fromMemberId || !body.toMemberId || body.fromMemberId === body.toMemberId) return error("Choose two different members");
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || !isDate(body.transferDate) || !clientMutationId) return error("Enter a valid transfer amount and date");
  const memberCheck = await env.ROOMIE_DB.prepare("SELECT COUNT(*) AS count FROM members WHERE household_id = ? AND id IN (?, ?)")
    .bind(session.householdId, body.fromMemberId, body.toMemberId)
    .first<{ count: number }>();
  if (memberCheck?.count !== 2) return error("One or more selected members are invalid");
  const existing = await env.ROOMIE_DB.prepare("SELECT id FROM transfers WHERE household_id = ? AND client_mutation_id = ?")
    .bind(session.householdId, clientMutationId)
    .first<{ id: string }>();
  if (existing) return json({ id: existing.id, duplicate: true });
  const id = crypto.randomUUID();
  const timestamp = now();
  await env.ROOMIE_DB.batch([
    env.ROOMIE_DB.prepare(
      "INSERT INTO transfers (id, household_id, from_member_id, to_member_id, amount_minor, transfer_date, note, client_mutation_id, created_by_member_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, session.householdId, body.fromMemberId, body.toMemberId, amountMinor, body.transferDate, cleanText(body.note, 200) || null, clientMutationId, session.memberId, timestamp),
    env.ROOMIE_DB.prepare(
      "INSERT INTO audit_events (id, household_id, actor_member_id, action, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, 'created', 'transfer', ?, ?, ?)",
    ).bind(crypto.randomUUID(), session.householdId, session.memberId, id, JSON.stringify({ amountMinor }), timestamp),
  ]);
  return json({ id }, 201);
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "roomie-ledger-api" });
  if (request.method === "POST" && url.pathname === "/v1/households") return setupHousehold(request, env);
  if (request.method === "GET" && url.pathname === "/v1/join/preview") return previewJoin(request, env);
  if (request.method === "POST" && url.pathname === "/v1/sessions") return joinHousehold(request, env);

  const session = await getSession(request, env);
  if (!session) return error("Your session is missing or expired", 401);
  if (request.method === "GET" && url.pathname === "/v1/bootstrap") return bootstrap(request, env, session);
  if (request.method === "POST" && url.pathname === "/v1/expenses") return createExpense(request, env, session);
  if (request.method === "POST" && url.pathname === "/v1/transfers") return createTransfer(request, env, session);
  const expenseMatch = url.pathname.match(/^\/v1\/expenses\/([a-f0-9-]+)$/i);
  if (request.method === "DELETE" && expenseMatch) return deleteExpense(env, session, expenseMatch[1]);
  return error("Route not found", 404);
}

export default {
  async fetch(request, env): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (request.headers.has("Origin") && !allowedOrigin(request, env)) return error("Origin is not allowed", 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const response = await route(request, env);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(cors)) headers.set(key, String(value));
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "no-referrer");
      return new Response(response.body, { status: response.status, headers });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unknown error";
      console.error(JSON.stringify({ message: "request failed", error: message, path: new URL(request.url).pathname }));
      const response = error(message.includes("JSON") ? "Invalid JSON request" : "Something went wrong", message.includes("JSON") ? 400 : 500);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(cors)) headers.set(key, String(value));
      return new Response(response.body, { status: response.status, headers });
    }
  },
} satisfies ExportedHandler<Env>;
