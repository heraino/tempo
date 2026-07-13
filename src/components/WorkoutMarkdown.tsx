"use client"

import ReactMarkdown from "react-markdown"

export function WorkoutMarkdown({ content }: { content: string }) {
  // Strip the leading "### DayName" heading — the page already shows that context
  const body = content.replace(/^###[^\n]*\n/, "").trim()

  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1 className="text-xl font-bold text-gray-900 mt-5 mb-2 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-bold text-gray-900 mt-4 mb-2 first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold text-gray-700 mt-3 mb-1 first:mt-0">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="text-sm text-gray-700 leading-relaxed mb-2">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="space-y-1.5 mb-3 ml-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="space-y-1.5 mb-3 ml-4 list-decimal">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="flex gap-2 text-sm text-gray-700 leading-relaxed">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
            <span>{children}</span>
          </li>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-gray-900">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-gray-600">{children}</em>
        ),
        hr: () => <hr className="my-4 border-gray-100" />,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-orange-200 pl-3 italic text-gray-500 my-3">
            {children}
          </blockquote>
        ),
        code: ({ children }) => (
          <code className="bg-gray-100 text-gray-700 rounded px-1 py-0.5 text-xs font-mono">
            {children}
          </code>
        ),
      }}
    >
      {body}
    </ReactMarkdown>
  )
}
