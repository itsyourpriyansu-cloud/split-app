import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  CloudOff,
  Copy,
  Home,
  LoaderCircle,
  Plus,
  ReceiptText,
  Settings,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { api, ApiError, getToken, saveToken, signOut } from "./lib/api";
import { formatMoney, monthLabel, today } from "./lib/money";
import type { Bootstrap, Category, Expense, Member } from "./types";

type Tab = "home" | "activity" | "insights" | "settings";
type InstallPrompt = Event & { prompt: () => Promise<void> };
const categories: Array<{ value: Category; label: string; glyph: string }> = [
  { value: "groceries", label: "Groceries", glyph: "G" },
  { value: "rent", label: "Rent", glyph: "R" },
  { value: "utilities", label: "Utilities", glyph: "U" },
  { value: "food", label: "Eating out", glyph: "E" },
  { value: "transport", label: "Transport", glyph: "T" },
  { value: "home", label: "Home", glyph: "H" },
  { value: "other", label: "Other", glyph: "O" },
];

function memberName(members: Member[], id: string): string {
  return members.find((member) => member.id === id)?.name ?? "Someone";
}

function shiftMonth(month: string, amount: number): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const next = new Date(year, monthIndex - 1 + amount, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-handle" />
        <header className="sheet-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Onboarding({ onReady }: { onReady: (joinCode?: string) => void }) {
  const [mode, setMode] = useState<"welcome" | "create" | "join">("welcome");
  const [homeName, setHomeName] = useState("Our apartment");
  const [names, setNames] = useState(["", ""]);
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<{ householdName: string; members: Member[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function createHome(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const result = await api.setup({
        name: homeName,
        memberNames: names,
        currency: "INR",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
      });
      saveToken(result.token);
      localStorage.setItem("roomie-ledger:join-code", result.joinCode);
      onReady(result.joinCode);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not create your home");
    } finally { setBusy(false); }
  }

  async function findHome(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try { setPreview(await api.previewJoin(code)); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "Could not find that home"); }
    finally { setBusy(false); }
  }

  async function chooseMember(memberId: string) {
    setBusy(true); setMessage("");
    try {
      const result = await api.join(code, memberId);
      saveToken(result.token);
      localStorage.setItem("roomie-ledger:join-code", code.toUpperCase());
      onReady();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Could not join"); }
    finally { setBusy(false); }
  }

  return (
    <main className="onboarding">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <div className="brand-mark"><WalletCards size={24} /><span>Roomie Ledger</span></div>
      {mode === "welcome" && (
        <section className="welcome-card reveal">
          <div className="welcome-visual" aria-hidden="true">
            <div className="visual-card visual-card-back"><span>Monthly split</span><strong>Clear.</strong></div>
            <div className="visual-card visual-card-front"><span>Your balance</span><strong>₹1,240</strong><i>Settled simply</i></div>
          </div>
          <div>
            <p className="eyebrow">Shared living, without the awkward maths</p>
            <h1>Every expense.<br />Everyone even.</h1>
            <p className="lede">Add what you spend, see the day-by-day picture, and know exactly who should pay whom.</p>
            <button className="button button-primary button-wide" onClick={() => setMode("create")}>Create a home <ArrowRight size={18} /></button>
            <button className="button button-quiet button-wide" onClick={() => setMode("join")}>Join with a home code</button>
          </div>
        </section>
      )}
      {mode === "create" && (
        <section className="auth-card reveal">
          <button className="back-button" onClick={() => setMode("welcome")}><ArrowLeft size={18} /> Back</button>
          <p className="eyebrow">Set up your shared space</p><h1>Name your home</h1>
          <p className="muted">You’ll get a private code to share with your roommate.</p>
          <form onSubmit={createHome} className="form-stack">
            <label>Home name<input value={homeName} onChange={(event) => setHomeName(event.target.value)} maxLength={60} required /></label>
            <div className="form-section"><span>Who lives here?</span>
              {names.map((name, index) => (
                <label className="member-input" key={index}><span style={{ background: ["#6f7cff", "#f2789f", "#1da783", "#c977ed"][index] }}>{index + 1}</span><input placeholder={index === 0 ? "Your name" : "Roommate's name"} value={name} onChange={(event) => setNames(names.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} required /></label>
              ))}
              {names.length < 6 && <button type="button" className="text-button" onClick={() => setNames([...names, ""])}>+ Add another roommate</button>}
            </div>
            {message && <p className="error-message">{message}</p>}
            <button className="button button-primary button-wide" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : "Create home"}</button>
          </form>
        </section>
      )}
      {mode === "join" && (
        <section className="auth-card reveal">
          <button className="back-button" onClick={() => { setMode("welcome"); setPreview(null); }}><ArrowLeft size={18} /> Back</button>
          <p className="eyebrow">Already invited?</p><h1>{preview ? `Who are you?` : "Enter your home code"}</h1>
          {!preview ? (
            <form onSubmit={findHome} className="form-stack">
              <label>8-character code<input className="code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} placeholder="ABCD2345" required /></label>
              {message && <p className="error-message">{message}</p>}
              <button className="button button-primary button-wide" disabled={busy || code.length !== 8}>{busy ? <LoaderCircle className="spin" size={18} /> : "Find my home"}</button>
            </form>
          ) : (
            <div className="member-picker"><p className="muted">Joining {preview.householdName}</p>{preview.members.map((member) => (
              <button key={member.id} onClick={() => chooseMember(member.id)} disabled={busy}><span className="avatar" style={{ background: member.color }}>{member.name[0].toUpperCase()}</span><span>{member.name}</span><ChevronRight size={19} /></button>
            ))}{message && <p className="error-message">{message}</p>}</div>
          )}
        </section>
      )}
    </main>
  );
}

function ExpenseSheet({ data, onClose, onSaved }: { data: Bootstrap; onClose: () => void; onSaved: (queued: boolean) => void }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>("groceries");
  const [date, setDate] = useState(today());
  const [payer, setPayer] = useState(data.currentMemberId);
  const [participants, setParticipants] = useState(data.members.map((member) => member.id));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await api.createExpense({
        description, amountMinor: Math.round(Number(amount) * 100), category, expenseDate: date,
        paidByMemberId: payer, participantIds: participants, clientMutationId: crypto.randomUUID(),
      });
      onSaved("queued" in result);
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Could not save expense"); }
    finally { setBusy(false); }
  }

  return <Sheet title="Add an expense" onClose={onClose}><form onSubmit={submit} className="form-stack sheet-form">
    <label className="amount-field"><span>Amount</span><div><b>₹</b><input inputMode="decimal" placeholder="0" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} autoFocus required /></div></label>
    <label>What was it for?<input placeholder="Groceries, electricity, dinner…" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={100} required /></label>
    <div className="form-section"><span>Category</span><div className="category-grid">{categories.map((item) => <button type="button" key={item.value} className={category === item.value ? "active" : ""} onClick={() => setCategory(item.value)}><i>{item.glyph}</i><span>{item.label}</span></button>)}</div></div>
    <div className="two-fields"><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>Paid by<select value={payer} onChange={(event) => setPayer(event.target.value)}>{data.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label></div>
    <div className="form-section"><span>Split equally with</span><div className="split-members">{data.members.map((member) => { const selected = participants.includes(member.id); return <button type="button" key={member.id} className={selected ? "selected" : ""} onClick={() => setParticipants(selected ? participants.filter((id) => id !== member.id) : [...participants, member.id])}><span className="avatar avatar-small" style={{ background: member.color }}>{member.name[0]}</span>{member.name}{selected && <Check size={15} />}</button>; })}</div></div>
    {message && <p className="error-message">{message}</p>}
    <button className="button button-primary button-wide" disabled={busy || !participants.length}>{busy ? <LoaderCircle className="spin" size={18} /> : "Save expense"}</button>
  </form></Sheet>;
}

