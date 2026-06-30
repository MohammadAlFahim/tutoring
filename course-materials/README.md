# Course materials

Drop your unit's source material into these subfolders, then run `npm run ingest`
from the project root.

```
course-materials/
├── slides/        PDF lecture slides (text extracted per page → cited as "slide N")
├── notes/         DOCX / Markdown / TXT notes (cited by title, and lecture # if in the filename)
├── recordings/    Lecture audio/video (mp3, mp4, m4a, wav…) — transcribed locally with timestamps
└── textbooks/     Larger PDFs (treated as books; chunked carefully, cited as "page N")
```

## Tips

- **Filenames become citations.** Name files clearly, e.g. `Lecture 03 - Binary Trees.pdf`.
  A number after `lecture`/`lec`/`week`/`L` in the filename is captured as the lecture
  number and shown in citations.
- **Recordings are transcribed locally** via the OpenAI transcription API when you run
  `npm run ingest` — never in the deployed app. Each file must be ≤ 25 MB (the API
  limit); split larger files with `ffmpeg` first, e.g.
  `ffmpeg -i lecture.mp4 -f segment -segment_time 1200 -c copy part_%03d.mp4`.
- **Re-running is safe.** Ingestion hashes every file: unchanged files are skipped,
  and a changed file replaces its previous chunks.
- The contents of this folder are **git-ignored** (only this README and the `.gitkeep`
  files are committed) so you don't accidentally commit copyrighted lecture content.
