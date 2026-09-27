export type BalanceInput = {
  memberIds: string[];
  expenses: Array<{ paidByMemberId: string; shares: Array<{ memberId: string; amountMinor: number }> }>;
  transfers: Array<{ fromMemberId: string; toMemberId: string; amountMinor: number }>;
};

export type Settlement = { fromMemberId: string; toMemberId: string; amountMinor: number };

export function calculateBalances(input: BalanceInput): Record<string, number> {
  const balances = Object.fromEntries(input.memberIds.map((id) => [id, 0]));
  for (const expense of input.expenses) {
    const total = expense.shares.reduce((sum, share) => sum + share.amountMinor, 0);
    balances[expense.paidByMemberId] = (balances[expense.paidByMemberId] ?? 0) + total;
    for (const share of expense.shares) {
      balances[share.memberId] = (balances[share.memberId] ?? 0) - share.amountMinor;
    }
  }
  for (const transfer of input.transfers) {
    balances[transfer.fromMemberId] = (balances[transfer.fromMemberId] ?? 0) + transfer.amountMinor;
    balances[transfer.toMemberId] = (balances[transfer.toMemberId] ?? 0) - transfer.amountMinor;
  }
  return balances;
}

export function simplifySettlements(balances: Record<string, number>): Settlement[] {
  const creditors = Object.entries(balances)
    .filter(([, amount]) => amount > 0)
    .map(([memberId, amount]) => ({ memberId, amount }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = Object.entries(balances)
    .filter(([, amount]) => amount < 0)
    .map(([memberId, amount]) => ({ memberId, amount: -amount }))
    .sort((a, b) => b.amount - a.amount);

  const result: Settlement[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amountMinor = Math.min(creditor.amount, debtor.amount);
    if (amountMinor > 0) {
      result.push({ fromMemberId: debtor.memberId, toMemberId: creditor.memberId, amountMinor });
    }
    creditor.amount -= amountMinor;
    debtor.amount -= amountMinor;
    if (creditor.amount === 0) creditorIndex += 1;
    if (debtor.amount === 0) debtorIndex += 1;
  }
  return result;
}
