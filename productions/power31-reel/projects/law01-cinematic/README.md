# Law01 — Complete cinematic reel with actual narration

The full reel is available with the user-selected ElevenLabs voice, actual recording-derived captions, and completed technical QA. Duration 99.683s, 1080×1920, 60fps, 5981 frames, H.264/yuv420p and AAC mono 48kHz. No music.

- [Final MP4](https://chatgpt.com/library?file_id=libfile_3a8b26e0c99c81918ff44fc14efc8151&account_id=personal)
- [Final narration MP3](https://chatgpt.com/library?file_id=libfile_c0be691744808191895d4f3ef32120c8&account_id=personal)
- [Production audio assets: original MP3, mastered WAV and final MP3](https://chatgpt.com/library?file_id=libfile_1794e09e30f8819183e2937ea7c4a144&account_id=personal)
- [Approved original drawings, used layers, alignment metadata and Cairo font](https://chatgpt.com/library?file_id=libfile_3f113f52c07c8191800ca1734d61d500&account_id=personal)
- [Final visual QA evidence](https://chatgpt.com/library?file_id=libfile_7267d76ea7d88191b684260425f8fb57&account_id=personal)
- [Preserved earlier silent visual review](https://chatgpt.com/library?file_id=libfile_3d87843e086c81918c9c90ad2a7d966a&account_id=personal)
- [Final reusable Project JSON](scene-configs/Law01-Cinematic-Final.json)
- [30-shot manifest](storyboard/shot-manifest.json) / [Arabic table](storyboard/shot-manifest-ar.md) / [CSV](storyboard/shot-manifest.csv)
- [Recording-aligned SRT](subtitles/Law01-Recording-Aligned.srt) / [Caption JSON](subtitles/Law01-Recording-Aligned.json)
- [QA report](qa/qa-report-ar.md) / [machine report](qa/qa-report.json)
- [Arabic production guide](production-guide-ar.md)
- [Historical/editorial review](editorial-review-ar.md)

Exactly one authorized ElevenLabs v4 generation used voice `dlGxemPxFMTY7iXagmOj`, costing 1215.8784 credits (USD 0.2210688 as reported by the provider). The approved 209-word script is unchanged. The original recording is preserved; local processing and two local ASR model sizes incurred no provider charge. No paid transcription, MotionLab, new images or music were generated.

All 30 drawings are reused; 13 shots have actual separated depth planes. Character motion remains bounded whole-cutout lean, eye movement and approved pose changes. The original CinematicCameraEngine and all pre-existing source files for the other projects retain their hashes. Entry point `src/law01/index.ts` exposes the full composition and all 30 independent shot previews.

The actual MP4 measures -16.09 LUFS and -5.68 dBTP. Full-file decoding, black/freeze detection and audio clipping/silence checks pass. Four waveform comparisons with the mastered recording show zero measured sample lag. Ninety-five delivered-video samples match the corresponding global timeline frames within lossy-video tolerance. Repeated renders and two legacy before/after samples match exactly. Compatibility testing is sampled; no full re-render of every old film or its audio is claimed.

Caption timing comes from local forced word alignment, not the previous estimated 96s timeline. Its model timing grid is 20ms; there is no independent 17ms phonetic ground-truth claim or claim of human listening review. Raw ASR spelling variations are preserved in the QA reports; captions use the approved Arabic spellings.

The full audiovisual review passed without another picture/audio correction; the Final file is a preserved byte-identical copy of it. Earlier silent-review configuration and reports remain under `versions/visual-review-v1`. Extract both media asset packs at `productions/power31-reel`; media binaries are provided in the packs rather than placeholders in Git. Artifact links are private to their owning account.

This update is based on default branch `claude/serene-franklin-qhg0cg` at `91a28654689a645758ccf5644dac4489d2f8ae19`, after PR #15 was already merged. This production does not merge any PR.
