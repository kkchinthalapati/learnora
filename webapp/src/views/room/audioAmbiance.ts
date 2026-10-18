import type { AmbiancePreset } from "./types";

/* Recorded loops from the CC0 pack in public/sounds (see its LICENCE.md). */
const SAMPLE_URLS = {
  rain: `${import.meta.env.BASE_URL}sounds/rain.ogg`,
  stream: `${import.meta.env.BASE_URL}sounds/water-flowing.ogg`,
} as const;

/* Web Audio API Focus Sound Generator
 * Synthesizes ambient focus sounds in real time without external MP3 assets.
 */

class AmbianceEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private currentPreset: AmbiancePreset = "none";
  private currentVolume: number = 0.5;
  private activeNodes: { stop?: () => void; disconnect?: () => void }[] = [];
  /* Recorded loops, decoded once. Presets with a file start from synthesis
     and swap to the recording when it has decoded, so a slow download never
     leaves the room silent. */
  private samples = new Map<string, AudioBuffer>();

  private initContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public getPreset(): AmbiancePreset {
    return this.currentPreset;
  }

  public getVolume(): number {
    return this.currentVolume;
  }

  public isPlaying(): boolean {
    return this.currentPreset !== "none";
  }

  public setVolume(volume: number): void {
    this.currentVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.currentVolume,
        this.ctx.currentTime,
        0.05
      );
    }
  }

  public stop(): void {
    if (this.activeNodes.length > 0) {
      for (const node of this.activeNodes) {
        try {
          node.stop?.();
        } catch {
          // ignore
        }
        try {
          node.disconnect?.();
        } catch {
          // ignore
        }
      }
      this.activeNodes = [];
    }
    this.currentPreset = "none";
  }

  public play(preset: AmbiancePreset, volume: number = this.currentVolume): void {
    this.stop();
    if (preset === "none") return;

    const ctx = this.initContext();
    this.currentPreset = preset;
    this.currentVolume = volume;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.setTargetAtTime(volume, ctx.currentTime, 0.2);
    master.connect(ctx.destination);
    this.masterGain = master;

    switch (preset) {
      case "rain":
        this.playSampleOrSynth(ctx, master, preset, SAMPLE_URLS.rain, () =>
          this.buildRain(ctx, master),
        );
        break;
      case "stream":
        this.playSampleOrSynth(ctx, master, preset, SAMPLE_URLS.stream, () =>
          this.buildWaves(ctx, master),
        );
        break;
      case "white_noise":
        this.buildWhiteNoise(ctx, master);
        break;
      case "cafe":
        this.buildCafe(ctx, master);
        break;
      case "waves":
        this.buildWaves(ctx, master);
        break;
      case "binaural":
        this.buildBinaural(ctx, master);
        break;
      case "fireplace":
        this.buildFireplace(ctx, master);
        break;
      case "wind":
        this.buildWind(ctx, master);
        break;
      case "crickets":
        this.buildCrickets(ctx, master);
        break;
    }
  }

  private playSampleOrSynth(
    ctx: AudioContext,
    dest: GainNode,
    preset: AmbiancePreset,
    url: string,
    synth: () => void,
  ): void {
    const cached = this.samples.get(url);
    if (cached) {
      this.startSampleLoop(ctx, dest, cached);
      return;
    }
    synth();
    void this.loadSample(ctx, url).then((buffer) => {
      // Only swap if this preset is still the one playing on the same output.
      if (!buffer || this.masterGain !== dest || this.currentPreset !== preset) return;
      for (const node of this.activeNodes) {
        try {
          node.stop?.();
        } catch {
          // already stopped
        }
        try {
          node.disconnect?.();
        } catch {
          // already disconnected
        }
      }
      this.activeNodes = [];
      this.startSampleLoop(ctx, dest, buffer);
    });
  }

  private async loadSample(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      this.samples.set(url, buffer);
      return buffer;
    } catch {
      // Browsers that can't decode Ogg keep the synthesised version.
      return null;
    }
  }

  private startSampleLoop(ctx: AudioContext, dest: GainNode, buffer: AudioBuffer): void {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(dest);
    source.start();
    this.activeNodes.push(source);
  }

  private createNoiseBuffer(ctx: AudioContext, type: "pink" | "brown" | "white"): AudioBuffer {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);

    if (type === "white") {
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
    } else if (type === "pink") {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    } else if (type === "brown") {
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5;
      }
    }
    return buffer;
  }

  private buildRain(ctx: AudioContext, dest: GainNode): void {
    const pink = this.createNoiseBuffer(ctx, "pink");
    const source = ctx.createBufferSource();
    source.buffer = pink;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1000, ctx.currentTime);

    // Subtle gentle random drops modulation
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(0.4, ctx.currentTime);
    lfoGain.gain.setValueAtTime(250, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    source.connect(filter);
    filter.connect(dest);

    source.start();
    lfo.start();

    this.activeNodes.push(source, lfo, filter, lfoGain);
  }

  private buildWhiteNoise(ctx: AudioContext, dest: GainNode): void {
    const brown = this.createNoiseBuffer(ctx, "brown");
    const source = ctx.createBufferSource();
    source.buffer = brown;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(700, ctx.currentTime);

    source.connect(filter);
    filter.connect(dest);
    source.start();

    this.activeNodes.push(source, filter);
  }

  private buildWaves(ctx: AudioContext, dest: GainNode): void {
    const pink = this.createNoiseBuffer(ctx, "pink");
    const source = ctx.createBufferSource();
    source.buffer = pink;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(450, ctx.currentTime);

    // Slow swell LFO (6-second cycle for ocean wave crests)
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(0.16, ctx.currentTime);
    lfoGain.gain.setValueAtTime(320, ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    source.connect(filter);
    filter.connect(dest);

    source.start();
    lfo.start();

    this.activeNodes.push(source, lfo, filter, lfoGain);
  }

  private buildCafe(ctx: AudioContext, dest: GainNode): void {
    // Warm chord drone + pink hum
    const freqs = [130.81, 164.81, 196.0, 246.94]; // C major 7
    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      oscGain.gain.setValueAtTime(0.08 / freqs.length, ctx.currentTime);

      osc.connect(oscGain);
      oscGain.connect(dest);
      osc.start();
      this.activeNodes.push(osc, oscGain);
    }

    const pink = this.createNoiseBuffer(ctx, "pink");
    const source = ctx.createBufferSource();
    source.buffer = pink;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(400, ctx.currentTime);
    filter.Q.setValueAtTime(0.6, ctx.currentTime);

    const pinkGain = ctx.createGain();
    pinkGain.gain.setValueAtTime(0.3, ctx.currentTime);

    source.connect(filter);
    filter.connect(pinkGain);
    pinkGain.connect(dest);
    source.start();

    this.activeNodes.push(source, filter, pinkGain);
  }

  private buildBinaural(ctx: AudioContext, dest: GainNode): void {
    // 10Hz Alpha wave difference (210Hz Left, 200Hz Right)
    const merger = ctx.createChannelMerger(2);

    const oscL = ctx.createOscillator();
    oscL.type = "sine";
    oscL.frequency.setValueAtTime(210, ctx.currentTime);

    const oscR = ctx.createOscillator();
    oscR.type = "sine";
    oscR.frequency.setValueAtTime(200, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, ctx.currentTime);

    oscL.connect(merger, 0, 0); // Left channel
    oscR.connect(merger, 0, 1); // Right channel
    merger.connect(gain);
    gain.connect(dest);

    oscL.start();
    oscR.start();

    this.activeNodes.push(oscL, oscR, merger, gain);
  }

  /* Fireplace: a low brown-noise rumble with crackles. The crackles are
     baked into a looping buffer (sparse, fast-decaying spikes), so there is
     no timer to drift or leak. */
  private buildFireplace(ctx: AudioContext, dest: GainNode): void {
    const seconds = 4;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let decay = 0;
    for (let i = 0; i < data.length; i++) {
      if (Math.random() < 0.0009) decay = 1;
      decay *= 0.9965;
      data[i] = (Math.random() * 2 - 1) * decay * 0.6;
    }
    const crackle = ctx.createBufferSource();
    crackle.buffer = buffer;
    crackle.loop = true;
    const crackleGain = ctx.createGain();
    crackleGain.gain.setValueAtTime(0.5, ctx.currentTime);

    const rumble = ctx.createBufferSource();
    rumble.buffer = this.createNoiseBuffer(ctx, "brown");
    rumble.loop = true;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(320, ctx.currentTime);
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.35, ctx.currentTime);

    crackle.connect(crackleGain);
    crackleGain.connect(dest);
    rumble.connect(lowpass);
    lowpass.connect(rumbleGain);
    rumbleGain.connect(dest);

    crackle.start();
    rumble.start();
    this.activeNodes.push(crackle, crackleGain, rumble, lowpass, rumbleGain);
  }

  /* Wind: pink noise through a band-pass whose centre drifts slowly, so gusts
     come and go rather than hissing flat. */
  private buildWind(ctx: AudioContext, dest: GainNode): void {
    const source = ctx.createBufferSource();
    source.buffer = this.createNoiseBuffer(ctx, "pink");
    source.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.setValueAtTime(500, ctx.currentTime);
    band.Q.setValueAtTime(0.6, ctx.currentTime);

    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.07, ctx.currentTime);
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.setValueAtTime(260, ctx.currentTime);
    lfo.connect(lfoDepth);
    lfoDepth.connect(band.frequency);

    source.connect(band);
    band.connect(dest);
    source.start();
    lfo.start();
    this.activeNodes.push(source, band, lfo, lfoDepth);
  }

  /* Night crickets: two quiet high tones, each pulsed at a chirp rate. Kept
     very low so it sits under the work rather than competing with it. */
  private buildCrickets(ctx: AudioContext, dest: GainNode): void {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.connect(dest);

    const nodes: AudioNode[] = [gain];
    for (const [freq, rate] of [[4300, 5.2], [4900, 6.7]] as const) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      const pulse = ctx.createGain();
      pulse.gain.setValueAtTime(0.5, ctx.currentTime);
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(rate, ctx.currentTime);
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.setValueAtTime(0.5, ctx.currentTime);
      lfo.connect(lfoDepth);
      lfoDepth.connect(pulse.gain);
      osc.connect(pulse);
      pulse.connect(gain);
      osc.start();
      lfo.start();
      nodes.push(osc, pulse, lfo, lfoDepth);
    }
    this.activeNodes.push(...nodes);
  }
}

export const ambianceEngine = new AmbianceEngine();
