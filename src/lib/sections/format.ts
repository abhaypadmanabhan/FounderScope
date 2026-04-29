// Tiny formatting helpers shared across renderers.

export function padOrder(order: number): string {
  return order.toString().padStart(2, "0");
}
