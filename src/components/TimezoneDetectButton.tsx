"use client"

export function TimezoneDetectButton() {
  return (
    <button
      type="button"
      onClick={() => {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
        const input = document.querySelector<HTMLInputElement>('input[name="timezone"]')
        if (input) {
          input.value = tz
        }
      }}
      className="text-xs font-medium text-orange-500 hover:underline"
    >
      Detect from device
    </button>
  )
}
