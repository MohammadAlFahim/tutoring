/**
 * Normalizes the LaTeX delimiters Claude commonly emits — \( \) for inline and
 * \[ \] for display — to the $-form that remark-math understands. Fenced and
 * inline code spans are left untouched so real code containing backslashes is
 * never mangled.
 *
 * Pure and dependency-free so it can be unit-tested without the React/KaTeX
 * rendering stack.
 */
export function normalizeMath(input: string): string {
  return input
    .split(/(```[\s\S]*?```|`[^`]*`)/g)
    .map((seg, i) =>
      i % 2 === 1 // odd segments are code (fenced or inline) — leave alone
        ? seg
        : seg
            .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`)
            .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`),
    )
    .join("");
}
