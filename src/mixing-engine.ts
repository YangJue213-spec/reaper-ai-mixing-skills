import { ReaperFileClient } from './reaper/file-client.js';
import { resolvePluginName } from './reaper/plugin-parser.js';

export interface FreqProblem {
  detected: boolean;
  severity: number;   // 0.0 ~ 1.0
  center_freq: number; // Hz
}

export interface MixDiagnosis {
  track_type: 'vocal' | 'guitar' | 'bass' | 'drums' | 'piano' | 'synth' | 'full_mix';
  problems: { issue: string; evidence: string; severity: 'high' | 'medium' | 'low' }[];
  freq_problems: {
    rumble: FreqProblem;
    boomy: FreqProblem;
    muddy: FreqProblem;
    harsh: FreqProblem;
    thin: FreqProblem;
    dull: FreqProblem;
    sibilance: FreqProblem;
  };
  dynamic_range: 'wide' | 'medium' | 'narrow';
  noise_floor: 'clean' | 'some' | 'heavy';
  needs_reverb: boolean;
  needs_delay: boolean;
  reverb_send_level: number;
  delay_send_level: number;
}

export interface FxParam {
  paramIndex: number;
  normalizedValue: number;
  description: string;
}

export interface FxOperation {
  type: 'fx' | 'send_bus';
  plugin?: string;
  busName?: string;
  params: FxParam[];
  reason: string;
}

// ===== Normalized value helpers =====

function eqFreqNorm(freq_hz: number): number {
  return Math.min(1, Math.max(0, freq_hz / 24000));
}

function eqGainNorm(gain_db: number): number {
  // Range: -24 to +24 dB → 0 to 1
  // Safety clamp: ±6 dB
  const clamped = Math.min(6, Math.max(-6, gain_db));
  return (clamped + 24) / 48;
}

function eqQNorm(q: number): number {
  return Math.min(1, Math.max(0, q / 10));
}

function compThreshNorm(threshold_db: number): number {
  // Range: -60 to 0 dB → 0 to 1
  return Math.min(1, Math.max(0, (threshold_db + 60) / 60));
}

function compRatioNorm(ratio: number): number {
  // Range: 1:1 to 20:1 → 0 to 1, max 8:1 enforced
  const clamped = Math.min(8, Math.max(1, ratio));
  return (clamped - 1) / 19;
}

function attackNorm(attack_ms: number): number {
  return Math.min(1, Math.max(0, attack_ms / 500));
}

function releaseNorm(release_ms: number): number {
  return Math.min(1, Math.max(0, release_ms / 2000));
}

function delayTimeNorm(time_ms: number): number {
  return Math.min(1, Math.max(0, time_ms / 2000));
}

// ===== Dynamic EQ parameter calculator =====

interface EqCalcResult {
  freq: number;
  gain: number; // dB, already clamped ±6
  q: number;
}

function calcEqParams(problem: FreqProblem, isCut: boolean): EqCalcResult {
  const s = problem.severity;

  const gain = isCut
    ? -(1.5 + s * 4.5)  // cut: -1.5dB ~ -6.0dB
    : (1.0 + s * 3.0);  // boost: +1.0dB ~ +4.0dB

  const q = isCut
    ? 0.8 + s * 1.7     // cut Q: 0.8 ~ 2.5
    : 0.7 + s * 0.6;    // boost Q: 0.7 ~ 1.3

  return {
    freq: problem.center_freq,
    gain: Math.max(-6, Math.min(6, gain)),
    q,
  };
}

// ===== Rule engine =====

