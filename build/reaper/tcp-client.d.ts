import { ReaperConfig, AudioAnalysisResult, ProjectInfo, TrackInfo, FXInfo, FXParam } from '../types/reaper.js';
export declare class ReaperTCPClient {
    private config;
    private socket;
    private messageQueue;
    constructor(config?: ReaperConfig);
    /**
     * Connect to REAPER TCP server
     */
    connect(): Promise<void>;
    /**
     * Disconnect from REAPER
     */
    disconnect(): void;
    /**
     * Send command and wait for response
     */
    private sendCommand;
    /**
     * Handle incoming response
     */
    private handleResponse;
    /**
     * Check if connected
     */
    isConnected(): boolean;
    getProjectInfo(): Promise<ProjectInfo>;
    getTrackInfo(trackIndex: number): Promise<TrackInfo>;
    setTrackVolume(trackIndex: number, volumeDb: number): Promise<void>;
    setTrackPan(trackIndex: number, pan: number): Promise<void>;
    listAvailableFX(): Promise<string[]>;
    getTrackFX(trackIndex: number): Promise<FXInfo[]>;
    addFXToTrack(trackIndex: number, fxName: string): Promise<{
        fxIndex: number;
    }>;
    removeFXFromTrack(trackIndex: number, fxIndex: number): Promise<void>;
    getFXParams(trackIndex: number, fxIndex: number): Promise<FXParam[]>;
    setFXParam(trackIndex: number, fxIndex: number, paramIndex: number, value: number): Promise<void>;
    setFXParamNormalized(trackIndex: number, fxIndex: number, paramIndex: number, normalizedValue: number): Promise<void>;
    setFXEnabled(trackIndex: number, fxIndex: number, enabled: boolean): Promise<void>;
    analyzeMediaItem(trackIndex: number, itemIndex: number): Promise<AudioAnalysisResult>;
}
//# sourceMappingURL=tcp-client.d.ts.map