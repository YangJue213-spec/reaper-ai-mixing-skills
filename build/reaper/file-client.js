import { promises as fs } from 'fs';
import { join } from 'path';
import { ReaperPluginParser } from './plugin-parser.js';
/**
 * File-based IPC Client for REAPER MCP Server
 * Uses JSON files in temp directory for communication instead of TCP
 * Compatible with Mac M4 and systems where LuaSocket causes issues
 */
export class ReaperFileClient {
    pluginParser;
    config;
    ipcDir;
    commandFile;
    responseFile;
    lockFile;
    isProcessing = false;
    constructor(config = {}) {
        this.config = {
            scriptTimeout: config.scriptTimeout || 30000, // Increased from 10s to 30s
            ...config,
        };
        // Use fixed temp directory to match Lua script (must match file-bridge.lua)
        this.ipcDir = '/tmp/reaper-mcp';
        this.commandFile = join(this.ipcDir, 'command.json');
        this.responseFile = join(this.ipcDir, 'response.json');
        this.lockFile = join(this.ipcDir, 'lock');
        // Initialize plugin parser
        this.pluginParser = new ReaperPluginParser();
    }
    /**
     * Initialize IPC directory
     */
    async connect() {
        try {
            // Ensure IPC directory exists
            await fs.mkdir(this.ipcDir, { recursive: true });
            // Clean up any stale files
            await this.cleanup();
            console.error(`REAPER File Client: Using IPC directory ${this.ipcDir}`);
        }
        catch (error) {
            throw new Error(`Failed to initialize IPC: ${error}`);
        }
    }
    /**
     * Disconnect and cleanup
     */
    async disconnect() {
        await this.cleanup();
    }
    /**
     * Check if client is ready
     */
    isConnected() {
        return true; // File-based client is always "connected"
    }
    /**
     * Clean up IPC files
     */
    async cleanup() {
        try {
            await fs.unlink(this.commandFile).catch(() => { });
            await fs.unlink(this.responseFile).catch(() => { });
            await fs.unlink(this.lockFile).catch(() => { });
        }
        catch {
            // Ignore cleanup errors
        }
    }
    /**
     * Send command and wait for response via file IPC
     */
    async sendCommand(action, params = {}) {
        if (this.isProcessing) {
            throw new Error('Another command is already in progress');
        }
        this.isProcessing = true;
        try {
            // Clean up any stale files
            await this.cleanup();
            // Write command to file
            const command = {
                id: Date.now().toString(),
                action,
                params,
                timestamp: Date.now(),
            };
            await fs.writeFile(this.commandFile, JSON.stringify(command, null, 2), 'utf-8');
            // Wait for response with timeout
            const startTime = Date.now();
            const timeout = this.config.scriptTimeout || 10000;
            while (Date.now() - startTime < timeout) {
                try {
                    // Check if response file exists
                    await fs.access(this.responseFile);
                    // Read and parse response
                    const responseData = await fs.readFile(this.responseFile, 'utf-8');
                    const response = JSON.parse(responseData);
                    // Verify response matches our command
                    if (response.id === command.id) {
                        // Clean up files
                        await this.cleanup();
                        if (response.success) {
                            return response.data;
                        }
                        else {
                            throw new Error(response.error || 'Command failed');
                        }
                    }
                }
                catch (error) {
                    // Response not ready yet, wait a bit
                    if (error.code !== 'ENOENT') {
                        // Not a "file not found" error, might be parse error
                        console.error('Error reading response:', error);
                    }
                }
                // Small delay to prevent busy waiting
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            // Timeout
            await this.cleanup();
            throw new Error(`Command timeout after ${timeout}ms`);
        }
        finally {
            this.isProcessing = false;
        }
    }
    // ===== Project Commands =====
    async getProjectInfo() {
        return this.sendCommand('get_project_info');
    }
    // ===== Track Commands =====
    async getTrackInfo(trackIndex) {
        return this.sendCommand('get_track_info', { trackIndex });
    }
    async createTrack(trackName) {
        return this.sendCommand('create_track', { trackName });
    }
    async setTrackVolume(trackIndex, volumeDb) {
        await this.sendCommand('set_track_volume', { trackIndex, volumeDb });
    }
    async setTrackPan(trackIndex, pan) {
        await this.sendCommand('set_track_pan', { trackIndex, pan });
    }
    async deleteTrack(trackIndex) {
        return this.sendCommand('delete_track', { trackIndex });
    }
    async setTrackName(trackIndex, trackName) {
        return this.sendCommand('set_track_name', { trackIndex, trackName });
    }
    async setTrackSend(sourceTrackIndex, destTrackIndex, volumeDb = 0) {
        await this.sendCommand('set_track_send', { sourceTrackIndex, destTrackIndex, volumeDb });
    }
    async setTrackOutput(sourceTrackIndex, destTrackIndex) {
        await this.sendCommand('set_track_output', { sourceTrackIndex, destTrackIndex });
    }
    async batchSetTrackSend(sourceTrackIndices, destTrackIndex, volumeDb = 0) {
        return this.sendCommand('batch_set_track_send', { sourceTrackIndices, destTrackIndex, volumeDb });
    }
    async batchSetTrackOutput(sourceTrackIndices, destTrackIndex) {
        return this.sendCommand('batch_set_track_output', { sourceTrackIndices, destTrackIndex });
    }
    // ===== FX Commands =====
    async listAvailableFX() {
        return this.sendCommand('list_available_fx');
    }
    async getTrackFX(trackIndex) {
        return this.sendCommand('get_track_fx', { trackIndex });
    }
    async addFXToTrack(trackIndex, fxName, vendor) {
        // Step 1: Search for plugins matching the input name
        const searchResults = await this.pluginParser.getAvailablePlugins(fxName, 50);
        if (searchResults.plugins.length === 0) {
            throw new Error(`No plugins found matching "${fxName}"`);
        }
        // Step 2: Get track channel info (now includes isMono from Lua)
        const trackInfo = await this.getTrackInfo(trackIndex);
        const isMono = trackInfo.isMono || false;
        const trackChannels = trackInfo.trackChannels || 2;
        console.error(`[addFXToTrack] Track ${trackIndex} is ${isMono ? 'mono' : 'stereo'} (${trackChannels} channels), searching for "${fxName}"`);
        // Step 3: Filter and score matching plugins
        const plugins = searchResults.plugins;
        const scoredPlugins = [];
        for (const plugin of plugins) {
            const pluginLower = plugin.toLowerCase();
            const nameLower = fxName.toLowerCase();
            // Check if plugin contains the base name
            if (!pluginLower.includes(nameLower))
                continue;
            let score = 0;
            // ===== STRONGLY PREFER VST3 =====
            if (plugin.startsWith('VST3:')) {
                score += 1000; // Very high priority for VST3
            }
            else if (plugin.startsWith('VST:')) {
                score += 50;
            }
            else if (plugin.startsWith('AU:')) {
                score += 25;
            }
            // Check for Mono/Stereo indicators
            const isPluginMono = pluginLower.includes('mono') || pluginLower.includes('(m)');
            const isPluginStereo = pluginLower.includes('stereo') || pluginLower.includes('(s)');
            // Score based on channel match
            if (isMono && isPluginMono) {
                // Mono track + Mono plugin = perfect match
                score += 200;
            }
            else if (!isMono && isPluginStereo) {
                // Stereo track + Stereo plugin = perfect match
                score += 200;
            }
            else if (!isPluginMono && !isPluginStereo) {
                // No channel indicator (e.g., FabFilter) = neutral
                score += 100;
            }
            else if (isMono && isPluginStereo) {
                // Mono track + Stereo plugin = penalty
                score -= 50;
            }
            else if (!isMono && isPluginMono) {
                // Stereo track + Mono plugin = penalty
                score -= 50;
            }
            // Prefer Waves/FabFilter plugins with proper naming
            if (plugin.includes('(Waves)') || plugin.includes('(FabFilter)')) {
                score += 50;
            }
            scoredPlugins.push({ plugin, score });
        }
        // Sort by score descending
        scoredPlugins.sort((a, b) => b.score - a.score);
        // Get best match
        let bestMatch = scoredPlugins.length > 0 ? scoredPlugins[0].plugin : null;
        // If no match found with name filtering, try first result
        if (!bestMatch && plugins.length > 0) {
            bestMatch = plugins[0];
        }
        if (!bestMatch) {
            throw new Error(`Could not find suitable plugin match for "${fxName}"`);
        }
        console.error(`[addFXToTrack] Matched "${fxName}" to "${bestMatch}" (isMono: ${isMono})`);
        // Step 4: Add the FX with the exact matched name
        const result = await this.sendCommand('add_fx_to_track_smart', {
            trackIndex,
            fxName: bestMatch,
            vendor: vendor || 'generic'
        });
        return {
            ...result,
            matchedFrom: bestMatch
        };
    }
    /**
     * Add FX by exact resolved plugin name (bypasses plugin search).
     * Use this after resolvePluginName() has already determined the exact name.
     */
    async addFXByExactName(trackIndex, exactName, vendor) {
        return this.sendCommand('add_fx_to_track_smart', {
            trackIndex,
            fxName: exactName,
            vendor: vendor || 'generic',
        });
    }
    async removeFXFromTrack(trackIndex, fxIndex) {
        await this.sendCommand('remove_fx_from_track', { trackIndex, fxIndex });
    }
    async getFXParams(trackIndex, fxIndex) {
        return this.sendCommand('get_fx_params', { trackIndex, fxIndex });
    }
    async setFXParam(trackIndex, fxIndex, paramIndex, value) {
        await this.sendCommand('set_fx_param', { trackIndex, fxIndex, paramIndex, value });
    }
    async setFXParamNormalized(trackIndex, fxIndex, paramIndex, normalizedValue) {
        await this.sendCommand('set_fx_param_normalized', { trackIndex, fxIndex, paramIndex, normalizedValue });
    }
    async setFXEnabled(trackIndex, fxIndex, enabled) {
        await this.sendCommand('set_fx_enabled', { trackIndex, fxIndex, enabled });
    }
    async tweakFXParameter(trackIndex, fxName, paramIndex, normalizedValue) {
        return this.sendCommand('tweak_fx_parameter', { trackIndex, fxName, paramIndex, normalizedValue });
    }
    async manageTrackRouting(action, sourceTrackIndex, destTrackIndex, enable, sendVolumeDb, sendPan) {
        return this.sendCommand('manage_track_routing', {
            action,
            sourceTrackIndex,
            destTrackIndex,
            enable,
            sendVolumeDb,
            sendPan
        });
    }
    // ===== Media Item Commands =====
    async splitItem(trackIndex, itemIndex, position) {
        return this.sendCommand('split_item', { trackIndex, itemIndex, position });
    }
    async getItemInfo(trackIndex, itemIndex) {
        return this.sendCommand('get_item_info', { trackIndex, itemIndex });
    }
    // ===== Audio Analysis =====
    async analyzeMediaItem(trackIndex, itemIndex) {
        return this.sendCommand('analyze_media_item', { trackIndex, itemIndex });
    }
    async isolateAndRender(trackId, startTime, endTime, renderMode = 'solo', trackIds) {
        return this.sendCommand('isolate_and_render', {
            trackId,
            startTime,
            endTime,
            renderMode,
            trackIds
        });
    }
    async getSwsLoudness(trackId, startTime, endTime) {
        return this.sendCommand('get_sws_loudness', { trackId, startTime, endTime });
    }
    // ===== Plugin Parser Methods =====
    /**
     * Get available plugins from REAPER's plugin cache
     * Uses local file parsing instead of Lua communication for better performance
     */
    async getAvailablePlugins(searchQuery, maxResults, forceRefresh) {
        return this.pluginParser.getAvailablePlugins(searchQuery, maxResults, forceRefresh);
    }
}
//# sourceMappingURL=file-client.js.map