import { VoiceprintProfile } from '../types';

const STORAGE_KEY = 'aanya_owner_voiceprint_v1';

export function loadVoiceprintProfile(): VoiceprintProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VoiceprintProfile;
  } catch {
    return null;
  }
}

export function saveVoiceprintProfile(profile: VoiceprintProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearVoiceprintProfile(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Extracts a normalized 16-band spectral signature and estimated pitch (F0)
 * from live Web Audio AnalyserNode data.
 */
export function extractAudioFeatures(
  freqData: Uint8Array,
  timeData: Float32Array,
  sampleRate: number
): { bands: number[]; rms: number; pitchHz: number } {
  // 1. RMS energy
  let sumSq = 0;
  for (let i = 0; i < timeData.length; i++) {
    sumSq += timeData[i] * timeData[i];
  }
  const rms = Math.sqrt(sumSq / timeData.length);

  // 2. 16 spectral bands focused on human vocal range (80Hz - 4000Hz)
  const bands = new Array<number>(16).fill(0);
  const binHz = sampleRate / 2 / freqData.length;
  const minBin = Math.max(1, Math.floor(80 / binHz));
  const maxBin = Math.min(freqData.length - 1, Math.ceil(4000 / binHz));
  const span = Math.max(1, maxBin - minBin);

  for (let b = 0; b < 16; b++) {
    const start = minBin + Math.floor((b / 16) * span);
    const end = minBin + Math.floor(((b + 1) / 16) * span);
    let acc = 0;
    let count = 0;
    for (let i = start; i <= end; i++) {
      acc += freqData[i] / 255;
      count++;
    }
    bands[b] = count > 0 ? acc / count : 0;
  }

  // L2 normalize bands
  const norm = Math.sqrt(bands.reduce((s, v) => s + v * v, 0)) || 1;
  for (let b = 0; b < 16; b++) {
    bands[b] /= norm;
  }

  // 3. Rough pitch F0 via autocorrelation (75Hz - 350Hz)
  let pitchHz = 140;
  if (rms > 0.015) {
    const minLag = Math.floor(sampleRate / 350);
    const maxLag = Math.min(Math.floor(timeData.length / 2), Math.floor(sampleRate / 75));
    let bestLag = minLag;
    let bestCorr = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i < maxLag; i++) {
        corr += timeData[i] * timeData[i + lag];
      }
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }
    if (bestLag > 0) {
      pitchHz = sampleRate / bestLag;
    }
  }

  return { bands, rms, pitchHz };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

export function matchOwnerVoiceprint(
  liveBands: number[],
  livePitchHz: number,
  liveRms: number,
  profile: VoiceprintProfile
): { isMatch: boolean; score: number; reason: string } {
  if (liveRms < profile.energyThreshold) {
    return { isMatch: false, score: 0, reason: 'Background noise below gate' };
  }
  const spectralSim = cosineSimilarity(liveBands, profile.spectralBands);
  const pitchDiff = Math.abs(livePitchHz - profile.pitchHz) / Math.max(80, profile.pitchHz);
  const pitchScore = Math.max(0, 1 - pitchDiff * 0.8);
  const combinedScore = spectralSim * 0.72 + pitchScore * 0.28;

  const isMatch = combinedScore >= 0.74;
  return {
    isMatch,
    score: Math.round(combinedScore * 100),
    reason: isMatch ? 'Owner voice verified' : 'Unrecognized speaker filtered',
  };
}
