import { ReaperConfig, ReaperScriptResult } from '../types/reaper.js';
export declare class ReaperScriptRunner {
    private config;
    constructor(config?: ReaperConfig);
    private getDefaultReaperPath;
    /**
     * Execute a Lua script in REAPER via ReaScript
     */
    executeLuaScript(luaCode: string): Promise<ReaperScriptResult>;
    /**
     * Execute a Python script in REAPER (requires REAPER Python extension)
     */
    executePythonScript(pythonCode: string): Promise<ReaperScriptResult>;
    /**
     * Generate Lua code wrapper with JSON output
     */
    wrapLuaWithOutput(luaCode: string): string;
    /**
     * Check if REAPER is available
     */
    isReaperAvailable(): Promise<boolean>;
    /**
     * Execute script and return raw output
     */
    executeRaw(script: string, isLua?: boolean): Promise<string>;
}
//# sourceMappingURL=script-runner.d.ts.map