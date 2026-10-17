# Third-party notices

Material in Learnora that was made by someone else, what it is, and the
licence it came under. Keep this file current when an asset is added,
replaced or removed.

## Icons — Lucide and Feather

Most icons in `webapp/src/components/icons.tsx` were drawn for Learnora. The
entries below have path data identical to, or split from, an icon in Lucide
or Feather. They were found on 2026-10-17 by comparing every `d` attribute
in that file against `lucide-static@0.460.0` and `feather-icons@4.29.2`.
Icons drawn only with `rect`, `circle` and `line` elements were not compared.

| Learnora icon | Source | Source icon | Match |
|---|---|---|---|
| `eyedropper` | Lucide | `pipette` | all 3 paths |
| `maximize` | Lucide | `maximize` | all 4 paths |
| `minimize` | Lucide | `minimize` | all 4 paths |
| `mic-off` | Lucide | `mic-off` | all 4 paths |
| `trophy` | Lucide | `trophy` | all 5 paths |
| `network` | Lucide | `network` | both paths |
| `layout` | Lucide | `panels-top-left` (formerly `layout`) | both paths |
| `sparkles` | Lucide | `sparkles`, an earlier release | main path; current Lucide draws it differently |
| `link` | Lucide and Feather | `link` | both paths |
| `book-open` | Feather | `book-open` | both paths |
| `check-circle` | Feather | `check-circle` | the arc path |
| `check-square` | Feather | `check-square` | the box path |
| `command` | Feather | `command` | the one path |
| `message-square` | Feather | `message-square` | the one path |
| `volume-2` | Feather | `volume-2` | its single path, split in two |

`phone-off` resembles Feather's `phone-off` but its numbers differ, so it is
probably a modified copy rather than an exact one.

### Lucide — ISC License

https://github.com/lucide-icons/lucide

```
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

### Feather — MIT License

https://github.com/feathericons/feather

```
The MIT License (MIT)

Copyright (c) 2013-2023 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Fonts — SIL Open Font License 1.1

Every font is loaded from Google Fonts (`fonts.googleapis.com`) at runtime;
none are copied into this repository or the build. The OFL's notice
conditions apply to redistributing the font files, which this project does
not do, so this section is informational. Licence and designers as listed in
each family's `METADATA.pb` in https://github.com/google/fonts (checked
2026-10-17).

| Family | Designer | Licence | Loaded by |
|---|---|---|---|
| Newsreader | Production Type | OFL | `webapp/index.html`, `landing.html` |
| Instrument Sans | Rodrigo Fuenzalida, Jordan Egstad | OFL | `webapp/index.html`, `landing.html` |
| Source Serif 4 | Frank Grießhammer | OFL | `webapp/index.html` |
| Outfit | Smartsheet Inc, Rodrigo Fuenzalida | OFL | `webapp/index.html`, `webapp/harness.html`, `404.html` |
| Plus Jakarta Sans | Tokotype | OFL | `webapp/index.html`, `webapp/harness.html`, `404.html` |
| Inter | Rasmus Andersson | OFL | `webapp/index.html`, `webapp/harness.html` |
| JetBrains Mono | JetBrains, Philipp Nurullin, Konstantin Bulenkov | OFL | `webapp/index.html`, `webapp/harness.html` |
| Atkinson Hyperlegible | Braille Institute, Applied Design Works, Elliott Scott, Megan Eiswerth, Linus Boman, Theodore Petrosky | OFL | `webapp/index.html`, `webapp/harness.html` |

Licence text: https://openfontlicense.org

## Marketing video — GSAP

`marketing/learnora-ad/assets/gsap.min.js` is GSAP 3.12.5 by GreenSock,
vendored for the ad's animation timeline. It is not open source; it is
"Subject to the terms at https://gsap.com/standard-license", as its own
header says, and that header is kept in the file. It is not part of the
app or the site build.

The ad's other assets: app screenshots captured from the dev harness
(`capture.mjs`), a soundtrack synthesised by `synth.mjs` (no samples), and
`assets/learnora.jpg`, which is the earlier raster logo. That image carries
C2PA Content Credentials naming OpenAI's image generator; the app has since
replaced it with `learnora-mark.svg`.

## Sounds

`webapp/public/sounds/` — two loops from "CC0 SFX loops" by rubberduck on
OpenGameArt, marked CC0 1.0 on its listing. Details in
`webapp/public/sounds/LICENCE.md`. The other ambience presets are generated
in the browser by `webapp/src/views/room/audioAmbiance.ts`.