function SettleSheet({ data, onClose, onSaved }: { data: Bootstrap; onClose: () => void; onSaved: (queued: boolean) => void }) {
  const suggested = data.summary.settlements[0];
  const [fromId, setFromId] = useState(suggested?.fromMemberId ?? data.currentMemberId);
  const [toId, setToId] = useState(suggested?.toMemberId ?? data.members.find((member) => member.id !== data.currentMemberId)?.id ?? "");
  const [amount, setAmount] = useState(suggested ? String(suggested.amountMinor / 100) : "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await api.createTransfer({ fromMemberId: fromId, toMemberId: toId, amountMinor: Math.round(Number(amount) * 100), transferDate: today(), clientMutationId: crypto.randomUUID() });
      onSaved("queued" in result);
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Could not record payment"); }
    finally { setBusy(false); }
  }
  return <Sheet title="Record a payment" onClose={onClose}><form onSubmit={submit} className="form-stack sheet-form"><p className="muted">Use this after money has actually changed hands. It reduces the outstanding balance.</p><div className="two-fields"><label>From<select value={fromId} onChange={(event) => setFromId(event.target.value)}>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label>To<select value={toId} onChange={(event) => setToId(event.target.value)}>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label></div><label className="amount-field"><span>Amount paid</span><div><b>₹</b><input inputMode="decimal" placeholder="0" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} required /></div></label>{message && <p className="error-message">{message}</p>}<button className="button button-primary button-wide" disabled={busy || fromId === toId}>{busy ? <LoaderCircle className="spin" size={18} /> : "Record payment"}</button></form></Sheet>;
}

