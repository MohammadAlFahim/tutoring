import {
  RERANK_TOP_N,
  RETRIEVE_TOP_K,
  UNIT,
} from "@/lib/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Citation, RetrievedChunk } from "@/lib/types";
import { embedQuery } from "./embeddings";
import { rerank } from "./rerank";

function snippet(text: string, max = 240): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function toCitation(chunk: RetrievedChunk, index: number): Citation {
  return {
    index,
    source_title: chunk.source_title,
    source_type: chunk.source_type,
    page: chunk.metadata.page,
    lecture_no: chunk.metadata.lecture_no,
    timestamp_label: chunk.metadata.timestamp_label,
    snippet: snippet(chunk.content),
  };
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  citations: Citation[];
}

/**
 * The retrieval half of the RAG pipeline:
 *   1. Embed the question (Voyage, input_type=query)
 *   2. Vector search top-K from pgvector, filtered to this unit
 *   3. Rerank with Voyage rerank, keep top-N
 *   4. Build citation metadata
 */
export async function retrieveContext(
  question: string,
): Promise<RetrievalResult> {
  const queryEmbedding = await embedQuery(question);

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("match_chunks", {
    // pgvector accepts its text representation, e.g. "[0.1,0.2,...]".
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: RETRIEVE_TOP_K,
    filter_unit: UNIT,
  });

  if (error) {
    throw new Error(`Vector search failed: ${error.message}`);
  }

  const candidates = (data ?? []) as RetrievedChunk[];
  if (candidates.length === 0) {
    return { chunks: [], citations: [] };
  }

  // Rerank and keep the best RERANK_TOP_N.
  const ranked = await rerank(
    question,
    candidates.map((c) => c.content),
    RERANK_TOP_N,
  );

  const top = ranked.map((r) => ({
    ...candidates[r.index],
    rerank_score: r.relevance_score,
  }));

  const citations = top.map((c, i) => toCitation(c, i + 1));
  return { chunks: top, citations };
}
