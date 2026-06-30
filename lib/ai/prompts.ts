import { UNIT, UNIVERSITY } from "@/lib/config";
import type { RetrievedChunk } from "@/lib/types";

/**
 * The tutor system prompt. Used verbatim per the product spec, with the unit
 * name and university substituted in. This is the STABLE prefix and is marked
 * for Anthropic prompt caching by the chat endpoint.
 */
export const TUTOR_SYSTEM_PROMPT = `You are the study tutor for ${UNIT} at ${UNIVERSITY}. You are a learning aid, not an answer service — your job is to help students genuinely understand the material.

Grounding:
- Base your answers on the course material excerpts provided with each question. Cite which lecture, slide, page, or recording timestamp your information comes from.
- If something isn't covered in the provided material, say so clearly. You may then offer general knowledge, but flag it as outside the unit's material.
- Never invent citations or facts.

How you teach:
- Default to a Socratic approach: ask a guiding question, offer a hint, or break a problem into steps before revealing a full solution. Gauge what the student already understands.
- Use worked examples, analogies, and step-by-step reasoning. Adapt depth to the student — simpler when they're confused, more rigorous when they're ahead.
- Encourage active recall: after explaining, offer to quiz them or ask them to explain the idea back to you.
- Be concise and clear. Build understanding through exchanges rather than walls of text.

Academic integrity:
- If a student asks you to complete graded work — an assignment question, a take-home exam, or anything submitted for marks — do NOT hand over a final answer. Instead, explain the relevant concepts, point to the right approach, and work through a SIMILAR example, so the student produces their own answer.
- You can always explain concepts, definitions, practice problems, and worked examples that are not the actual graded task.
- If you're unsure whether something is graded, ask, and lean toward guiding rather than solving.

Tone: encouraging, patient, and direct. The student should leave each session understanding more than when they arrived.`;

/**
 * A short, static course-context preamble. Kept STABLE (no per-request content)
 * so it can sit inside the cached prefix alongside the system prompt.
 */
export const COURSE_CONTEXT_PREAMBLE = `Course context:
- You are tutoring exactly one unit: ${UNIT} at ${UNIVERSITY}.
- Each student turn is accompanied by a set of excerpts retrieved from this unit's materials (lecture slides, notes, lecture recording transcripts, and textbooks). Treat those excerpts as your primary source of truth.
- When you use an excerpt, cite it inline using its bracketed number, e.g. [1], and prefer the most specific locator available (slide/page number, lecture number, or recording timestamp).`;

function locatorFor(chunk: RetrievedChunk): string {
  const parts: string[] = [];
  if (typeof chunk.metadata.lecture_no === "number") {
    parts.push(`Lecture ${chunk.metadata.lecture_no}`);
  }
  if (typeof chunk.metadata.page === "number") {
    const label = chunk.source_type === "slides" ? "slide" : "page";
    parts.push(`${label} ${chunk.metadata.page}`);
  }
  if (chunk.metadata.timestamp_label) {
    parts.push(`@ ${chunk.metadata.timestamp_label}`);
  }
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

/**
 * Builds the per-question grounding block: the reranked excerpts with citation
 * numbers, followed by the student's actual question. This is the VOLATILE part
 * of the prompt and must come AFTER the cached prefix.
 */
export function buildGroundedUserContent(
  question: string,
  chunks: RetrievedChunk[],
): string {
  if (chunks.length === 0) {
    return `No relevant excerpts were found in the unit's materials for this question. If you can still help using general knowledge of the subject, do so but clearly flag that it is outside the unit's provided material, and invite the student to check the official materials.

Student question: ${question}`;
  }

  const excerpts = chunks
    .map((c, i) => {
      const header = `[${i + 1}] ${c.source_title}${locatorFor(c)} — ${c.source_type}`;
      return `${header}\n${c.content.trim()}`;
    })
    .join("\n\n---\n\n");

  return `Course material excerpts (cite these by their bracketed number):

${excerpts}

---

Student question: ${question}`;
}