function ExpenseRow({ expense, data, onDelete }: { expense: Expense; data: Bootstrap; onDelete?: (id: string) => void }) {
  const category = categories.find((item) => item.value === expense.category)!;
  return <article className="expense-row"><div className={`category-icon category-${expense.category}`}>{category.glyph}</div><div className="expense-copy"><strong>{expense.description}</strong><span>{memberName(data.members, expense.paidByMemberId)} paid · {category.label}</span></div><div className="expense-money"><strong>{formatMoney(expense.amountMinor, data.household.currency)}</strong>{onDelete && <button onClick={() => onDelete(expense.id)} aria-label={`Delete ${expense.description}`}><Trash2 size={15} /></button>}</div></article>;
}

function HomeView({ data, onAdd, onSettle }: { data: Bootstrap; onAdd: () => void; onSettle: () => void }) {
  const me = data.members.find((member) => member.id === data.currentMemberId)!;
  const myBalance = data.summary.balances[data.currentMemberId] ?? 0;
  const recent = data.expenses.slice(0, 4);
  const todayTotal = data.summary.dailyTotals[today()] ?? 0;
  return <div className="view reveal"><section className="balance-card"><div className="balance-top"><div><span>Your balance</span><strong>{myBalance === 0 ? "All settled" : formatMoney(Math.abs(myBalance), data.household.currency)}</strong><p>{myBalance > 0 ? "You are owed" : myBalance < 0 ? "You owe this month" : "Nothing to pay right now"}</p></div><div className={`balance-orb ${myBalance >= 0 ? "positive" : "negative"}`}><span>{myBalance >= 0 ? <ArrowDownLeft size={21} /> : <ArrowUpRight size={21} />}</span></div></div><div className="balance-actions"><button onClick={onAdd}><Plus size={18} /> Add expense</button><button onClick={onSettle}>Settle up</button></div></section><section className="snapshot-grid"><div><span>Spent this month</span><strong>{formatMoney(data.summary.totalSpentMinor, data.household.currency, true)}</strong></div><div><span>Spent today</span><strong>{formatMoney(todayTotal, data.household.currency, true)}</strong></div></section><section className="section-block"><div className="section-heading"><div><h2>Who owes what</h2><p>Live after every expense</p></div></div><div className="balance-list">{data.members.map((member) => { const balance = data.summary.balances[member.id] ?? 0; return <div key={member.id}><span className="avatar" style={{ background: member.color }}>{member.name[0]}</span><div><strong>{member.id === me.id ? "You" : member.name}</strong><span>{balance > 0 ? "gets back" : balance < 0 ? "needs to pay" : "is even"}</span></div><b className={balance > 0 ? "money-positive" : balance < 0 ? "money-negative" : ""}>{formatMoney(Math.abs(balance), data.household.currency)}</b></div>; })}</div></section><section className="section-block"><div className="section-heading"><div><h2>Recent activity</h2><p>{data.expenses.length ? `${data.expenses.length} expenses in ${monthLabel(data.month)}` : "A clean slate"}</p></div></div>{recent.length ? <div className="expense-list">{recent.map((expense) => <ExpenseRow key={expense.id} expense={expense} data={data} />)}</div> : <EmptyState title="No expenses yet" copy="Add the first shared expense and the balances will appear here." />}</section></div>;
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="empty-state"><ReceiptText size={28} /><strong>{title}</strong><p>{copy}</p></div>;
}

