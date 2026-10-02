"use client"

import { useState } from "react"
import { SmilePlus } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/** Must match the check constraint on comment_reactions.emoji. */
export const REACTION_EMOJIS = ["👍", "✅", "👀", "🙏", "❤️", "😂"] as const

export type Reaction = { comment_id: string; user_id: string; emoji: string }

/**
 * Reaction chips under a message (count + who reacted on hover) and the
 * picker button. Clicking a chip toggles the viewer's own reaction.
 */
export function CommentReactions({
  reactions,
  meId,
  canReact,
  nameOf,
  onToggle,
  alignEnd,
}: {
  reactions: Reaction[]
  meId: string | null
  canReact: boolean
  nameOf: (userId: string) => string
  onToggle: (emoji: string) => void
  alignEnd: boolean
}) {
  const [open, setOpen] = useState(false)
  const groups = REACTION_EMOJIS.map((emoji) => {
    const users = reactions.filter((r) => r.emoji === emoji).map((r) => r.user_id)
    return { emoji, users, mine: meId !== null && users.includes(meId) }
  }).filter((g) => g.users.length > 0)

  if (groups.length === 0 && !canReact) return null

  return (
    <div className={cn("mt-1 flex flex-wrap items-center gap-1", alignEnd && "justify-end")}>
      {groups.map((g) => (
        <button
          key={g.emoji}
          type="button"
          disabled={!canReact}
          title={g.users.map((id) => (id === meId ? "Você" : nameOf(id))).join(", ")}
          onClick={() => onToggle(g.emoji)}
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs",
            g.mine
              ? "border-primary/40 bg-primary/10 font-medium text-primary"
              : "border-slate-200 bg-card text-slate-600",
            canReact ? "hover:border-primary/60" : "cursor-default",
          )}
        >
          <span>{g.emoji}</span>
          {g.users.length}
        </button>
      ))}
      {canReact ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Reagir"
              title="Reagir"
              className={cn(
                "inline-flex h-6 items-center rounded-full border border-transparent px-1.5 text-slate-400 hover:border-slate-200 hover:bg-card hover:text-slate-600",
                // Hidden until hover on devices with a mouse; always visible on touch.
                groups.length === 0 && "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100",
                open && "opacity-100",
              )}
            >
              <SmilePlus className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="flex w-auto gap-0.5 p-1" align={alignEnd ? "end" : "start"}>
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onToggle(emoji)
                  setOpen(false)
                }}
                className="rounded-md px-1.5 py-1 text-lg leading-none hover:bg-slate-100"
              >
                {emoji}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  )
}
