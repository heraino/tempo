"use client"

import { useEffect, useRef } from "react"

interface TimezoneFieldProps {
  savedValue: string | null
}

export function TimezoneField({ savedValue }: TimezoneFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (inputRef.current && !inputRef.current.value) {
      inputRef.current.value = detected
    }
  }, [])

  return (
    <input
      ref={inputRef}
      type="text"
      name="timezone"
      defaultValue={savedValue ?? ""}
      placeholder="Detecting…"
      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-400"
    />
  )
}
