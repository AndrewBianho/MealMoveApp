export type PickupRecord = {
  status: "claimed" | "photographed" | "in_transit" | "delivered" | "taken_home" | "flaked" | "cancelled";
  servings: number;
};

const PICKED_UP = new Set(["photographed", "in_transit", "delivered", "taken_home"]);

export function deriveListingStatus(eventTypes: Set<string>): PickupRecord["status"] {
  if (eventTypes.has("delivered")) return "delivered";
  if (eventTypes.has("taken_home")) return "taken_home";
  if (eventTypes.has("in_transit")) return "in_transit";
  if (eventTypes.has("released") || eventTypes.has("expired") || eventTypes.has("failed")) return "flaked";
  return "claimed";
}

export function computeServingsRescued(pickups: PickupRecord[]): number {
  return pickups.filter((p) => p.status === "delivered").reduce((s, p) => s + p.servings, 0);
}

export function computeFlakeRate(pickups: PickupRecord[]): number {
  const flaked = pickups.filter((p) => p.status === "flaked").length;
  const delivered = pickups.filter((p) => p.status === "delivered").length;
  const denom = flaked + delivered;
  return denom === 0 ? 0 : flaked / denom;
}

export function computeFunnel(pickups: PickupRecord[]): { claimed: number; pickedUp: number; delivered: number } {
  return {
    claimed: pickups.length,
    pickedUp: pickups.filter((p) => PICKED_UP.has(p.status)).length,
    delivered: pickups.filter((p) => p.status === "delivered").length,
  };
}
