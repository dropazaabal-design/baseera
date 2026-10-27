# Installation report

Existing Remotion 4.0.539 and React 19.2.3 preserved. npm used with exact pins. Installed gsap@3.14.2, @remotion/transitions@4.0.539 and @remotion/paths@4.0.539. Remotion packages added using the existing CLI add command. Registry peer check for @remotion/gsap required GSAP >=3.12 <4; direct integration uses the compatible pinned GSAP, so the wrapper was not necessary.

The original node_modules was a symlink to the preceding attention project. Only that symlink was removed before npm ci created an independent dependency tree; its target was not modified. No global installation or destructive Git operation.

Python: .venv-cinematic created with system-site-packages to reuse the already working Pillow. No Python package was newly installed. It is an isolated interpreter with inherited package visibility, not a fully hermetic environment. For a separate machine create a clean venv and install Pillow==12.3.0 there.

Three/WebGL, Rive, SAM 2, Depth Anything V2, torch and OpenCV not installed: no capability required by this test justified their cost. There is no automatic semantic segmentation, inferred depth or generative inpainting. Manual masks/rectangles, transparent plates and a supplied clean background are the practical CPU path.
