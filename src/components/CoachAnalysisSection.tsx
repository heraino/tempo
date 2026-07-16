"use client"

import { useState, useTransition } from "react"
import { generateCoachingAnalysis, type CoachOutput } from "@/app/workout/coach-actions"

function GradeChip({ grade }: { grade: string | null | undefined }) {
  if (!grade) return null
  const color =
    grade === "A" ? "bg-green-50 text-green-700" :
    grade === "B" ? "bg-blue-50 text-blue-700" :
    grade === "C" ? "bg-yellow-50 text-yellow-700" :
    "bg-red-50 text-red-700"
  return (
    <span className={`inline-block text-sm font-bold rounded-lg px-2.5 py-1 ${color}`}>
      {grade}
    </span>
  )
}

function Signal({ text, type }: { text: string; type: "positive" | "caution" | "neutral" }) {
  const icon = type === "positive" ? "✓" : type === "caution" ? "⚠" : "·"
  const color = type === "positive" ? "text-green-600" : type === "caution" ? "text-amber-500" : "text-gray-400"
  return (
    <li className="flex items-start gap-2">
      <span className={`${color} font-bold shrink-0 mt-0.5`}>{icon}</span>
      <span className="text-sm text-gray-700">{text}</span>
    </li>
  )
}

function AnalysisDisplay({ analysis }: { analysis: CoachOutput }) {
  return (
    <div className="space-y-5">
      {/* Headline + grade */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-800 leading-snug italic">
          &ldquo;{analysis.headline}&rdquo;
        </p>
        <GradeChip grade={analysis.grade} />
      </div>

      {/* DATA */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Data</p>
        <div className="bg-gray-50 rounded-xl px-3 py-2.5 space-y-1">
          <p className="text-xs font-semibold text-gray-800">{analysis.data.workoutType}</p>
          <p className="text-xs text-gray-600">{analysis.data.keyMetrics}</p>
          {analysis.data.segmentSummary && (
            <p className="text-xs text-gray-600">{analysis.data.segmentSummary}</p>
          )}
          {analysis.data.conditions && (
            <p className="text-xs text-gray-400">{analysis.data.conditions}</p>
          )}
        </div>
      </div>

      {/* Calculations */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Calculations</p>
        <p className="text-xs text-gray-600 leading-relaxed">{analysis.calculations.summary}</p>
      </div>

      {/* Athlete report */}
      {analysis.athleteReport && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Athlete report</p>
          <p className="text-xs text-gray-600 leading-relaxed">{analysis.athleteReport}</p>
        </div>
      )}

      {/* Interpretation */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Interpretation</p>
        <p className="text-sm text-gray-700 leading-relaxed">{analysis.interpretation}</p>
      </div>

      {/* Decision */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Decision</p>
        <p className="text-sm font-medium text-gray-900 leading-snug">{analysis.decision}</p>
      </div>

      {/* Signals */}
      {(analysis.positiveSignals.length > 0 || analysis.cautionarySignals.length > 0 || analysis.neutralSignals.length > 0) && (
        <ul className="space-y-1.5 pt-2 border-t border-gray-50">
          {analysis.positiveSignals.map((s, i) => <Signal key={i} text={s} type="positive" />)}
          {analysis.cautionarySignals.map((s, i) => <Signal key={i} text={s} type="caution" />)}
          {analysis.neutralSignals.map((s, i) => <Signal key={i} text={s} type="neutral" />)}
        </ul>
      )}
    </div>
  )
}

export function CoachAnalysisSection({
  workoutId,
  initial,
}: {
  workoutId: string
  initial: CoachOutput | null
}) {
  const [analysis, setAnalysis] = useState<CoachOutput | null>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleGenerate() {
    setError(null)
    startTransition(async () => {
      const result = await generateCoachingAnalysis(workoutId)
      if (result.ok && result.analysis) {
        setAnalysis(result.analysis)
      } else {
        setError(result.error ?? "Analysis failed")
      }
    })
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Coach analysis</h2>
        <button
          onClick={handleGenerate}
          disabled={pending}
          className="text-xs font-semibold text-orange-500 hover:text-orange-600 disabled:opacity-50 transition-colors"
        >
          {pending ? "Analyzing…" : analysis ? "Regenerate" : "Analyze →"}
        </button>
      </div>

      {pending && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" strokeOpacity="0.2"/>
            <path d="M21 12a9 9 0 0 0-9-9"/>
          </svg>
          Running coaching analysis…
        </div>
      )}

      {error && !pending && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {!pending && !analysis && !error && (
        <p className="text-sm text-gray-400">
          Generate an AI coaching analysis for this workout — covering structure, effort, physiological response, and next-step decision.
        </p>
      )}

      {!pending && analysis && <AnalysisDisplay analysis={analysis} />}
    </section>
  )
}
