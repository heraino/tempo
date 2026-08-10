"use client"

import { useEffect, useRef } from "react"

// Curated IANA timezone list grouped by region
const TZ_GROUPS: { label: string; zones: { value: string; label: string }[] }[] = [
  {
    label: "United States & Canada",
    zones: [
      { value: "America/New_York",       label: "Eastern Time — New York" },
      { value: "America/Chicago",        label: "Central Time — Chicago" },
      { value: "America/Denver",         label: "Mountain Time — Denver" },
      { value: "America/Phoenix",        label: "Mountain Time — Phoenix (no DST)" },
      { value: "America/Los_Angeles",    label: "Pacific Time — Los Angeles" },
      { value: "America/Anchorage",      label: "Alaska Time — Anchorage" },
      { value: "America/Honolulu",       label: "Hawaii Time — Honolulu" },
      { value: "America/Toronto",        label: "Eastern Time — Toronto" },
      { value: "America/Vancouver",      label: "Pacific Time — Vancouver" },
      { value: "America/Winnipeg",       label: "Central Time — Winnipeg" },
      { value: "America/Edmonton",       label: "Mountain Time — Edmonton" },
      { value: "America/Halifax",        label: "Atlantic Time — Halifax" },
      { value: "America/St_Johns",       label: "Newfoundland — St. John's" },
    ],
  },
  {
    label: "Europe",
    zones: [
      { value: "Europe/London",          label: "London (GMT/BST)" },
      { value: "Europe/Dublin",          label: "Dublin (IST)" },
      { value: "Europe/Lisbon",          label: "Lisbon (WET)" },
      { value: "Europe/Paris",           label: "Paris (CET)" },
      { value: "Europe/Berlin",          label: "Berlin (CET)" },
      { value: "Europe/Madrid",          label: "Madrid (CET)" },
      { value: "Europe/Rome",            label: "Rome (CET)" },
      { value: "Europe/Amsterdam",       label: "Amsterdam (CET)" },
      { value: "Europe/Brussels",        label: "Brussels (CET)" },
      { value: "Europe/Vienna",          label: "Vienna (CET)" },
      { value: "Europe/Zurich",          label: "Zurich (CET)" },
      { value: "Europe/Stockholm",       label: "Stockholm (CET)" },
      { value: "Europe/Oslo",            label: "Oslo (CET)" },
      { value: "Europe/Copenhagen",      label: "Copenhagen (CET)" },
      { value: "Europe/Helsinki",        label: "Helsinki (EET)" },
      { value: "Europe/Warsaw",          label: "Warsaw (CET)" },
      { value: "Europe/Prague",          label: "Prague (CET)" },
      { value: "Europe/Budapest",        label: "Budapest (CET)" },
      { value: "Europe/Bucharest",       label: "Bucharest (EET)" },
      { value: "Europe/Athens",          label: "Athens (EET)" },
      { value: "Europe/Istanbul",        label: "Istanbul (TRT)" },
      { value: "Europe/Moscow",          label: "Moscow (MSK)" },
      { value: "Europe/Kiev",            label: "Kyiv (EET)" },
    ],
  },
  {
    label: "Latin America",
    zones: [
      { value: "America/Mexico_City",    label: "Mexico City (CST)" },
      { value: "America/Bogota",         label: "Bogotá (COT)" },
      { value: "America/Lima",           label: "Lima (PET)" },
      { value: "America/Santiago",       label: "Santiago (CLT)" },
      { value: "America/Caracas",        label: "Caracas (VET)" },
      { value: "America/Sao_Paulo",      label: "São Paulo (BRT)" },
      { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires (ART)" },
    ],
  },
  {
    label: "Africa & Middle East",
    zones: [
      { value: "Africa/Cairo",           label: "Cairo (EET)" },
      { value: "Africa/Johannesburg",    label: "Johannesburg (SAST)" },
      { value: "Africa/Lagos",           label: "Lagos (WAT)" },
      { value: "Africa/Nairobi",         label: "Nairobi (EAT)" },
      { value: "Asia/Riyadh",            label: "Riyadh (AST)" },
      { value: "Asia/Dubai",             label: "Dubai (GST)" },
      { value: "Asia/Jerusalem",         label: "Jerusalem (IST)" },
      { value: "Asia/Tehran",            label: "Tehran (IRST)" },
    ],
  },
  {
    label: "Asia & India",
    zones: [
      { value: "Asia/Kolkata",           label: "India — Kolkata (IST)" },
      { value: "Asia/Dhaka",             label: "Dhaka (BST)" },
      { value: "Asia/Karachi",           label: "Karachi (PKT)" },
      { value: "Asia/Bangkok",           label: "Bangkok (ICT)" },
      { value: "Asia/Ho_Chi_Minh",       label: "Ho Chi Minh City (ICT)" },
      { value: "Asia/Jakarta",           label: "Jakarta (WIB)" },
      { value: "Asia/Singapore",         label: "Singapore (SGT)" },
      { value: "Asia/Hong_Kong",         label: "Hong Kong (HKT)" },
      { value: "Asia/Shanghai",          label: "China — Shanghai (CST)" },
      { value: "Asia/Taipei",            label: "Taipei (CST)" },
      { value: "Asia/Manila",            label: "Manila (PHT)" },
      { value: "Asia/Seoul",             label: "Seoul (KST)" },
      { value: "Asia/Tokyo",             label: "Tokyo (JST)" },
      { value: "Asia/Yangon",            label: "Yangon (MMT)" },
    ],
  },
  {
    label: "Australia & Pacific",
    zones: [
      { value: "Australia/Perth",        label: "Perth (AWST)" },
      { value: "Australia/Adelaide",     label: "Adelaide (ACST)" },
      { value: "Australia/Darwin",       label: "Darwin (ACST)" },
      { value: "Australia/Brisbane",     label: "Brisbane (AEST)" },
      { value: "Australia/Sydney",       label: "Sydney (AEST)" },
      { value: "Australia/Melbourne",    label: "Melbourne (AEST)" },
      { value: "Pacific/Auckland",       label: "Auckland (NZST)" },
      { value: "Pacific/Fiji",           label: "Fiji (FJT)" },
    ],
  },
  {
    label: "UTC",
    zones: [
      { value: "UTC",                    label: "UTC (Coordinated Universal Time)" },
    ],
  },
]

// Flat lookup: iana value → exists in our list
const ALL_ZONES = new Set(TZ_GROUPS.flatMap(g => g.zones.map(z => z.value)))

interface TimezoneFieldProps {
  savedValue: string | null
}

export function TimezoneField({ savedValue }: TimezoneFieldProps) {
  const selectRef = useRef<HTMLSelectElement>(null)

  // A saved zone outside the curated list is known at render time, so it can be
  // offered as an option without any client-side detection.
  const savedIsCustom = savedValue != null && !ALL_ZONES.has(savedValue)

  // The device timezone can only be read in the browser — reading it during
  // render would produce a server/client mismatch. Detection therefore syncs
  // the DOM directly rather than driving React state.
  useEffect(() => {
    const select = selectRef.current
    if (!select || select.value) return

    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!detected) return

    if (!ALL_ZONES.has(detected)) {
      const option = document.createElement("option")
      option.value = detected
      option.textContent = detected
      select.prepend(option)
    }
    select.value = detected
  }, [])

  return (
    <select
      ref={selectRef}
      name="timezone"
      defaultValue={savedValue ?? ""}
      className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
    >
      {/* Empty placeholder so an undetected, unsaved field is not silently
          committed as whichever zone happens to sort first. */}
      <option value="" disabled>
        Select a timezone…
      </option>
      {savedIsCustom && (
        <optgroup label="Current">
          <option value={savedValue}>{savedValue}</option>
        </optgroup>
      )}
      {TZ_GROUPS.map(group => (
        <optgroup key={group.label} label={group.label}>
          {group.zones.map(z => (
            <option key={z.value} value={z.value}>{z.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
