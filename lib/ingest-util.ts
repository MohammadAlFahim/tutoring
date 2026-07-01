/**
 * Extract a lecture/week number from a filename for citation metadata.
 *
 * Anchored on a word boundary and restricted to the explicit "lecture/lec/
 * week/wk" tokens (the old bare single-letter `l` matched things like
 * "html5", "level1", "final2"). Accepts up to 3 digits so "Lecture 100" isn't
 * truncated to 10.
 */
export function extractLectureNo(name: string): number | undefined {
  const m = name.match(/\b(?:lecture|lec|week|wk)\s*[-_ ]?(\d{1,3})\b/i);
  return m ? Number(m[1]) : undefined;
}
