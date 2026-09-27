import { describe, expect, it } from "vitest";
import { calculateBalances, simplifySettlements } from "./settlement";

describe("settlement engine", () => {
  it("splits an expense and subtracts a partial repayment", () => {
    const balances = calculateBalances({
      memberIds: ["a", "b"],
      expenses: [{ paidByMemberId: "a", shares: [{ memberId: "a", amountMinor: 5000 }, { memberId: "b", amountMinor: 5000 }] }],
      transfers: [{ fromMemberId: "b", toMemberId: "a", amountMinor: 2000 }],
    });
    expect(balances).toEqual({ a: 3000, b: -3000 });
    expect(simplifySettlements(balances)).toEqual([{ fromMemberId: "b", toMemberId: "a", amountMinor: 3000 }]);
  });

  it("simplifies a three-person balance without losing a cent", () => {
    const settlements = simplifySettlements({ a: 6500, b: -2500, c: -4000 });
    expect(settlements).toEqual([
      { fromMemberId: "c", toMemberId: "a", amountMinor: 4000 },
      { fromMemberId: "b", toMemberId: "a", amountMinor: 2500 },
    ]);
  });
});
