import type { AmbiancePreset } from "./types";

/* Web Audio API Focus Sound Generator
 * Synthesizes ambient focus sounds in real time without external MP3 assets.
 */

class AmbianceEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private currentPreset: AmbiancePreset = "none";
  private currentVolume: number = 0.5;
  private activeNodes: { stop?: () => void; disconnect?: () => void }[] = [];

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
        this.buildRain(ctx, master);
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
    }
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
}

export const ambianceEngine = new AmbianceEngine();
