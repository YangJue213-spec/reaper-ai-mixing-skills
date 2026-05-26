import { ReaperConfig, ProjectInfo, TrackInfo, FXInfo, FXParam } from '../types/reaper.js';
/**
 * File-based IPC Client for REAPER MCP Server
 * Uses JSON files in temp directory for communication instead of TCP
 * Compatible with Mac M4 and systems where LuaSocket causes issues
 */
export declare class ReaperFileClient {
    private pluginParser;
    private config;
    private ipcDir;
    private commandFile;
    private responseFile;
    private lockFile;
    private isProcessing;
    constructor(config?: ReaperConfig);
    /**
     * Initialize IPC directory
     */
    connect(): Promise<void>;
    /**
     * Disconnect and cleanup
     */
    disconnect(): Promise<void>;
    /**
     * Check if client is ready
     */
    isConnected(): boolean;
    /**
     * Clean up IPC files
     */
    private cleanup;
    /**
     * Send command and wait for response via file IPC
     */
    private sendCommand;
    getProjectInfo(): Promise<ProjectInfo>;
    getTrackInfo(trackIndex: number): Promise<TrackInfo>;
    createTrack(trackName?: string): Promise<{
        trackIndex: number;
        trackNumber: number;
        name: string;
    }>;
    setTrackVolume(trackIndex: number, volumeDb: number): Promise<void>;
    setTrackPan(trackIndex: number, pan: number): Promise<void>;
    deleteTrack(trackIndex: number): Promise<{
        deletedTrackIndex: number;
    }>;
    setTrackName(trackIndex: number, trackName: string): Promise<{
        trackIndex: number;
        trackNumber: number;
        name: string;
    }>;
    setTrackSend(sourceTrackIndex: number, destTrackIndex: number, volumeDb?: number): Promise<void>;
    setTrackOutput(sourceTrackIndex: number, destTrackIndex: number): Promise<void>;
    batchSetTrackSend(sourceTrackIndices: number[], destTrackIndex: number, volumeDb?: number): Promise<{
        results: any[];
    }>;
    batchSetTrackOutput(sourceTrackIndices: number[], destTrackIndex: number): Promise<{
        results: any[];
    }>;
    listAvailableFX(): Promise<string[]>;
    getTrackFX(trackIndex: number): Promise<FXInfo[]>;
    addFXToTrack(trackIndex: number, fxName: string, vendor?: 'waves' | 'fabfilter' | 'generic'): Promise<{
        fxIndex: number;
        fxName: string;
        trackChannels: number;
        isMono: boolean;
        vendor: string;
        matchedFrom?: string;
    }>;
    /**
     * Add FX by exact resolved plugin name (bypasses plugin search).
     * Use this after resolvePluginName() has already determined the exact name.
     */
    addFXByExactName(trackIndex: number, exactName: string, vendor?: string): Promise<{
        fxIndex: number;
        fxName: string;
        trackChannels: number;
        isMono: boolean;
        vendor: string;
    }>;
    removeFXFromTrack(trackIndex: number, fxIndex: number): Promise<void>;
    getFXParams(trackIndex: number, fxIndex: number): Promise<FXParam[]>;
    setFXParam(trackIndex: number, fxIndex: number, paramIndex: number, value: number): Promise<void>;
    setFXParamNormalized(trackIndex: number, fxIndex: number, paramIndex: number, normalizedValue: number): Promise<void>;
    setFXEnabled(trackIndex: number, fxIndex: number, enabled: boolean): Promise<void>;
    tweakFXParameter(trackIndex: number, fxName: string, paramIndex: number, normalizedValue: number): Promise<{
        fxIndex: number;
        fxName: string;
        paramIndex: number;
        paramName: string;
        normalizedValue: number;
        actualValue: number;
    }>;
    manageTrackRouting(action: 'add_send' | 'remove_send' | 'set_master_send', sourceTrackIndex: number, destTrackIndex?: number, enable?: boolean, sendVolumeDb?: number, sendPan?: number): Promise<any>;
    splitItem(trackIndex: number, itemIndex: number, position: number): Promise<{
        newItemIndex: number;
    }>;
    getItemInfo(trackIndex: number, itemIndex: number): Promise<{
        position: number;
        length: number;
        fadeIn: number;
        fadeOut: number;
        volume: number;
    }>;
    analyzeMediaItem(trackIndex: number, itemIndex: number): Promise<{
        itemLength: number;
        sampleRate: number;
        numChannels: number;
        peakLevel: number;
    }>;
    isolateAndRender(trackId: string, startTime: number, endTime: number, renderMode?: 'solo' | 'master' | 'chorus' | 'multi', trackIds?: string[]): Promise<{
        filePath: string;
        renderMode: string;
        trackId?: string;
        trackIds?: string[];
        startTime: number;
        endTime: number;
    }>;
    getSwsLoudness(trackId: string, startTime: number, endTime: number): Promise<{
        trackId: string;
        integratedLUFS: number;
        truePeak: number;
        startTime: number;
        endTime: number;
        note?: string;
    }>;
    /**
     * Get available plugins from REAPER's plugin cache
     * Uses local file parsing instead of Lua communication for better performance
     */
    getAvailablePlugins(searchQuery?: string, maxResults?: number, forceRefresh?: boolean): Promise<{
        plugins: string[];
        count: number;
        source: 'cache' | 'fallback';
        searchQuery?: string;
    }>;
}
//# sourceMappingURL=file-client.d.ts.map