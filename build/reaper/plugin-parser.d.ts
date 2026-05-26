export interface PluginEntry {
    exactName: string;
    displayName: string;
    vendor: string;
    type: 'VST3' | 'VST' | 'AU';
    searchTokens: string[];
}
export interface ResolveResult {
    exactName: string;
    displayName: string;
    source: 'cache' | 'js_fallback';
    confidence: 'exact' | 'high' | 'medium' | 'low';
    alternatives: string[];
}
export declare function resolvePluginName(intent: string): Promise<ResolveResult>;
export declare class ReaperPluginParser {
    /**
     * Get available plugins with optional search.
     * forceRefresh clears the module-level cache.
     */
    getAvailablePlugins(searchQuery?: string, maxResults?: number, forceRefresh?: boolean): Promise<{
        plugins: string[];
        count: number;
        totalCount: number;
        source: 'cache' | 'fallback';
        searchQuery?: string;
        cachePaths: {
            vst: string;
            au: string;
        };
    }>;
    clearCache(): void;
    getCachePaths(): {
        vst: string;
        au: string;
    };
}
//# sourceMappingURL=plugin-parser.d.ts.map