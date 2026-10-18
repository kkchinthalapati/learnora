/* Original soundtrack for the Learnora ad, synthesised from scratch (no samples, no third-party audio).
   120 BPM grid (beat = 0.5 s). Cue times mirror window.AD_T in ad.html. */
import fs from "fs";

const SR = 44100, DUR = 30, N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N), SEND = new Float32Array(N);
let seed = 20261010;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 4294967296) * 2 - 1; };
const TAU = Math.PI * 2;

const T = { strike: 1.0, fall: 1.45, paper: 1.72, stick: 1.78, zoom: 2.55, s2: 3.0, tooMuch: 6.9, implode: 7.72, reveal: 8.0, whip: 11.5, tap1: 12.5, tap2: 13.35, push: 14.45, car: 15.0, pay: 19.0, push2: 23.2, fin: 24.8 };
const nt = (m) => 440 * Math.pow(2, (m - 69) / 12);          // midi -> Hz

function put(t0, gen, len, gain, pan = 0, send = 0) {
  const s = Math.floor(t0 * SR), n = Math.floor(len * SR);
  const a = (pan + 1) * Math.PI / 4, gl = gain * Math.cos(a), gr = gain * Math.sin(a);
  for (let i = 0; i < n; i++) {
    const idx = s + i; if (idx < 0 || idx >= N) continue;
    const v = gen(i / SR, i);
    L[idx] += v * gl; R[idx] += v * gr; SEND[idx] += v * gain * send;
  }
}

