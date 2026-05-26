import { ReaperScriptRunner } from './script-runner.js';
import { TrackInfo } from '../types/reaper.js';
export declare class ReaperTrackController {
    private runner;
    constructor(runner: ReaperScriptRunner);
    /**
     * Get track information
     */
    getTrackInfo(trackIndex: number): Promise<TrackInfo>;
    /**
     * Set track volume in dB
     */
    setTrackVolume(trackIndex: number, volumeDb: number): Promise<void>;
    /**
     * Set track pan (-1 to 1)
     */
    setTrackPan(trackIndex: number, pan: number): Promise<void>;
    /**
     * Set track mute
     */
    setTrackMute(trackIndex: number, mute: boolean): Promise<void>;
    /**
     * Set track solo
     */
    setTrackSolo(trackIndex: number, solo: boolean): Promise<void>;
    /**
     * Set track name
     */
    setTrackName(trackIndex: number, name: string): Promise<void>;
    /**
     * Get all tracks info
     */
    getAllTracks(): Promise<TrackInfo[]>;
    /**
     * Set track color
     */
    setTrackColor(trackIndex: number, color: number): Promise<void>;
    /**
     * Set track height
     */
    setTrackHeight(trackIndex: number, height: number): Promise<void>;
    /**
     * Insert new track
     */
    insertTrack(index: number): Promise<number>;
    /**
     * Delete track
     */
    deleteTrack(trackIndex: number): Promise<void>;
}
//# sourceMappingURL=track-controller.d.ts.map