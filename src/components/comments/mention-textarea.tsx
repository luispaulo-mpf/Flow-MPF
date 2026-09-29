"use client"

import { useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export type MentionUser = { id: string; name: string }

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

// "@" at the start or after whitespace, followed by up to two words (names
// like "Luis Paulo" or "M. Vinicius") ending at the caret.
const TRIGGER = /(^|\s)@([^\s@]*(?: [^\s@]*)?)$/

/**
 * Textarea with @mention autocomplete. Submits two fields with the
 * surrounding form: `content` (the text) and `mentioned_user_ids` (JSON list
 * of users whose "@Name" is still in the text).
 */
export function MentionTextarea({
  users,
  placeholder,
  disabled,
  rows = 2,
}: {
  users: MentionUser[]
  placeholder?: string
  disabled?: boolean
  rows?: number
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState("")
  const [picked, setPicked] = useState<MentionUser[]>([])
  const [query, setQuery] = useState<{ start: number; term: string } | null>(null)
  const [highlight, setHighlight] = useState(0)

  const suggestions = useMemo(() => {
    if (!query) return []
    const term = normalize(query.term)
    return users
      .filter((u) => {
        const name = normalize(u.name)
        return name.startsWith(term) || name.split(/\s+/).some((part) => part.startsWith(term))
      })
      .slice(0, 6)
  }, [query, users])

  const mentionedIds = picked.filter((u) => text.includes(`@${u.name}`)).map((u) => u.id)

  function updateQuery(value: string, caret: number) {
    const match = TRIGGER.exec(value.slice(0, caret))
    if (!match) {
      setQuery(null)
      return
    }
    const term = match[2]
    setQuery({ start: caret - term.length - 1, term })
    setHighlight(0)
  }

  function choose(user: MentionUser) {
    const el = textareaRef.current
    if (!el || !query) return
    const caret = el.selectionStart
    const insert = `@${user.name} `
    const next = text.slice(0, query.start) + insert + text.slice(caret)
    setText(next)
    setPicked((prev) => (prev.some((u) => u.id === user.id) ? prev : [...prev, user]))
    setQuery(null)
    const position = query.start + insert.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(position, position)
    })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setHighlight((h) => (h + 1) % suggestions.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        choose(suggestions[highlight])
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setQuery(null)
        return
      }
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      e.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        name="content"
        value={text}
        rows={rows}
        disabled={disabled}
        required
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value)
          updateQuery(e.target.value, e.target.selectionStart)
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => updateQuery(text, e.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <input type="hidden" name="mentioned_user_ids" value={JSON.stringify(mentionedIds)} />

      {suggestions.length > 0 ? (
        <ul
          role="listbox"
          className="absolute bottom-full left-0 z-50 mb-1 w-64 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {suggestions.map((u, i) => (
            <li key={u.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(u)
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                  i === highlight ? "bg-primary/10 text-primary" : "text-slate-700",
                )}
              >
                <span className="font-medium">@{u.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
