# CinematicCameraEngine

Source: src/cinematic/CinematicCameraEngine.tsx. Actual example: CinematicDemo.tsx and demo-config.ts. Frame-based 2.5D planes, not reconstructed 3D geometry.

CameraKeyframes samples a validated trajectory using GSAP power2.inOut as a pure easing function. No live GSAP timelines, ticker callbacks or timers. Zoom/push/dolly use zoom keyframes; pan uses x; tilt uses y; rotation is optional. CameraShake uses deterministic trigonometric motion and a seed. FocusTarget and CameraMoves produce keyframes. SmoothCameraFollow samples a delayed eased target trajectory (not a physics simulation).

CinematicCamera contains the viewport. ParallaxScene sorts depth; ParallaxLayer applies camera-relative translation, depth-scale, authored position/scale and frame-based velocity. Higher depth gives stronger apparent motion. Configurable reveal belongs to a layer, not a particular asset ID. Img uses contain to preserve image aspect ratio.

CharacterAnimator controls entry/exit; DoorReveal rotates its child as a plane around its left edge; LightTransition is a brief tinted opacity overlay; SceneTransition crossfades its child; SceneDirector combines scene/camera and light. EngineProbe is a rendered integration example of entrance/exit, door rotation, light and opacity. Moving shadows can be supplied as independent transparent layers with velocity; no physically based lighting is claimed.

## Offline image preparation

```sh
.venv-cinematic/bin/python scripts/engine/prepare_layers.py input.jpg public/my-scene --regions regions.json --background clean-background.png
```

regions.json is an array such as [{"id":"person","box":[100,100,220,400],"depth":2,"mask":"person-mask.png"}]. Mask is optional; a rectangle alone is not semantic segmentation. Output preserves original canvas coordinates and alpha. Without regions a flat image layer is emitted explicitly; it is not called 3D. Use the output manifest to set LayerConfig src paths under public, with depth/x/y/scale copied from its layers. Preprocessing never runs inside a video render.

For prepared transparent PNGs, place each plate in public, give it a LayerConfig entry, and reuse the same camera. Supply a clean background plate for revealed holes. No automatic hole repair is implemented; avoid camera moves that reveal missing content or finish the clean plate in an image editor.

## Animate 18 drawings

Create 18 directories under public/scenes, each containing aligned RGBA plates or a preprocessed manifest. Create 18 configs matching demo-config.ts, with asset paths, depth and camera keys adjusted for each composition. Reuse the same engine reference; do not duplicate engine code. Register 18 explicit Composition nodes for independent Studio editing, then render each by ID. Each drawing needs its own visual depth/mask review; repeating one zoom preset is not an adequate art direction pass.

## Run

npm run check; node scripts/engine/test.cjs. Start existing Studio with node --require ./scripts/runtime.cjs node_modules/@remotion/cli/remotion-cli.js studio --no-open. Existing preview server used port 3002. Render CinematicDemo (720 frames, 60fps, 1080x1920) with the existing CLI and --codec=h264 --crf=15. Supply an available --browser-executable if Chrome is not installed locally.

For publication: replace test plates with final aligned illustrations, refine painted backgrounds/masks, review full motion on a phone, add the final approved ethical script only if needed, and retain existing audio gates. This silent demo is engineering evidence, not a finished narrated social reel.