function ActivityView({ data, onDelete }: { data: Bootstrap; onDelete: (id: string) => void }) {
  const grouped = useMemo(() => Object.entries(data.expenses.reduce<Record<string, Expense[]>>((acc, expense) => { (acc[expense.expenseDate] ||= []).push(expense); return acc; }, {})), [data.expenses]);
  return <div className="view reveal"><section className="section-block no-top"><div className="section-heading"><div><h2>Activity</h2><p>Every shared cost, day by day</p></div></div>{grouped.length ? grouped.map(([date, expenses]) => <div className="day-group" key={date}><div className="day-label"><span>{new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`))}</span><b>{formatMoney(expenses.reduce((sum, expense) => sum + expense.amountMinor, 0), data.household.currency)}</b></div><div className="expense-list">{expenses.map((expense) => <ExpenseRow key={expense.id} expense={expense} data={data} onDelete={onDelete} />)}</div></div>) : <EmptyState title="No activity this month" copy="Move to another month or add an expense." />}</section></div>;
}

function InsightsView({ data }: { data: Bootstrap }) {
  const entries = categories.map((category) => ({ ...category, amount: data.summary.categoryTotals[category.value] ?? 0 })).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount);
  const max = Math.max(...entries.map((item) => item.amount), 1);
  const days = Object.entries(data.summary.dailyTotals).sort(([a], [b]) => a.localeCompare(b)).slice(-14);
  const dailyMax = Math.max(...days.map(([, value]) => value), 1);
  return <div className="view reveal"><section className="insight-hero"><span>Total shared spend</span><strong>{formatMoney(data.summary.totalSpentMinor, data.household.currency)}</strong><p>{data.expenses.length} expense{data.expenses.length === 1 ? "" : "s"} in {monthLabel(data.month)}</p></section><section className="section-block"><div className="section-heading"><div><h2>Spending rhythm</h2><p>Last active days</p></div></div>{days.length ? <div className="daily-bars">{days.map(([date, value]) => <div key={date} title={`${date}: ${formatMoney(value, data.household.currency)}`}><i style={{ height: `${Math.max(10, (value / dailyMax) * 100)}%` }} /><span>{Number(date.slice(-2))}</span></div>)}</div> : <EmptyState title="No pattern yet" copy="Daily trends will build as you add expenses." />}</section><section className="section-block"><div className="section-heading"><div><h2>By category</h2><p>Where the money went</p></div></div><div className="category-bars">{entries.map((item) => <div key={item.value}><div><span>{item.label}</span><b>{formatMoney(item.amount, data.household.currency)}</b></div><i><span style={{ width: `${(item.amount / max) * 100}%` }} /></i></div>)}{!entries.length && <EmptyState title="Nothing to compare" copy="Your category breakdown will show here." />}</div></section></div>;
}

function SettingsView({ data, installPrompt, onInstall, onSignOut }: { data: Bootstrap; installPrompt: InstallPrompt | null; onInstall: () => void; onSignOut: () => void }) {
  const code = localStorage.getItem("roomie-ledger:join-code") ?? "Unavailable";
  const [copied, setCopied] = useState(false);
  async function copyCode() { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }
  return <div className="view reveal"><section className="profile-card"><div className="home-avatar"><Home size={25} /></div><h2>{data.household.name}</h2><p>{data.members.length} members · {data.household.currency}</p></section><section className="settings-group"><h3>Invite a roommate</h3><button className="setting-row" onClick={copyCode}><div><span>Home code</span><strong className="join-code">{code}</strong></div>{copied ? <Check size={20} /> : <Copy size={20} />}</button></section><section className="settings-group"><h3>This device</h3>{installPrompt && <button className="setting-row" onClick={onInstall}><div><span>Install app</span><strong>Add Roomie Ledger to your home screen</strong></div><Plus size={20} /></button>}<div className="setting-row static"><div><span>Offline safety</span><strong>Unsynced changes retry when you reconnect</strong></div><Check size={20} /></div><div className="setting-row static"><div><span>Cloud storage</span><strong>Separate D1 database with point-in-time recovery</strong></div><Check size={20} /></div></section><button className="button button-danger button-wide" onClick={onSignOut}>Sign out on this device</button></div>;
}

function Dashboard({ onSignedOut }: { onSignedOut: () => void }) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [data, setData] = useState<Bootstrap | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [sheet, setSheet] = useState<"expense" | "settle" | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [outbox, setOutbox] = useState(api.outboxCount());
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setMessage("");
    try { setData(await api.bootstrap(month)); }
    catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { signOut(); onSignedOut(); return; }
      setMessage(caught instanceof Error ? caught.message : "Could not load the household");
    } finally { setLoading(false); }
  }, [month, onSignedOut]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const online = async () => { setOffline(false); const left = await api.flushOutbox(); setOutbox(left); if (!left) void load(); };
    const offlineHandler = () => setOffline(true);
    const outboxHandler = () => setOutbox(api.outboxCount());
    const installHandler = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    window.addEventListener("online", online); window.addEventListener("offline", offlineHandler); window.addEventListener("roomie-outbox", outboxHandler); window.addEventListener("beforeinstallprompt", installHandler);
    if (navigator.onLine) void online();
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offlineHandler); window.removeEventListener("roomie-outbox", outboxHandler); window.removeEventListener("beforeinstallprompt", installHandler); };
  }, [load]);

  async function saved(queued: boolean) { setSheet(null); setOutbox(api.outboxCount()); setMessage(queued ? "Saved safely on this phone. It will sync when you are online." : "Saved"); if (!queued) await load(); setTimeout(() => setMessage(""), 3500); }
  async function deleteExpense(id: string) { if (!window.confirm("Remove this expense? The audit history will be kept.")) return; const result = await api.deleteExpense(id); setMessage(result && "queued" in result ? "Removal queued for sync" : "Expense removed"); await load(); }
  async function install() { await installPrompt?.prompt(); setInstallPrompt(null); }

  if (loading && !data) return <div className="app-loader"><div className="brand-mark"><WalletCards size={24} /><span>Roomie Ledger</span></div><LoaderCircle className="spin" size={28} /></div>;
  if (!data) return <div className="app-loader"><p className="error-message">{message || "Could not open the app"}</p><button className="button button-primary" onClick={load}>Try again</button></div>;
  const me = data.members.find((member) => member.id === data.currentMemberId)!;
  return <main className="app-shell"><header className="app-header"><div><p>{data.household.name}</p><h1>{tab === "home" ? `Hi, ${me.name}` : tab[0].toUpperCase() + tab.slice(1)}</h1></div><button className="profile-button" onClick={() => setTab("settings")} style={{ background: me.color }}>{me.name[0]}</button></header><div className="month-switcher"><button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft size={18} /></button><strong>{monthLabel(month)}</strong><button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= today().slice(0, 7)} aria-label="Next month"><ChevronRight size={18} /></button></div>{(offline || outbox > 0) && <div className="sync-banner"><CloudOff size={16} /><span>{offline ? "Offline" : "Syncing"} · {outbox} change{outbox === 1 ? "" : "s"} waiting</span></div>}{message && <div className="toast">{message}</div>}<div className="content-scroll">{tab === "home" && <HomeView data={data} onAdd={() => setSheet("expense")} onSettle={() => setSheet("settle")} />}{tab === "activity" && <ActivityView data={data} onDelete={deleteExpense} />}{tab === "insights" && <InsightsView data={data} />}{tab === "settings" && <SettingsView data={data} installPrompt={installPrompt} onInstall={install} onSignOut={() => { signOut(); onSignedOut(); }} />}</div><nav className="bottom-nav">{([{ id: "home", label: "Home", icon: Home }, { id: "activity", label: "Activity", icon: ReceiptText }, { id: "insights", label: "Insights", icon: BarChart3 }, { id: "settings", label: "Settings", icon: Settings }] as const).map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><item.icon size={21} /><span>{item.label}</span></button>)}</nav><button className="fab" onClick={() => setSheet("expense")} aria-label="Add expense"><Plus size={26} /></button>{sheet === "expense" && <ExpenseSheet data={data} onClose={() => setSheet(null)} onSaved={saved} />}{sheet === "settle" && <SettleSheet data={data} onClose={() => setSheet(null)} onSaved={saved} />}</main>;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(Boolean(getToken()));
  return authenticated ? <Dashboard onSignedOut={() => setAuthenticated(false)} /> : <Onboarding onReady={() => setAuthenticated(true)} />;
}