/* ---------- voices ---------- */
function kick(t0, g = 1) {
  let ph = 0;
  put(t0, (t) => { const f = 46 + 150 * Math.exp(-t * 34); ph += TAU * f / SR; return (Math.sin(ph) * Math.exp(-t * 7.5) + (t < .004 ? rnd() * .6 : 0)); }, .45, g);
}
function boom(t0, len = 1.6, f0 = 38, g = 1) {
  let ph = 0;
  put(t0, (t) => { const f = f0 * (1 + 1.4 * Math.exp(-t * 9)); ph += TAU * f / SR; return Math.sin(ph) * Math.exp(-t * (3.2 / len * 1.2)) + Math.sin(ph * 2.01) * .18 * Math.exp(-t * 8); }, len, g, 0, .08);
}
function burst(t0, len, g, hp = 1500) {
  let prev = 0, lp = 0;
  const a = Math.exp(-TAU * hp / SR);
  put(t0, (t) => { const x = rnd(); lp = a * lp + (1 - a) * x; const y = x - lp; return y * Math.exp(-t / (len / 5)); }, len, g, 0, .25);
}
function hat(t0, g = .22, open = false) { burst(t0, open ? .22 : .05, g, 6500); }
function clap(t0, g = .6) { [0, .011, .022].forEach((d, i) => burst(t0 + d, i === 2 ? .14 : .02, g * (i === 2 ? 1 : .7), 1200)); }
function bass(t0, len, f, g = .55) {
  let ph = 0, lp = 0;
  put(t0, (t) => { ph += f / SR; const saw = (ph % 1) * 2 - 1; const cut = .02 + .12 * Math.exp(-t * 14); lp += cut * (saw - lp); return (lp * .9 + Math.sin(TAU * ph) * .8) * Math.min(1, t * 400) * Math.exp(-t * (2.2 / len)); }, len, g);
}
function pluck(t0, f, g = .3, len = .9, pan = 0) {
  let ph = 0;
  put(t0, (t) => { ph += f / SR; const v = Math.sin(TAU * ph) + .42 * Math.sin(TAU * 2 * ph) * Math.exp(-t * 14) + .2 * Math.sin(TAU * 3 * ph) * Math.exp(-t * 22); return v * Math.exp(-t * 5.5) * Math.min(1, t * 900); }, len, g, pan, .55);
}
function bell(t0, f, g = .25, len = 2.4, pan = 0) {
  let ph = 0, pm = 0;
  put(t0, (t) => { ph += f / SR; pm += f * 3.51 / SR; const idx = 2.6 * Math.exp(-t * 2.2); return Math.sin(TAU * ph + idx * Math.sin(TAU * pm)) * Math.exp(-t * 1.5) * Math.min(1, t * 1200); }, len, g, pan, .8);
}
function pad(t0, len, notes, g = .16) {
  const ph = notes.map((_, i) => i * .13), det = [1, 1.0043, .9961];
  put(t0, (t) => {
    let s = 0;
    notes.forEach((f, k) => det.forEach((d, j) => { ph[k] += f * d / SR; ph[k] %= 1e6; s += ((ph[k] % 1) * 2 - 1) * .33; }));
    const a = Math.min(1, t / 1.1), r = Math.min(1, (len - t) / .9);
    return s / notes.length * Math.max(0, a) * Math.max(0, r);
  }, len, g, 0, .5);
}
/* band-passed noise sweep: a directional whoosh. peak controls where the energy sits (0..1) */
function whoosh(t0, len, f0, f1, g = .5, pan = 0, peak = .5, q = 1.6) {
  let low = 0, band = 0;
  put(t0, (t) => {
    const p = t / len, f = f0 * Math.pow(f1 / f0, p), gg = 2 * Math.sin(Math.PI * Math.min(f, 9000) / SR);
    const x = rnd(); low += gg * band; const high = x - low - band / q; band += gg * high;
    const env = p < peak ? Math.pow(p / peak, 2) : Math.pow((1 - p) / (1 - peak), 2);
    return band * env * 2.2;
  }, len, g, pan, .18);
}
function riser(t0, len, g = .5, f0 = 300, f1 = 7000) {
  let ph = 0, low = 0, band = 0;
  put(t0, (t) => {
    const p = t / len, f = f0 * Math.pow(f1 / f0, p), gg = 2 * Math.sin(Math.PI * Math.min(f, 9000) / SR);
    const x = rnd(); low += gg * band; const high = x - low - band / 2.2; band += gg * high;
    ph += (110 + 520 * p * p) / SR;
    return (band * 1.6 + Math.sin(TAU * ph) * .25 * p) * Math.pow(p, 1.6);
  }, len, g, 0, .15);
}
function suck(t0, len, g = .4) {   // reverse swell, used for the held beat before the implosion
  let low = 0, band = 0;
  put(t0, (t) => { const p = t / len, f = 6000 * Math.pow(.08, p), gg = 2 * Math.sin(Math.PI * Math.min(f, 9000) / SR); const x = rnd(); low += gg * band; const high = x - low - band / 1.4; band += gg * high; return band * 2 * Math.pow(1 - p, 1.4) * Math.min(1, t * 30); }, len, g, 0, .3);
}
function tick(t0, f = 2600, g = .22, pan = 0) { let ph = 0; put(t0, (t) => { ph += f / SR; return Math.sin(TAU * ph) * Math.exp(-t * 90); }, .08, g, pan, .35); }
function thud(t0, g = .7) { let ph = 0; put(t0, (t) => { ph += TAU * (36 + 70 * Math.exp(-t * 12)) / SR; return Math.sin(ph) * Math.exp(-t * 6.5); }, .7, g); }

/* ============================ the score ============================ */
const beat = .5;
const Am = [45, 57, 64, 69, 72, 76];                 // A2 A3 E4 A4 C5 E5 (Am add9 voicing built later)

/* --- HOOK (0 – 3.0): hits, then a reversed build to the dive --- */
kick(0, 1); boom(0, 1.3, 40, .95); burst(0, .3, .6, 2500);
kick(.5, .55);
kick(1.0, .9); whoosh(.92, .3, 700, 5200, .5, -.3, .8); tick(1.02, 3200, .25);
thud(T.fall + .02, .9); whoosh(T.fall, .5, 4200, 160, .35, 0, .25);
whoosh(T.paper, .34, 5200, 450, .5, .2, .45);
[69, 72, 74, 76, 79, 81].forEach((m, i) => pluck(T.stick + i * .045, nt(m + 12), .22, .8, (i - 2.5) * .12));
riser(T.zoom - .05, .5, .55, 500, 8000);
/* silence for a heartbeat, then the drop */
boom(T.s2, 1.4, 42, 1.0); kick(T.s2, 1); burst(T.s2, .25, .5, 2200);

