# QA report

| Check | Result | Evidence |
|---|---|---|
| TypeScript | PASS | typescript-check.txt, strict existing config |
| Engine ESLint | PASS | engine-eslint.txt (empty) |
| Module functional imports | PASS | GSAP easing, path length, TransitionSeries; engine-test-results.json |
| Composition discovery | PASS | Existing Power31 and 11 scene compositions plus CinematicDemo; compositions.txt |
| Camera endpoints / interpolation / follow / invalid keys | PASS | scripts/engine/test.cjs |
| Depth-based transforms | PASS | Different depth planes produce different transforms; visually reviewed |
| Repeat-frame determinism | PASS | Frames 0,360,719 rendered in two independent invocations; pixel equality and SHA256 in determinism-results.json |
| PNG/JPG preprocessing | PASS | Synthetic JPG, manual rectangle, preserved alpha, then PNG input |
| Entrance/exit, door, light, scene opacity integration | PASS smoke | EngineProbe rendered at 1,60,120,210; not a separate pixel-level assertion for every animation parameter |
| Prior video compatibility | PASS sample | Power31 frame420 matches pre-install image exactly; render-tests.json |
| Other projects | preserved | Shared node_modules target untouched; no full rerender of every older film claimed |
| Final MP4 | PASS | 1080x1920,60fps,720 frames,12sec,H264; demo-probe.json |
| Black/freeze scan | PASS | No black_start/freeze_start in demo-final-scan.txt; thresholds 0.1s/.04 and 3s/-65dB |
| Visual review | PASS with scope | Beginning, zoom end, controller reveal, final pullback; test illustrations, not final artwork |
| SAM2 / Depth Anything | DEFERRED | Neither installed nor executed; no weights downloaded |

A Node loader assertion initially FAILED; fixed by assigning Module.filename before compiling the test module. Initial camera framing FAILED visual review due to clipped doors; reduced the zoom and pan amplitude and rendered a corrected delivery. Road visibility moved into a generic per-layer reveal config.

No audio is present, so audio QA is NOT APPLICABLE. Existing narration audio and quality thresholds were not changed.

Limits: this is 2.5D plane projection, no automatic mesh/depth reconstruction. Manual layers and clean plates remain editorial inputs. Determinism verified on three sampled frames, not every frame or every platform. Compatibility verified on one exact prior frame and retained composition discovery, not the complete historical film library. Publication still requires final artwork and full editorial review.