export function buildFxChain(analysis: MixDiagnosis): FxOperation[] {
  const chain: FxOperation[] = [];

  // Order 1: Gate (heavy noise floor)
  if (analysis.noise_floor === 'heavy') {
    chain.push({
      type: 'fx',
      plugin: 'ReaGate',
      params: [
        { paramIndex: 0, normalizedValue: compThreshNorm(-40), description: 'Threshold -40dB' },
        { paramIndex: 1, normalizedValue: attackNorm(5), description: 'Attack 5ms' },
        { paramIndex: 2, normalizedValue: releaseNorm(200), description: 'Release 200ms' },
      ],
      reason: 'Heavy noise floor detected — gate to clean up between phrases',
    });
  }

  // Order 2: EQ subtractive (problem frequencies, severity-driven)
  const fp = analysis.freq_problems;

  // Helper: append 3 params (freq, gain, Q) for one EQ band
  const addBand = (
    arr: FxParam[],
    p: FreqProblem,
    isCut: boolean,
    label: string
  ) => {
    const { freq, gain, q } = calcEqParams(p, isCut);
    const base = arr.length; // each band occupies 3 consecutive param indices
    arr.push({ paramIndex: base,     normalizedValue: eqFreqNorm(freq), description: `${label} ${freq}Hz` });
    arr.push({ paramIndex: base + 1, normalizedValue: eqGainNorm(gain), description: `${gain.toFixed(1)}dB (sev=${p.severity.toFixed(2)})` });
    arr.push({ paramIndex: base + 2, normalizedValue: eqQNorm(q),       description: `Q ${q.toFixed(2)}` });
  };

  const eqCuts: FxParam[] = [];
  const cutLabels: string[] = [];

  if (fp.rumble.detected) { addBand(eqCuts, fp.rumble, true, 'HP rumble'); cutLabels.push('rumble'); }
  if (fp.boomy.detected)  { addBand(eqCuts, fp.boomy,  true, 'Cut boomy'); cutLabels.push('boomy'); }
  if (fp.muddy.detected)  { addBand(eqCuts, fp.muddy,  true, 'Cut muddy'); cutLabels.push('muddy'); }
  if (fp.harsh.detected)  { addBand(eqCuts, fp.harsh,  true, 'Cut harsh'); cutLabels.push('harsh'); }

  if (eqCuts.length > 0) {
    chain.push({
      type: 'fx',
      plugin: 'ReaEQ',
      params: eqCuts,
      reason: `EQ subtractive: ${cutLabels.join(', ')}`,
    });
  }

  // Order 3: EQ additive (thin / dull, severity-driven)
  const eqBoosts: FxParam[] = [];
  const boostLabels: string[] = [];

  if (fp.thin.detected) { addBand(eqBoosts, fp.thin, false, 'Boost thin'); boostLabels.push('thin'); }
  if (fp.dull.detected) { addBand(eqBoosts, fp.dull, false, 'Air boost dull'); boostLabels.push('dull'); }

  if (eqBoosts.length > 0) {
    chain.push({
      type: 'fx',
      plugin: 'ReaEQ',
      params: eqBoosts,
      reason: `EQ additive: ${boostLabels.join(', ')}`,
    });
  }

  // Order 4: Compression
  if (analysis.dynamic_range === 'wide' || analysis.dynamic_range === 'medium') {
    const ratio = analysis.dynamic_range === 'wide' ? 4 : 2.5;
    const thresh = analysis.dynamic_range === 'wide' ? -18 : -12;
    chain.push({
      type: 'fx',
      plugin: 'ReaComp',
      params: [
        { paramIndex: 0, normalizedValue: compThreshNorm(thresh), description: `Threshold ${thresh}dB` },
        { paramIndex: 1, normalizedValue: compRatioNorm(ratio), description: `Ratio ${ratio}:1` },
        { paramIndex: 2, normalizedValue: attackNorm(10), description: 'Attack 10ms' },
        { paramIndex: 3, normalizedValue: releaseNorm(200), description: 'Release 200ms' },
      ],
      reason: `Dynamic range is ${analysis.dynamic_range} — compression to even out levels`,
    });
  }

  // Order 5: De-esser (vocal sibilance only, severity-driven)
  if (fp.sibilance.detected && analysis.track_type === 'vocal') {
    const { freq, gain, q } = calcEqParams(fp.sibilance, true);
    chain.push({
      type: 'fx',
      plugin: 'ReaEQ',
      params: [
        { paramIndex: 0, normalizedValue: eqFreqNorm(freq), description: `De-ess ${freq}Hz` },
        { paramIndex: 1, normalizedValue: eqGainNorm(gain), description: `${gain.toFixed(1)}dB (sev=${fp.sibilance.severity.toFixed(2)})` },
        { paramIndex: 2, normalizedValue: eqQNorm(q),       description: `Q ${q.toFixed(2)} (narrow)` },
      ],
      reason: `Sibilance on vocal (severity=${fp.sibilance.severity.toFixed(2)}) — narrow cut at ${freq}Hz`,
    });
  }

  // Order 6: Send → FX Reverb Bus
  if (analysis.needs_reverb) {
    const sendLevel = Math.min(1, Math.max(0, analysis.reverb_send_level ?? 0.25));
    chain.push({
      type: 'send_bus',
      busName: 'FX Reverb Bus',
      plugin: 'ReaVerbate',
      params: [
        { paramIndex: 0, normalizedValue: 0.5, description: 'Room Size 0.5' },
        { paramIndex: 1, normalizedValue: 1.0, description: 'Wet 100% (bus dry/wet via send)' },
      ],
      reason: `Reverb bus send at ${(sendLevel * 100).toFixed(0)}% — keep bus wet=100%, control level via send`,
    });
  }

  // Order 7: Send → FX Delay Bus
  if (analysis.needs_delay) {
    const sendLevel = Math.min(1, Math.max(0, analysis.delay_send_level ?? 0.20));
    chain.push({
      type: 'send_bus',
      busName: 'FX Delay Bus',
      plugin: 'ReaDelay',
      params: [
        { paramIndex: 0, normalizedValue: delayTimeNorm(375), description: 'Delay 375ms (dotted 8th at 100bpm)' },
        { paramIndex: 1, normalizedValue: 0.35, description: 'Feedback 35%' },
        { paramIndex: 2, normalizedValue: 1.0, description: 'Wet 100% (bus dry/wet via send)' },
      ],
      reason: `Delay bus send at ${(sendLevel * 100).toFixed(0)}% — keep bus wet=100%, control level via send`,
    });
  }

  return chain;
}

