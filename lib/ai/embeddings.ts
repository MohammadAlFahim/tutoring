import {
  EMBEDDING_DIM,
  EMBEDDING_MODEL,
  EMBEDDINGS_PROVIDER,
} from "@/lib/config";
import { VOYAGE_API_KEY } from "@/lib/env";

export type EmbeddingInputType = "query" | "document";

/**
 * Small interface so the embeddings provider is swappable. To add a provider,
 * implement this and wire it into `getEmbeddingProvider()` below.
 */
export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(
    texts: string[],
    inputType: EmbeddingInputType,
  ): Promise<number[][]>;
}

// ---------------------------------------------------------------------------
// Voyage AI (voyage-3-large)
// POST https://api.voyageai.com/v1/embeddings
// ---------------------------------------------------------------------------
class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly name = "voyage";
  readonly dimensions = EMBEDDING_DIM;

  async embed(
    texts: string[],
    inputType: EmbeddingInputType,
  ): Promise<number[][]> {
    if (texts.length === 0) return [];

    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VOYAGE_API_KEY()}`,
      },
      body: JSON.stringify({
        input: texts,
        model: EMBEDDING_MODEL,
        input_type: inputType,
        output_dimension: EMBEDDING_DIM,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Voyage embeddings request failed (${res.status}): ${detail}`,
      );
    }

    const json = (await res.json()) as {
      data: { embedding: number[]; index: number }[];
    };

    // Voyage returns results indexed; sort to be safe and map to vectors.
    return json.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}

let cached: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (cached) return cached;
  switch (EMBEDDINGS_PROVIDER) {
    case "voyage":
      cached = new VoyageEmbeddingProvider();
      break;
    default:
      throw new Error(
        `Unknown EMBEDDINGS_PROVIDER "${EMBEDDINGS_PROVIDER}". ` +
          `Implement EmbeddingProvider and add it to getEmbeddingProvider().`,
      );
  }
  return cached;
}

/** Convenience: embed a single query string. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await getEmbeddingProvider().embed([text], "query");
  return vec;
}
