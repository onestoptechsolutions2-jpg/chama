export type ReserveMovement = { ok: true; newBalance: number } | { ok: false; error: string };

/**
 * The single place a reserve balance is computed, in either direction.
 * Rejects a movement that would take the reserve negative unless the
 * policy's allowOverdraft flag is on — no negative balances by default,
 * per the spec's "do not allow negative balances unless explicitly enabled".
 */
export function applyReserveMovement(
  currentBalance: number,
  amount: number,
  direction: "in" | "out",
  allowOverdraft: boolean,
): ReserveMovement {
  const newBalance = direction === "in" ? currentBalance + amount : currentBalance - amount;
  if (newBalance < 0 && !allowOverdraft) {
    return { ok: false, error: "Insufficient funds in this reserve" };
  }
  return { ok: true, newBalance: Math.round(newBalance * 100) / 100 };
}

export function isBelowFloor(emergencyBalance: number, minFloor: number): boolean {
  return emergencyBalance < minFloor;
}

export function computeRequestTotal(r: {
  requestedEmergencyAmount: number;
  requestedLongTermAmount: number;
  requestedAdvanceAmount: number;
}): number {
  return r.requestedEmergencyAmount + r.requestedLongTermAmount + r.requestedAdvanceAmount;
}
