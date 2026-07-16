"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { syncTimezone } from "@/app/settings/actions"

export function TimezoneSync() {
  const router = useRouter()

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    syncTimezone(tz)
      .then(({ changed }) => {
        if (changed) router.refresh()
      })
      .catch(() => {})
  }, [router])

  return null
}