/* --- THE NOISE (3.0 – 7.5): four on the floor, accelerating --- */
for (let t = T.s2 + beat; t < 7.49; t += beat) kick(t, .85);
for (let t = T.s2 + .25; t < 7.49; t += beat) hat(t, .18 + .1 * (t - T.s2) / 4.5);
for (let t = 4.0; t < 7.49; t += beat) { const f = [45, 45, 48, 43][Math.floor(((t - 4) / beat)) % 4]; bass(t + .25, .22, nt(f + 12 - 12), .5); }
for (let t = 5.0; t < 6.5; t += beat) clap(t + beat, .35);
for (let t = 6.5; t < 7.0; t += .25) clap(t, .45);
for (let t = 7.0; t < 7.49; t += .125) clap(t, .5);
riser(T.s2 + .6, 6.9 - (T.s2 + .6), .7, 400, 9000);
boom(7.12, 1.0, 38, .9); clap(7.12, .9); burst(7.12, .25, .7, 1800);
/* 7.5 – 7.72: everything drops out, a reversed breath */
suck(7.5, .22, .5);
whoosh(T.implode, .3, 300, 7000, .6, 0, .9, 1.4);

/* --- THE REVEAL (8.0 – 19.0) --- */
boom(T.reveal, 1.8, 41, 1.0); burst(T.reveal, .35, .65, 2000);
const stab = [45, 57, 64, 71, 74, 79];                 // A2 A3 E4 B4 D5 G5-ish: Am9 shimmer
stab.forEach((m, i) => bell(T.reveal + .005 * i, nt(m + 12), .17, 2.2, (i - 2.5) * .15));
whoosh(T.reveal + .02, .95, 6500, 260, .55, -.4, .2);
const bassLine = [45, 45, 48, 43];                     // A A C G one-per-beat, octave low
for (let t = T.reveal + beat; t < T.pay - .5; t += beat) {
  const bi = Math.floor((t - T.reveal) / beat);
  if (t > 18.5) break;
  kick(t, .8);
  bass(t, .18, nt(bassLine[bi % 4]), .55);
  bass(t + .25, .13, nt(bassLine[bi % 4] + (bi % 8 === 7 ? 7 : 0)), .38);
  hat(t + .25, .2);
  if (bi % 2 === 1 && t > 9) clap(t, .5);
  if (t > 12.0) { hat(t + .125, .1); hat(t + .375, .1); }
}
/* whip: word crosses the frame */
whoosh(T.whip - .24, .26, 400, 6500, .75, -.6, .9);
boom(T.whip, .5, 55, .5); burst(T.whip, .12, .5, 3000);
whoosh(T.whip + .12, .3, 6500, 380, .6, .6, .1);
whoosh(T.whip + .12, .85, 5200, 300, .35, .4, .2);
/* phone entrance */
whoosh(T.reveal + .05, 1.0, 5200, 250, .35, .5, .15);
/* UI */
tick(T.tap1, 2200, .28, .2); tick(T.tap2, 2000, .28, .2);
bell(T.tap2 + .02, nt(88), .2, 1.6, .2); bell(T.tap2 + .1, nt(93), .17, 1.8, .2);
/* push-in and the carousel assembling */
riser(T.push - .1, .65, .75, 500, 9000);
boom(T.car, 1.2, 40, 1.0); burst(T.car, .25, .55, 2200);
[0, .07, .14].forEach((d, i) => tick(T.car + .12 + d, 1800 + i * 500, .22, -0.4 + i * .4));
whoosh(T.car + .02, .9, 6200, 300, .5, 0, .2);
whoosh(16.55, .62, 700, 5500, .5, -.5, .5); whoosh(17.75, .62, 700, 5500, .5, .5, .5);
tick(17.15, 2400, .2); tick(18.37, 2400, .2);
whoosh(18.45, .55, 3200, 180, .45, 0, .3);

/* --- THE PAYOFF (19 – 24.8): quiet --- */
pad(T.pay, 5.8, [nt(45), nt(52), nt(57), nt(64), nt(69)].map((x) => x), .22);
thud(T.pay + .02, .55);
whoosh(T.pay + .1, .95, 5000, 220, .4, 0, .3);
const arp = [57, 60, 64, 67, 69, 67, 64, 60];
for (let i = 0; i < 20; i++) pluck(T.pay + 1.0 + i * beat, nt(arp[i % arp.length] + 12), .13 + (i < 4 ? 0 : .02), .9, ((i % 4) - 1.5) * .15);
bell(T.pay + 1.05, nt(81), .18, 2.5, -.2);
for (let t = 21.0; t < 23.2; t += 1.0) kick(t, .35);
riser(T.pay + 3.0, T.fin - (T.pay + 3.0) - .02, .55, 250, 8500);
tick(T.pay + 3.55, 2000, .12, .3);                 // the ring closes on the button
tick(T.push2 - .08, 2300, .3, .1);                 // the tap itself
whoosh(T.push2, 1.55, 300, 7000, .55, 0, .95, 1.4);
/* total cut: 24.78 – 24.98 is silence, so the next hit lands harder */

