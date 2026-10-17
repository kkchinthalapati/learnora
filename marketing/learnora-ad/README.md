# Learnora — "Noise → Signal" (29 s, 1080×1920, 30 fps)

Vertical hero commercial. One idea: studying is noise; Learnora finds the signal.
Colour story: paper + black → vermilion (the problem) → teal (the answer) → one indigo accent (the logo) at the end.

## Files

| File | What it is |
|---|---|
| `ad.html` | The whole film: one GSAP master timeline (`window.TL`), built from DOM + CSS 3D transforms. Edit scene timings in the `T` object near the top of the script. |
| `capture.mjs` | Captures the real app screens (390×844 @3×) from the dev **harness** into `assets/`. |
| `render.mjs` | Deterministic renderer: seeks the timeline to `t = i/60`, screenshots each frame. |
| `synth.mjs` | Original soundtrack, synthesised from scratch (no samples). Writes `learnora-ad.wav`. |
| `preview.mjs` | Renders still frames at given times: `node preview.mjs 3.2 8.4 25.5` → `prev/`. |
| `assets/` | Captured app screens, the logo, vendored GSAP 3.12.5. |

## Rebuild

```bash
npm --prefix webapp run dev -- --port 5199      # harness at /app/harness.html (fixture data, no production traffic)
node capture.mjs                                 # refresh app screenshots (only if the UI changed)
node synth.mjs                                   # soundtrack -> learnora-ad.wav
node render.mjs                                  # 1740 frames @ 60 fps -> frames/
ffmpeg -framerate 60 -i frames/f%05d.jpg -i learnora-ad.wav -t 29 \
  -vf "tmix=frames=3:weights='1 2 1',fps=30,format=yuv420p" \
  -af "loudnorm=I=-14:TP=-1.5:LRA=9" -c:v libx264 -crf 16 -preset slow \
  -c:a aac -b:a 256k -movflags +faststart learnora-ad.mp4
```

Playwright is borrowed from `webapp/node_modules`; the scripts `createRequire` it from there.

## Storyboard (120 BPM, 1 beat = 0.5 s)

| Time | Beat | Visual | Transition out | Sound |
|---|---|---|---|---|
| 0.0–1.5 | **Hook** | Paper-white frame, "YOU / STUDIED." as tall slab type bleeding past the frame edges; letters land with staggered overshoot. A vermilion strike cuts through at 1.0. | Letters fall away under gravity, the paper sheet drops off the frame (1.45–2.05). | Kick + sub boom + noise burst at 0.0; zip at 1.0; descending thud at 1.45; bandpass sweep for the paper drop. |
| 1.8–3.0 | Hook II | Black. "Did it" slides in; "STICK?" pops letter by letter with elastic scale. | Snap-zoom into the dot of the question mark (camera dives and centres on it), filling the frame with teal. | Pentatonic plucks on each letter; reversed riser into the cut. |
| 3.0–7.5 | **Problem** | 44 study-clutter chips burst from one point through real 3D depth; the near ones go out of focus, vermilion chips are the urgent ones; outlined "WHERE DO YOU START?" behind; camera shake ramps with the chaos. 6.9: "TOO MUCH." slams in front. | 7.5–7.72: everything freezes (a held breath), then the whole wall implodes to a point. | Four-on-the-floor from 3.0, hats, accelerating clap roll, long riser; hard slam at 7.1; total silence 7.5–7.72; reversed whoosh. |
| 8.0–11.5 | **Reveal 1 — what to study next** | Circular reveal from the implosion point. Phone flies in with perspective, "NEXT." parallaxes behind. Camera pushes into the headline card and rings it, pans to "Mistakes to fix". | Giant "SURE?" slab whips across the frame. | Boom + Am9 bell stab at 8.0; bassline starts; whoosh with the phone. |
| 11.5–15.0 | **Reveal 2 — say how sure you are** | Real quiz states: cursor arcs in, taps *Fairly sure*, then *Catalysts*; the app's own "Correct!" appears. Phone orbits. | Camera dives into the *Correct!* pill. | Whip hit; two UI ticks; rising bell pair on correct; riser for the dive. |
| 15.0–19.0 | **Reveal 3 — the whole picture** | Three real screens (exam readiness, flashcard review with Again/Hard/Good/Easy, "What's fading") fan out of one stack onto a 3D carousel and swing past one by one under a giant "KNOW.". | Carousel pulls back into the dark. | Boom on the fan-out, three ticks as the layers split, whoosh per swing; beat drops out at 18.5. |
| 19.0–24.8 | **Payoff** | The clutter chips are drawn into one point and the real "Study Rates next." card settles in their place. "One clear next step." Slow camera, no drums. | Push through the *Learn Rates step by step* button until teal fills the frame. | Pad + soft arpeggio, heartbeat kick; riser into the push; **0.18 s of total silence** (24.79–24.97). |
| 25.0–29.0 | **Brand** | Logo pops on teal, ink opens behind it, an indigo halo turns, "Know your grade. / Own your study." flips in letter by letter, CTA pill wipes open. Hold. | — | Sub boom + A-major add9 bell chord; tagline motif; final tick on the CTA; long decay. |

## What the product shows (all real)

Every UI frame is a capture of the shipping React app running in `webapp/src/dev/harness.tsx`:
Today ("Study Rates next", Mistakes to fix), Quiz (confidence rating, correct feedback), Exams (readiness),
Flashcard review (Again/Hard/Good/Easy), Progress ("What's fading"), and the five-tab bar.
The data behind those screens is the harness's **sample student** (fixtures), not a real account.
No AI output is shown, because the harness has no model behind it.
The only on-screen copy that is not from the app is the ad's own typography.

## Audio

`synth.mjs` generates everything (kick, sub, hats, claps, bass, plucks, FM bells, pads, band-passed whooshes, risers, a Schroeder reverb) from maths.
No samples, no third-party music, so there is nothing to license. To use a licensed track instead, mute `learnora-ad.wav` and drop yours in on the `-i` line; the cut points are on the 0.5 s grid so any 120 BPM track lines up.

## Notes for whoever re-runs this

- The Node scripts load Playwright from `webapp/node_modules` through an absolute `createRequire(...)` path near the top of each file; edit that path if the repo lives somewhere else.
- 3D here means real CSS 3D (`perspective`, `rotateX/Y`, `translateZ`) on flat captured screenshots, not a WebGL scene. Motion blur is temporal: frames are rendered at 60 fps and blended 1-2-1 down to 30.
- `frames/`, `prev/` and `qa*/` are throw-away render output and are not part of the source.
