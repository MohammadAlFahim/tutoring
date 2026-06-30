export type SourceType = "slides" | "notes" | "recording" | "textbook";

/** Metadata stored on each chunk so we can build a precise citation. */
export interface ChunkMetadata {
  page?: number;
  lecture_no?: number;
  /** Seconds into a recording (start of the chunk). */
  timestamp?: number;
  /** Human-readable timestamp like "12:34". */
  timestamp_label?: string;
  [key: string]: unknown;
}

/** A retrieved + reranked chunk used to ground an answer. */
export interface RetrievedChunk {
  id: string;
  document_id: string;
  content: string;
  metadata: ChunkMetadata;
  token_count: number;
  source_title: string;
  source_type: SourceType;
  similarity: number;
  /** Voyage rerank relevance score (present after reranking). */
  rerank_score?: number;
}

/** A citation shown to the student under an answer. */
export interface Citation {
  index: number;
  source_title: string;
  source_type: SourceType;
  page?: number;
  lecture_no?: number;
  timestamp_label?: string;
  /** A short snippet of the cited text. */
  snippet: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

export type QuestionType = "multiple_choice" | "short_answer";

/** A quiz question as sent to the client (no answers leaked). */
export interface QuizQuestionPublic {
  type: QuestionType;
  question: string;
  options?: string[];
  /** Opaque signed token carrying the correct answer + explanation. */
  token: string;
}

/** The private payload embedded (signed) inside a question token. */
export interface QuizQuestionSecret {
  type: QuestionType;
  question: string;
  topic: string;
  options?: string[];
  /** For MC: the index of the correct option. */
  correct_index?: number;
  /** For short answer: a model answer / rubric used for grading. */
  model_answer?: string;
  explanation: string;
}
