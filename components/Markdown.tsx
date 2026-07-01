"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { normalizeMath } from "@/lib/markdown";
import "katex/dist/katex.min.css";

/**
 * Renders tutor answers as markdown (lists, code, tables, bold, headings, math).
 * Styling comes from the `.prose-chat` rules in globals.css plus a couple of
 * component overrides. Safe by default — react-markdown does not use
 * dangerouslySetInnerHTML and we don't enable raw HTML.
 */
function MarkdownImpl({ children }: { children: string }) {
  return (
    <div className="prose-chat break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline underline-offset-2"
            >
              {children}
            </a>
          ),
          h1: ({ children }) => (
            <h1 className="mb-2 mt-1 text-base font-semibold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-1 text-[15px] font-semibold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-1 text-sm font-semibold">{children}</h3>
          ),
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-gray-200 px-2 py-1 align-top">
              {children}
            </td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-gray-300 pl-3 text-gray-600">
              {children}
            </blockquote>
          ),
        }}
      >
        {normalizeMath(children)}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);
