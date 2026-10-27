# Environment audit

Scope: existing baseera worktree, production/power31-reel (actual path productions/power31-reel), npm lockfile, TypeScript/ESLint, source scenes, scripts and asset directories. No new Remotion project created. Git initially reported untracked productions/ because prior source was persisted through GitHub APIs; those files were preserved.

Linux x86_64, Node 24.22.1, Python 3.12.14. No nvidia-smi or exposed CUDA; torch absent. No Windows/WSL installation is applicable to this environment.

| Tool | Initial status | Final status / evidence |
|---|---|---|
| remotion / CLI / media / captions / fonts | INSTALLED 4.0.539 | Imports + real video render PASS |
| GSAP | MISSING | INSTALLED 3.14.2; parseEase functional test PASS |
| @remotion/gsap | MISSING | OPTIONAL; direct pure GSAP easing avoids asynchronous ticker |
| @remotion/paths | available transitively | INSTALLED explicitly 4.0.539; 3-4-5 path length PASS |
| @remotion/transitions | MISSING | INSTALLED 4.0.539; import PASS; engine has frame-driven opacity transition |
| @remotion/three, three, React Three Fiber | MISSING | OPTIONAL; no mesh/WebGL requirement for this plane-based demo |
| @remotion/rive | MISSING | OPTIONAL; no Rive input assets |
| motion-core / GsapCamera | MISSING in scanned worktree | New engine is not a duplicate of these unavailable modules |
| SVG rigs | INSTALLED | Existing Stickman.tsx and scenes preserved; previous frame pixel comparison PASS |
| Image utilities | INSTALLED Pillow 12.3.0 | JPG/manual region/PNG-alpha preprocessing tested |
| Audio alignment utilities | INSTALLED scripts and word timing JSON | Existing timing/audio gates untouched; not a newly installed Whisper engine |
| OpenCV / PyTorch | MISSING | OPTIONAL; Pillow covers manual extraction without new heavy dependency |
| SAM 2 | MISSING | DEFERRED; not installed, not run, no model weights downloaded |
| Depth Anything V2 | MISSING | DEFERRED; not installed, not run; depth supplied manually |

No BROKEN or INCOMPATIBLE package remains in the tested engine. An initial Node test-loader assertion was fixed by setting its filename explicitly; this was a test harness error, not an animation success. No claim of GPU rendering.

Claude integration: repository contains claude-plugin/plugin.json and skills, and Canva MCP bridge scripts. This does not prove installation/connection in an external Claude client. No user-level credentials or client settings were read or changed. ChatGPT service tools are not claimed as Claude Code installations.

Evidence: npm-tree.txt, typescript-check.txt, engine-eslint.txt, compositions.txt, engine-test-results.json, render-tests.json, determinism-results.json.
