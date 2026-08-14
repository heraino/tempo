import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getLatestReview, REVIEW_WINDOW_DAYS } from "@/lib/services/planReview.service"
import { getActivePlanVersion } from "@/lib/services/plan.service"
import { getActiveGoal } from "@/lib/services/goal.service"
import { getUserPreferences } from "@/lib/services/userPreferences.service"
import { describeGoal } from "@/lib/goals/goal"
import {
  RunReviewButton,
  ReviewResult,
  type ReviewProposal,
  type ReviewSummary,
} from "./PlanReviewClient"

// A single Nebius call, but extend past the platform default so a legitimate
// slow response isn't killed mid-flight before our own client-side timeout.
export const maxDuration = 60

export default async function PlanReviewPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")
  const userId = session.user.id

  const [latest, planVersion, goal, prefs] = await Promise.all([
    getLatestReview(userId),
    getActivePlanVersion(userId),
    getActiveGoal(userId),
    getUserPreferences(userId),
  ])

  const units = prefs.unitsSystem as "imperial" | "metric"

  // The parsed model response is stored on the analysis row
  const parsed = latest?.analysis.responseParsed as
    | { summary?: string; assessment?: string; observations?: string[] }
    | null

  const review: ReviewSummary | null =
    latest && parsed?.summary
      ? {
          summary: parsed.summary,
          assessment: parsed.assessment ?? "on_track",
          observations: Array.isArray(parsed.observations) ? parsed.observations : [],
          createdAt: latest.analysis.createdAt?.toISOString() ?? null,
        }
      : null

  const proposals: ReviewProposal[] = (latest?.proposals ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    rationale: p.rationale,
    evidence: p.evidence,
    severity: p.severity,
    status: p.status,
    changeOp: p.changeOp,
  }))

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 pb-24">
      <div className="max-w-2xl mx-auto space-y-5">

        <Link
          href="/plan/today"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Plan
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">How is my plan working?</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Your coach reads the last {REVIEW_WINDOW_DAYS} days of training against your goal
            and suggests changes worth making.
          </p>
        </div>

        {!planVersion ? (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
            <p className="text-sm text-gray-500 mb-4">
              You don&apos;t have a training plan yet, so there&apos;s nothing to review.
            </p>
            <Link
              href="/onboarding"
              className="inline-block rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
            >
              Set up a plan
            </Link>
          </section>
        ) : (
          <>
            {/* Goal context */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                Measured against
              </p>
              {goal ? (
                <p className="text-sm font-semibold text-gray-900">
                  {describeGoal(goal, units)}
                </p>
              ) : (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm text-gray-500">
                    No goal set — your coach can only give general feedback.
                  </p>
                  <Link
                    href="/goal"
                    className="text-sm font-semibold text-orange-500 hover:underline shrink-0"
                  >
                    Set a goal
                  </Link>
                </div>
              )}
            </section>

            <RunReviewButton hasExisting={review != null} />

            {review && <ReviewResult review={review} proposals={proposals} />}
          </>
        )}

      </div>
    </main>
  )
}
