import { RERANK_MODEL } from "@/lib/config";
import { VOYAGE_API_KEY } from "@/lib/env";

export interface RerankResult {
  /** Index into the original `documents` array. */
  index: number;
  relevance_score: number;
}

/**
 * Rerank candidate documents against a query using Voyage rerank (rerank-2).
 * POST https://api.voyageai.com/v1/rerank
 *
 * Returns results sorted by descending relevance, truncated to `topN`.
 */
export async function rerank(
  query: string,
  documents: string[],
  topN: number,
): Promise<RerankResult[]> {
  if (documents.length === 0) return [];

  const res = await fetch("https://api.voyageai.com/v1/rerank", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VOYAGE_API_KEY()}`,
    },
    body: JSON.stringify({
      query,
      documents,
      model: RERANK_MODEL,
      top_k: Math.min(topN, documents.length),
      truncation: true,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Voyage rerank request failed (${res.status}): ${detail}`);
  }

  const json = (await res.json()) as {
    data: { index: number; relevance_score: number }[];
  };

  return json.data
    .map((d) => ({ index: d.index, relevance_score: d.relevance_score }))
    .sort((a, b) => b.relevance_score - a.relevance_score);
}
