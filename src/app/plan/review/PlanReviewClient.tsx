"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { generatePlanReview, acceptProposal, rejectProposal } from "../review-actions"

export interface ReviewProposal {
  id: string
  title: string
  rationale: string
  evidence: string | null
  severity: string
  status: string
  changeOp: string
}

export interface ReviewSummary {
  summary: string
  assessment: string
  observations: string[]
  createdAt: string | null
}

const ASSESSMENT_META: Record<string, { label: string; cls: string }> = {
  on_track: { label: "On track", cls: "bg-green-50 text-green-700" },
  minor_adjustments: { label: "Minor adjustments", cls: "bg-blue-50 text-blue-700" },
  needs_change: { label: "Needs change", cls: "bg-amber-50 text-amber-700" },
  at_risk: { label: "At risk", cls: "bg-red-50 text-red-700" },
}

const SEVERITY_META: Record<string, string> = {
  low: "bg-gray-100 text-gray-500",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-red-50 text-red-700",
}

export function RunReviewButton({ hasExisting }: { hasExisting: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run() {
    setError(null)
    startTransition(async () => {
      const result = await generatePlanReview()
      if (result.ok) router.refresh()
      else setError(result.error ?? "Review failed")
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
      >
        {isPending
          ? "Reviewing your training…"
          : hasExisting
          ? "Run a new review"
          : "Review my plan"}
      </button>
      {isPending && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          Reading the last 4 weeks of training. This takes a few seconds.
        </p>
      )}
      {error && <p className="text-sm text-red-600 mt-2 text-center">{error}</p>}
    </div>
  )
}

export function ReviewResult({
  review,
  proposals,
}: {
  review: ReviewSummary
  proposals: ReviewProposal[]
}) {
  const assessment = ASSESSMENT_META[review.assessment] ?? {
    label: review.assessment,
    cls: "bg-gray-100 text-gray-500",
  }

  const pending = proposals.filter((p) => p.status === "pending")
  const decided = proposals.filter((p) => p.status !== "pending")

  return (
    <div className="space-y-5">
      {/* Verdict */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span
            className={`text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${assessment.cls}`}
          >
            {assessment.label}
          </span>
          {review.createdAt && (
            <span className="text-xs text-gray-400">
              Reviewed {new Date(review.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>

        <p className="text-sm text-gray-700 leading-relaxed">{review.summary}</p>

        {review.observations.length > 0 && (
          <ul className="mt-4 pt-4 border-t border-gray-50 space-y-2">
            {review.observations.map((o, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-600">
                <span className="text-orange-400 shrink-0">•</span>
                <span className="leading-relaxed">{o}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pending proposals */}
      {pending.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Suggested changes
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Nothing changes until you accept. Accepting creates a new version of
              your plan — your history stays intact.
            </p>
          </div>
          {pending.map((p) => (
            <ProposalCard key={p.id} proposal={p} />
          ))}
        </section>
      )}

      {pending.length === 0 && decided.length === 0 && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
          <p className="text-sm text-gray-500">
            No changes suggested — your coach thinks the plan is working as written.
          </p>
        </section>
      )}

      {/* Decided proposals */}
      {decided.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Already decided
          </h2>
          {decided.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between gap-3"
            >
              <p className="text-sm text-gray-500">{p.title}</p>
              <span
                className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full ${
                  p.status === "accepted"
                    ? "bg-green-50 text-green-600"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {p.status}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function ProposalCard({ proposal }: { proposal: ReviewProposal }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function decide(accept: boolean) {
    setError(null)
    startTransition(async () => {
      const result = accept
        ? await acceptProposal(proposal.id)
        : await rejectProposal(proposal.id)
      if (result.ok) router.refresh()
      else setError(result.error ?? "Could not apply that change")
    })
  }

  return (
    <div
      className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 ${
        isPending ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start gap-2 mb-2 flex-wrap">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
            SEVERITY_META[proposal.severity] ?? SEVERITY_META.medium
          }`}
        >
          {proposal.severity}
        </span>
        <span className="text-[10px] font-mono text-gray-300">{proposal.changeOp}</span>
      </div>

      <h3 className="text-sm font-semibold text-gray-900">{proposal.title}</h3>
      <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{proposal.rationale}</p>

      {proposal.evidence && (
        <p className="text-xs text-gray-500 mt-3 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
          <span className="font-semibold text-gray-400 uppercase tracking-wide text-[10px]">
            Evidence
          </span>
          <br />
          {proposal.evidence}
        </p>
      )}

      {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

      <div className="flex items-center gap-2 mt-4">
        <button
          type="button"
          onClick={() => decide(true)}
          disabled={isPending}
          className="flex-1 rounded-lg bg-orange-500 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={() => decide(false)}
          disabled={isPending}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
