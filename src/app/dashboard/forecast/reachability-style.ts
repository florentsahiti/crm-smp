export function reachabilityStyle(value: number | null, target: number) {
  if (value === null) return "bg-zinc-100 text-zinc-500";
  if (value >= target) return "bg-green-100 text-green-700";
  if (value >= target - 0.1) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}
