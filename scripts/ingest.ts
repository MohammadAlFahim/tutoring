/**
 * Ingestion pipeline (runs LOCALLY — never in a serverless function).
 *
 *   npm run ingest
 *
 * Reads /course-materials/{slides,notes,recordings,textbooks}, extracts text
 * (PDF per-page, DOCX, MD/TXT, and audio via OpenAI transcription with segment
 * timestamps), chunks it, embeds with Voyage, and upserts into pgvector.
 *
 * Idempotent: each file is hashed; unchanged files are skipped, changed files
 * are re-processed.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv(); // also pick up .env if present

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

import {
  EMBEDDING_USD_PER_MTOK,
  TRANSCRIBE_MODEL,
  UNIT,
} from "../lib/config";
import { getEmbeddingProvider } from "../lib/ai/embeddings";
import { chunkText, estimateTokens, formatTimestamp } from "../lib/chunking";
import { extractLectureNo } from "../lib/ingest-util";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import type { ChunkMetadata, SourceType } from "../lib/types";

const ROOT = path.resolve(process.cwd(), "course-materials");
const DIRS: Record<string, SourceType> = {
  slides: "slides",
  notes: "notes",
  recordings: "recording",
  textbooks: "textbook",
};

const PDF_EXT = new Set([".pdf"]);
const DOCX_EXT = new Set([".docx"]);
const TEXT_EXT = new Set([".md", ".markdown", ".txt", ".text"]);
const AUDIO_EXT = new Set([".mp3", ".mp4", ".m4a", ".wav", ".webm", ".mpga", ".mpeg"]);
const OPENAI_MAX_BYTES = 25 * 1024 * 1024; // 25MB API limit

interface PreparedChunk {
  content: string;
  metadata: ChunkMetadata;
  tokenCount: number;
}

// --------------------------------------------------------------------------

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function titleFromFilename(file: string): string {
  return path
    .basename(file, path.extname(file))
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function walk(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.name.startsWith(".")) continue;
    if (e.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

// --------------------------------------------------------------------------
// Parsers
// --------------------------------------------------------------------------

async function pdfPages(buffer: Buffer): Promise<string[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text : [text]).map((t) => (t ?? "").trim());
}

async function docxText(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  return value.trim();
}

interface Segment {
  start: number;
  end: number;
  text: string;
}

async function transcribe(openai: OpenAI, file: string): Promise<Segment[]> {
  const res = (await openai.audio.transcriptions.create({
    file: createReadStream(file),
    model: TRANSCRIBE_MODEL,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  })) as unknown as { segments?: Segment[]; text?: string };

  if (res.segments && res.segments.length > 0) {
    return res.segments.map((s) => ({
      start: s.start,
      end: s.end,
      text: (s.text ?? "").trim(),
    }));
  }
  // Fallback: no segments returned — treat whole transcript as one segment.
  return res.text ? [{ start: 0, end: 0, text: res.text.trim() }] : [];
}

function chunkSegments(
  segments: Segment[],
  lectureNo: number | undefined,
  targetTokens = 800,
): PreparedChunk[] {
  const chunks: PreparedChunk[] = [];
  let cur: Segment[] = [];
  let curTokens = 0;

  const flush = () => {
    if (cur.length === 0) return;
    const content = cur.map((s) => s.text).join(" ").trim();
    if (!content) {
      cur = [];
      curTokens = 0;
      return;
    }
    const start = cur[0].start;
    const meta: ChunkMetadata = {
      timestamp: Math.floor(start),
      timestamp_label: formatTimestamp(start),
    };
    if (lectureNo != null) meta.lecture_no = lectureNo;
    chunks.push({ content, metadata: meta, tokenCount: estimateTokens(content) });
  };

  for (const seg of segments) {
    const t = estimateTokens(seg.text);
    if (curTokens + t > targetTokens && cur.length > 0) {
      flush();
      // 1-segment overlap for continuity.
      const tail = cur.slice(-1);
      cur = [...tail];
      curTokens = tail.reduce((sum, s) => sum + estimateTokens(s.text), 0);
    }
    cur.push(seg);
    curTokens += t;
  }
  flush();
  return chunks;
}

// --------------------------------------------------------------------------
// Build prepared chunks for one file
// --------------------------------------------------------------------------

async function prepareChunks(
  absFile: string,
  sourceType: SourceType,
  openai: OpenAI,
): Promise<PreparedChunk[]> {
  const ext = path.extname(absFile).toLowerCase();
  const base = path.basename(absFile);
  const lectureNo = extractLectureNo(base);
  const out: PreparedChunk[] = [];

  if (PDF_EXT.has(ext)) {
    const buffer = await readFile(absFile);
    const pages = await pdfPages(buffer);
    pages.forEach((pageText, idx) => {
      const page = idx + 1;
      for (const c of chunkText(pageText)) {
        const meta: ChunkMetadata = { page };
        if (lectureNo != null) meta.lecture_no = lectureNo;
        out.push({ content: c.content, metadata: meta, tokenCount: c.tokenCount });
      }
    });
    return out;
  }

  if (DOCX_EXT.has(ext)) {
    const buffer = await readFile(absFile);
    const text = await docxText(buffer);
    for (const c of chunkText(text)) {
      const meta: ChunkMetadata = {};
      if (lectureNo != null) meta.lecture_no = lectureNo;
      out.push({ content: c.content, metadata: meta, tokenCount: c.tokenCount });
    }
    return out;
  }

  if (TEXT_EXT.has(ext)) {
    const text = (await readFile(absFile, "utf8")).toString();
    for (const c of chunkText(text)) {
      const meta: ChunkMetadata = {};
      if (lectureNo != null) meta.lecture_no = lectureNo;
      out.push({ content: c.content, metadata: meta, tokenCount: c.tokenCount });
    }
    return out;
  }

  if (AUDIO_EXT.has(ext)) {
    const info = await stat(absFile);
    if (info.size > OPENAI_MAX_BYTES) {
      console.warn(
        `  ⚠ Skipping ${base}: ${(info.size / 1e6).toFixed(1)}MB exceeds the ` +
          `25MB transcription limit. Split it (e.g. with ffmpeg) and re-run.`,
      );
      return out;
    }
    console.log(`  🎙  Transcribing ${base} (this can take a while)…`);
    const segments = await transcribe(openai, absFile);
    return chunkSegments(segments, lectureNo);
  }

  console.warn(`  ⚠ Unsupported file type, skipping: ${base}`);
  return out;
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function embedAll(contents: string[]): Promise<string[]> {
  const provider = getEmbeddingProvider();
  const BATCH = 64;
  const vectors: string[] = [];
  for (let i = 0; i < contents.length; i += BATCH) {
    const batch = contents.slice(i, i + BATCH);
    const embedded = await provider.embed(batch, "document");
    for (const vec of embedded) vectors.push(JSON.stringify(vec));
  }
  return vectors;
}

async function main() {
  console.log(`\n📚 Ingesting course materials for: ${UNIT}\n`);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const supabase = createSupabaseAdminClient();

  let docsProcessed = 0;
  let docsSkipped = 0;
  let totalChunks = 0;
  let totalTokens = 0;

  for (const [dir, sourceType] of Object.entries(DIRS)) {
    const absDir = path.join(ROOT, dir);
    const files = await walk(absDir);
    if (files.length === 0) continue;

    console.log(`\n── ${dir} (${files.length} file${files.length > 1 ? "s" : ""})`);

    for (const absFile of files) {
      const rel = path.relative(ROOT, absFile);
      const buffer = await readFile(absFile);
      const hash = sha256(buffer);

      // Idempotency: look up by (unit, original_filename).
      const { data: existing } = await supabase
        .from("documents")
        .select("id, content_hash")
        .eq("unit", UNIT)
        .eq("original_filename", rel)
        .maybeSingle();

      if (existing && existing.content_hash === hash) {
        console.log(`  = ${rel} (unchanged)`);
        docsSkipped++;
        continue;
      }
      // Parse/transcribe FIRST — the previously-good document stays intact if
      // this fails (a transient transcription error must never wipe existing data).
      let chunks: PreparedChunk[];
      try {
        chunks = await prepareChunks(absFile, sourceType, openai);
      } catch (err) {
        console.error(`  ✗ Failed to parse ${rel} (existing data kept):`, err);
        continue;
      }
      if (chunks.length === 0) {
        console.log(`  – ${rel} (no extractable content)`);
        continue;
      }

      // Embed BEFORE touching the DB, so an embedding failure also leaves the
      // old document intact and never strands a hash-matching empty document.
      console.log(`  + ${rel} → ${chunks.length} chunks, embedding…`);
      let vectors: string[];
      try {
        vectors = await embedAll(chunks.map((c) => c.content));
      } catch (err) {
        console.error(`  ✗ Embedding failed for ${rel} (existing data kept):`, err);
        continue;
      }

      // New content is fully ready. Now replace: delete the old row (chunks
      // cascade) and insert the new document + its chunks. If any insert fails,
      // remove the new (partial) document so the next run reprocesses the file.
      if (existing) {
        await supabase.from("documents").delete().eq("id", existing.id);
      }

      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .insert({
          unit: UNIT,
          title: titleFromFilename(absFile),
          source_type: sourceType,
          original_filename: rel,
          content_hash: hash,
        })
        .select("id")
        .single();
      if (docErr || !doc) {
        console.error(`  ✗ Could not insert document ${rel}:`, docErr?.message);
        continue;
      }

      const rows = chunks.map((c, i) => ({
        document_id: doc.id,
        content: c.content,
        embedding: vectors[i],
        metadata: c.metadata,
        token_count: c.tokenCount,
      }));

      // Insert in batches to keep request sizes sane.
      const INSERT_BATCH = 200;
      let chunkInsertFailed = false;
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        const { error: chunkErr } = await supabase
          .from("chunks")
          .insert(rows.slice(i, i + INSERT_BATCH));
        if (chunkErr) {
          console.error(`  ✗ Chunk insert failed for ${rel}:`, chunkErr.message);
          chunkInsertFailed = true;
          break;
        }
      }
      if (chunkInsertFailed) {
        // Roll back the incomplete document so idempotency reprocesses it next run.
        await supabase.from("documents").delete().eq("id", doc.id);
        continue;
      }

      docsProcessed++;
      totalChunks += chunks.length;
      totalTokens += chunks.reduce((s, c) => s + c.tokenCount, 0);
    }
  }

  const estCost = (totalTokens / 1_000_000) * EMBEDDING_USD_PER_MTOK;

  console.log("\n────────────────────────────────────────");
  console.log("✅ Ingestion complete");
  console.log(`   Documents processed: ${docsProcessed}`);
  console.log(`   Documents unchanged: ${docsSkipped}`);
  console.log(`   Chunks created:      ${totalChunks}`);
  console.log(`   Approx. tokens:      ${totalTokens.toLocaleString()}`);
  console.log(
    `   Est. embedding cost: ~$${estCost.toFixed(4)} (at $${EMBEDDING_USD_PER_MTOK}/M tokens)`,
  );
  console.log("────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error("\n❌ Ingestion failed:", err);
  process.exit(1);
});
