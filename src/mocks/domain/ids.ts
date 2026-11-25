

export function nextId(prefix: string, items: { id: string }[]) {
  const max = items.reduce((acc, item) => {
    const numeric = Number(item.id.replace(/\D/g, ''));
    return Number.isFinite(numeric) ? Math.max(acc, numeric) : acc;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}
