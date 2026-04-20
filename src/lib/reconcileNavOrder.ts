/**
 * Clean a saved nav-order list against the current registry of valid IDs.
 *   - Drop IDs no longer present in the registry (stale).
 *   - Append IDs that exist in the registry but are missing from the saved list.
 *   - Preserve the saved order for IDs that are valid.
 */
export function reconcileNavOrder(savedOrder: string[], currentIds: string[]): string[] {
  const currentSet = new Set(currentIds);
  const savedSet = new Set(savedOrder);
  const preserved = savedOrder.filter((id) => currentSet.has(id));
  const appended = currentIds.filter((id) => !savedSet.has(id));
  return [...preserved, ...appended];
}
