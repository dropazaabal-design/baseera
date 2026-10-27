# PR12 review and extension

PR12 head b226fa48d714e7dfcbf9ce15fc81707f78549002 was inspected. GitHub reported it already merged by the owner at 2026-10-27T23:03:17Z into video/ethical-power31-20261027 (merge bcebaaf...). This task did not merge it.

Findings: the engine provides useful deterministic sampling and planes, but its demo owns fixed assets/keyframes; it lacks an SRT parser, project timeline, reusable presets and media preflight. Existing coordinates use a 1600x2200 scene canvas, a deliberate limitation retained for compatibility rather than silently changing projection.

Implemented an additive workflow layer. Existing CinematicCameraEngine.tsx and CinematicDemo.tsx remain byte-identical to the previous worktree. No package installation or changes to existing narration/scene source. New Root registration, scripts, project JSON and asset paths are required integration changes. Workflow development uses a separate worktree and GitHub branch based on the merged PR tree.

Configuration-owned preview registrations intentionally form one template: adding a JSON scene creates its composition automatically, rather than copying React nodes. Studio edits are through JSON/source reload or composition props; no graphical layer editor is claimed.
