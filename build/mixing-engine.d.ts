import { ReaperFileClient } from './reaper/file-client.js';
export interface FreqProblem {
    detected: boolean;
    severity: number;
    center_freq: number;
}
export interface MixDiagnosis {
    track_type: 'vocal' | 'guitar' | 'bass' | 'drums' | 'piano' | 'synth' | 'full_mix';
    problems: {
        issue: string;
        evidence: string;
        severity: 'high' | 'medium' | 'low';
    }[];
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
export declare function buildFxChain(analysis: MixDiagnosis): FxOperation[];
export declare function executeFxChain(trackIndex: number, chain: FxOperation[], analysis: MixDiagnosis, fileClient: ReaperFileClient): Promise<{
    success: boolean;
    applied: string[];
    errors: string[];
}>;
//# sourceMappingURL=mixing-engine.d.ts.map