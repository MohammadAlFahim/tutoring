/**
 * Lightweight, dependency-free text chunking for ingestion.
 *
 * Token counts are approximated (~4 chars/token). Exactness isn't important for
 * sizing retrieval chunks, and avoiding a heavy tokenizer keeps the ingest
 * script fast and portable.
 */

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

/** Format seconds as H:MM:SS or M:SS for recording citations. */
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Split text into sentence-ish units, keeping paragraph breaks meaningful. */
function splitIntoSegments(text: string): string[] {
  return text
    .split(/\n{2,}/) // paragraphs
    .flatMap((para) =>
      para
        // sentence boundary: punctuation followed by whitespace
        .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\[])/)
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .filter(Boolean);
}

export interface TextChunk {
  content: string;
  tokenCount: number;
}

/**
 * Chunk text to ~targetTokens with ~overlapTokens of overlap between
 * consecutive chunks, splitting on sentence/paragraph boundaries.
 */
export function chunkText(
  text: string,
  targetTokens = 800,
  overlapTokens = 100,
): TextChunk[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const segments = splitIntoSegments(clean);
  const chunks: TextChunk[] = [];

  let current: string[] = [];
  let currentTokens = 0;

  const flush = () => {
    if (current.length === 0) return;
    const content = current.join(" ").trim();
    if (content) chunks.push({ content, tokenCount: estimateTokens(content) });
  };

  for (const seg of segments) {
    const segTokens = estimateTokens(seg);

    // A single oversized segment: hard-split it by characters.
    if (segTokens > targetTokens * 1.5) {
      flush();
      current = [];
      currentTokens = 0;
      const charsPerChunk = targetTokens * CHARS_PER_TOKEN;
      for (let i = 0; i < seg.length; i += charsPerChunk) {
        const piece = seg.slice(i, i + charsPerChunk).trim();
        if (piece) {
          chunks.push({ content: piece, tokenCount: estimateTokens(piece) });
        }
      }
      continue;
    }

    if (currentTokens + segTokens > targetTokens && current.length > 0) {
      flush();
      // Start the next chunk with an overlap tail from the previous one.
      const tail: string[] = [];
      let tailTokens = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const t = estimateTokens(current[i]);
        if (tailTokens + t > overlapTokens) break;
        tail.unshift(current[i]);
        tailTokens += t;
      }
      current = [...tail];
      currentTokens = tailTokens;
    }

    current.push(seg);
    currentTokens += segTokens;
  }

  flush();
  return chunks;
}
