export type Member = { id: string; name: string; color: string };
export type Expense = {
  id: string;
  paidByMemberId: string;
  createdByMemberId: string;
  description: string;
  category: Category;
  amountMinor: number;
  expenseDate: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  shares: Array<{ memberId: string; amountMinor: number }>;
};
export type Transfer = {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  transferDate: string;
  note: string | null;
  createdAt: string;
};
export type Category = "groceries" | "rent" | "utilities" | "food" | "transport" | "home" | "other";
export type Bootstrap = {
  household: { id: string; name: string; currency: string; timezone: string };
  currentMemberId: string;
  month: string;
  members: Member[];
  expenses: Expense[];
  transfers: Transfer[];
  summary: {
    totalSpentMinor: number;
    balances: Record<string, number>;
    settlements: Array<{ fromMemberId: string; toMemberId: string; amountMinor: number }>;
    categoryTotals: Record<Category, number>;
    dailyTotals: Record<string, number>;
  };
};
