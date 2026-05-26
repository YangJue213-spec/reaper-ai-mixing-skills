import { ReaperScriptRunner } from './script-runner.js';
import { AudioAnalysisResult, ProjectInfo, MediaItemInfo } from '../types/reaper.js';
export declare class ReaperAudioAnalyzer {
    private runner;
    constructor(runner: ReaperScriptRunner);
    /**
     * Analyze a media item's audio properties
     */
    analyzeMediaItem(trackIndex: number, itemIndex: number): Promise<AudioAnalysisResult>;
    /**
     * Get project information
     */
    getProjectInfo(): Promise<ProjectInfo>;
    /**
     * Analyze selected items
     */
    analyzeSelectedItems(): Promise<AudioAnalysisResult[]>;
    /**
     * Get media item information
     */
    getMediaItemInfo(trackIndex: number, itemIndex: number): Promise<MediaItemInfo>;
    /**
     * Get peak level of specific item (fast method)
     */
    getItemPeak(trackIndex: number, itemIndex: number): Promise<number>;
    /**
     * Analyze frequency content (using REAPER's spectral analysis)
     */
    analyzeSpectrum(trackIndex: number, itemIndex: number): Promise<any>;
}
//# sourceMappingURL=audio-analyzer.d.ts.map