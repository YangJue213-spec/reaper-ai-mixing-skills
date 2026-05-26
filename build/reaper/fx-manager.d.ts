import { ReaperScriptRunner } from './script-runner.js';
import { FXInfo, FXParam, FXPreset } from '../types/reaper.js';
export declare class ReaperFXManager {
    private runner;
    constructor(runner: ReaperScriptRunner);
    /**
     * Get list of available FX on the system
     */
    getAvailableFX(): Promise<string[]>;
    /**
     * Add FX to a track
     */
    addFXToTrack(trackIndex: number, fxName: string): Promise<number>;
    /**
     * Add FX to a media item (take FX)
     */
    addFXToItem(trackIndex: number, itemIndex: number, fxName: string): Promise<number>;
    /**
     * Remove FX from track
     */
    removeFXFromTrack(trackIndex: number, fxIndex: number): Promise<void>;
    /**
     * Get track FX information
     */
    getTrackFX(trackIndex: number): Promise<FXInfo[]>;
    /**
     * Get FX parameters
     */
    getFXParams(trackIndex: number, fxIndex: number): Promise<FXParam[]>;
    /**
     * Set FX parameter value
     */
    setFXParam(trackIndex: number, fxIndex: number, paramIndex: number, value: number): Promise<void>;
    /**
     * Set FX parameter by normalized value (0-1)
     */
    setFXParamNormalized(trackIndex: number, fxIndex: number, paramIndex: number, normalizedValue: number): Promise<void>;
    /**
     * Enable/disable FX
     */
    setFXEnabled(trackIndex: number, fxIndex: number, enabled: boolean): Promise<void>;
    /**
     * Get FX presets
     */
    getFXPresets(trackIndex: number, fxIndex: number): Promise<FXPreset[]>;
    /**
     * Set FX preset
     */
    setFXPreset(trackIndex: number, fxIndex: number, presetName: string): Promise<void>;
    /**
     * Open/close FX UI
     */
    setFXOpen(trackIndex: number, fxIndex: number, open: boolean): Promise<void>;
    /**
     * Bypass all FX on a track
     */
    bypassAllFX(trackIndex: number, bypass: boolean): Promise<void>;
    /**
     * Copy FX from one track to another
     */
    copyFX(sourceTrackIndex: number, sourceFxIndex: number, destTrackIndex: number): Promise<number>;
}
//# sourceMappingURL=fx-manager.d.ts.map