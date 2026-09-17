export function StatusBadge({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  )
}
