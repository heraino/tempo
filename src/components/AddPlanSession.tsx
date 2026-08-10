"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { addSessionAction } from "@/app/plan/actions"
import { sessionKindMeta, SWAPPABLE_KINDS } from "@/lib/plan/sessionKinds"

export function AddPlanSession({ dateStr }: { dateStr: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<string>("easy")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const meta = sessionKindMeta(kind)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    const label = (formData.get("label") as string) ?? ""
    const prescription = (formData.get("prescription") as string) ?? ""

    startTransition(async () => {
      const result = await addSessionAction(dateStr, {
        sessionKind: kind,
        label,
        prescription,
      })
      if (result.ok) {
        setOpen(false)
        setKind("easy")
        router.refresh()
      } else {
        setError(result.error ?? "Could not add session")
      }
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-gray-200 py-3 text-sm font-medium text-gray-400 hover:border-orange-300 hover:text-orange-500 transition-colors"
      >
        + Add a session to this day
      </button>
    )
  }

  const inputCls =
    "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
  const labelCls =
    "block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1"

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-gray-200 p-4 space-y-3 bg-white"
    >
      <div>
        <label className={labelCls}>Session type</label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className={inputCls}
        >
          {SWAPPABLE_KINDS.map((k) => (
            <option key={k} value={k}>
              {sessionKindMeta(k).label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>Name</label>
        <input
          type="text"
          name="label"
          defaultValue={meta.label}
          key={`label-${kind}`}
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>What to do</label>
        <textarea
          name="prescription"
          defaultValue={meta.defaultPrescription}
          key={`presc-${kind}`}
          rows={2}
          className={`${inputCls} resize-none`}
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-lg bg-orange-500 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Adding…" : "Add session"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