// ===== Executor =====

export async function executeFxChain(
  trackIndex: number,
  chain: FxOperation[],
  analysis: MixDiagnosis,
  fileClient: ReaperFileClient
): Promise<{ success: boolean; applied: string[]; errors: string[] }> {
  const applied: string[] = [];
  const errors: string[] = [];

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Get project info once for bus track lookup
  const projectInfo = await fileClient.getProjectInfo();

  for (const op of chain) {
    try {
      if (op.type === 'fx') {
        // Resolve exact plugin name from cache before adding
        const resolved = await resolvePluginName(op.plugin!);
        if (resolved.source === 'js_fallback') {
          console.error(`[MixEngine] JS fallback used for "${op.plugin}": ${resolved.exactName}`);
        }
        const addResult = await fileClient.addFXByExactName(trackIndex, resolved.exactName);
        await sleep(500);

        const fxIndex = addResult.fxIndex;

        // Apply each param
        for (const param of op.params) {
          await fileClient.setFXParamNormalized(trackIndex, fxIndex, param.paramIndex, param.normalizedValue);
          await sleep(100);
        }

        applied.push(`Added ${op.plugin} (fxIndex=${fxIndex}): ${op.reason}`);
        await sleep(500);

      } else if (op.type === 'send_bus') {
        // Find or create bus track
        const busName = op.busName!;

        // Check existing tracks for bus
        let busTrackIndex = -1;
        const trackCount = (projectInfo as any).trackCount ?? 0;

        for (let i = 0; i < trackCount; i++) {
          try {
            const ti = await fileClient.getTrackInfo(i);
            if (ti.name === busName) {
              busTrackIndex = i;
              break;
            }
          } catch {
            // ignore
          }
          await sleep(100);
        }

        if (busTrackIndex === -1) {
          // Create bus track
          const created = await fileClient.createTrack(busName);
          busTrackIndex = created.trackIndex;
          await sleep(500);

          // Resolve and add plugin to bus
          const busResolved = await resolvePluginName(op.plugin!);
          const busAddResult = await fileClient.addFXByExactName(busTrackIndex, busResolved.exactName);
          await sleep(500);

          const busFxIndex = busAddResult.fxIndex;

          // Set plugin params on bus (especially wet = 1.0)
          for (const param of op.params) {
            await fileClient.setFXParamNormalized(busTrackIndex, busFxIndex, param.paramIndex, param.normalizedValue);
            await sleep(100);
          }

          applied.push(`Created ${busName} with ${op.plugin}`);
        } else {
          applied.push(`Reused existing ${busName} (trackIndex=${busTrackIndex})`);
        }

        // Create send from source to bus
        const sendLevel = op.busName === 'FX Reverb Bus'
          ? (analysis.reverb_send_level ?? 0.25)
          : (analysis.delay_send_level ?? 0.20);

        // Convert normalized send level to dB: 0.25 ≈ -12dB, 0.20 ≈ -14dB
        const sendDb = 20 * Math.log10(Math.max(0.0001, sendLevel));

        await fileClient.setTrackSend(trackIndex, busTrackIndex, sendDb);
        await sleep(500);

        applied.push(`Send from track ${trackIndex} → ${busName} at ${sendDb.toFixed(1)}dB: ${op.reason}`);
      }
    } catch (err: any) {
      errors.push(`Failed ${op.plugin ?? op.busName}: ${err.message}`);
    }
  }

  return { success: errors.length === 0, applied, errors };
}
