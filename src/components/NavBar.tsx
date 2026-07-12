"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  )
}

function PlusIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

function PlanIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </svg>
  )
}

const tabs = [
  { href: "/dashboard", label: "Dashboard", Icon: HomeIcon },
  { href: "/log",       label: "Log",       Icon: PlusIcon },
  { href: "/onboarding", label: "Plan",     Icon: PlanIcon },
]

export function NavBar() {
  const pathname = usePathname()

  if (pathname === "/" || pathname === "/sign-in") return null

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100"
         style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex max-w-2xl mx-auto">
        {tabs.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors ${
                active ? "text-orange-500" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <Icon active={active} />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
