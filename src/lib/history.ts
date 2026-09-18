/**
 * Turns an append-only status-history log (rows ordered by entered_at) into
 * per-status time segments. A segment's exited_at is the next row's
 * entered_at, or `now` if it's the most recent (still-open) segment — the
 * history tables never store exited_at directly (see status-history.ts).
 */

export type HistoryRow = { statusId: string; statusName: string; enteredAt: string }

export type HistorySegment = {
  statusId: string
  statusName: string
  enteredAt: string
  exitedAt: string | null
  durationMs: number
}

export function buildSegments(rows: HistoryRow[], now: Date = new Date()): HistorySegment[] {
  const sorted = [...rows].sort((a, b) => a.enteredAt.localeCompare(b.enteredAt))
  return sorted.map((row, i) => {
    const next = sorted[i + 1]
    const enteredAt = new Date(row.enteredAt).getTime()
    const exitedAt = next ? new Date(next.enteredAt).getTime() : now.getTime()
    return {
      statusId: row.statusId,
      statusName: row.statusName,
      enteredAt: row.enteredAt,
      exitedAt: next ? next.enteredAt : null,
      durationMs: Math.max(0, exitedAt - enteredAt),
    }
  })
}

export type StageStat = {
  statusId: string
  statusName: string
  currentCount: number
  oldestEnteredAt: string | null
  oldestDurationMs: number | null
  avgDurationMs: number | null
}

/**
 * Groups every entity's segments by status, computing (a) how many entities
 * currently sit in each status (segment with no exitedAt) and how long the
 * oldest of those has been there, and (b) the average time entities spend
 * in that status across ALL segments (open ones counted up to `now`).
 */
export function summarizeByStatus(
  segmentsByEntity: HistorySegment[][],
  orderedStatuses: { id: string; name: string }[],
  now: Date = new Date(),
): StageStat[] {
  const byStatus = new Map<string, HistorySegment[]>()
  for (const segments of segmentsByEntity) {
    for (const seg of segments) {
      if (!byStatus.has(seg.statusId)) byStatus.set(seg.statusId, [])
      byStatus.get(seg.statusId)!.push(seg)
    }
  }

  return orderedStatuses.map((status) => {
    const segments = byStatus.get(status.id) ?? []
    const open = segments.filter((s) => s.exitedAt === null)
    const oldestEnteredAt =
      open.length > 0
        ? open.reduce((min, s) => (s.enteredAt < min ? s.enteredAt : min), open[0].enteredAt)
        : null
    const oldestDurationMs = oldestEnteredAt ? now.getTime() - new Date(oldestEnteredAt).getTime() : null
    const avgDurationMs =
      segments.length > 0
        ? segments.reduce((sum, s) => sum + s.durationMs, 0) / segments.length
        : null

    return {
      statusId: status.id,
      statusName: status.name,
      currentCount: open.length,
      oldestEnteredAt,
      oldestDurationMs,
      avgDurationMs,
    }
  })
}

export type CycleStat = {
  avgMs: number | null
  minMs: number | null
  maxMs: number | null
  ongoing: { entityId: string; elapsedMs: number }[]
}

/**
 * Operational cycle = time between an entity's first history entry and the
 * moment it entered a final status. Entities that never reached a final
 * status are "ongoing" — their elapsed time so far, not a guessed ETA.
 */
export function summarizeCycle(
  entities: { id: string; segments: HistorySegment[] }[],
  isFinalStatusId: (statusId: string) => boolean,
  now: Date = new Date(),
): CycleStat {
  const completedMs: number[] = []
  const ongoing: { entityId: string; elapsedMs: number }[] = []

  for (const entity of entities) {
    if (entity.segments.length === 0) continue
    const start = new Date(entity.segments[0].enteredAt).getTime()
    const finalSegment = entity.segments.find((s) => isFinalStatusId(s.statusId))

    if (finalSegment) {
      completedMs.push(new Date(finalSegment.enteredAt).getTime() - start)
    } else {
      ongoing.push({ entityId: entity.id, elapsedMs: now.getTime() - start })
    }
  }

  return {
    avgMs: completedMs.length > 0 ? completedMs.reduce((a, b) => a + b, 0) / completedMs.length : null,
    minMs: completedMs.length > 0 ? Math.min(...completedMs) : null,
    maxMs: completedMs.length > 0 ? Math.max(...completedMs) : null,
    ongoing,
  }
}

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—"
  const days = ms / (1000 * 60 * 60 * 24)
  if (days < 1) return "menos de 1 dia"
  return `${days.toFixed(1)} dias`
}