/* --- THE BRAND FINISH (25.0 – 29.0) --- */
const FIN = 25.0;
boom(FIN, 2.8, 36, 1.0); kick(FIN, 1); burst(FIN, .4, .6, 1800);
whoosh(FIN, .8, 6800, 200, .5, 0, .2);
[45, 57, 64, 69, 73, 76, 81].forEach((m, i) => bell(FIN + .02 + i * .012, nt(m + 12), .17, 3.4, (i - 3) * .12));   // A major add9 shimmer
pad(FIN, 4.4, [nt(45), nt(57), nt(61), nt(64), nt(71)], .24);
[76, 81, 85, 88].forEach((m, i) => pluck(FIN + .95 + i * .2, nt(m), .2, 1.2, (i - 1.5) * .25));           // tagline motif
bell(FIN + 1.75, nt(93), .16, 2.2, .1);
tick(FIN + 2.55, 3000, .2); whoosh(FIN + 2.5, .5, 900, 5200, .22, 0, .7);
bell(FIN + 2.7, nt(81), .2, 2.0, -.1); bell(FIN + 2.72, nt(88), .15, 2.0, .1);
kick(FIN + 2.0, .4); kick(FIN + 3.0, .3);

/* ============================ master ============================ */
/* reverb on the send bus: four combs into two all-passes, stereo-decorrelated */
function reverb(inp, delays, fb = .78) {
  const out = new Float32Array(N);
  delays.forEach((d) => { const buf = new Float32Array(d); let idx = 0; let lp = 0; for (let i = 0; i < N; i++) { const y = buf[idx]; lp += .35 * (y - lp); buf[idx] = inp[i] + lp * fb; out[i] += y * .25; if (++idx >= d) idx = 0; } });
  [225, 556].forEach((d) => { const buf = new Float32Array(d); let idx = 0; for (let i = 0; i < N; i++) { const y = buf[idx]; const x = out[i]; buf[idx] = x + y * .5; out[i] = y - x * .5; if (++idx >= d) idx = 0; } });
  return out;
}
const wetL = reverb(SEND, [1557, 1617, 1491, 1422]), wetR = reverb(SEND, [1580, 1640, 1514, 1445]);
for (let i = 0; i < N; i++) { L[i] += wetL[i] * .55; R[i] += wetR[i] * .55; }

/* hard carve-outs: the held breath before the implosion and the pause before the brand hit */
const mute = (a, b) => { for (let i = Math.floor(a * SR); i < Math.floor(b * SR) && i < N; i++) { const k = Math.min(1, Math.min(i - a * SR, b * SR - i) / (.012 * SR)); L[i] *= 1 - k; R[i] *= 1 - k; } };
mute(24.79, 24.97);
/* final fade */
for (let i = 0; i < N; i++) { const t = i / SR; if (t > 28.3) { const g = Math.max(0, 1 - (t - 28.3) / 0.7); L[i] *= g; R[i] *= g; } }

let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const norm = .9 / peak;
const pcm = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  const l = Math.tanh(L[i] * norm * 1.25) / Math.tanh(1.25), r = Math.tanh(R[i] * norm * 1.25) / Math.tanh(1.25);
  pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(l * 32000))), i * 4);
  pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(r * 32000))), i * 4 + 2);
}
const hdr = Buffer.alloc(44);
hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write("WAVEfmt ", 8); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22);
hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write("data", 36); hdr.writeUInt32LE(pcm.length, 40);
fs.writeFileSync("learnora-ad.wav", Buffer.concat([hdr, pcm]));
console.log("wrote learnora-ad.wav", (N / SR).toFixed(1) + "s", "raw peak", peak.toFixed(2));
