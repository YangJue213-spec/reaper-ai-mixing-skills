import { createConnection } from 'net';
export class ReaperTCPClient {
    config;
    socket = null;
    messageQueue = [];
    constructor(config = {}) {
        this.config = {
            host: config.host || '127.0.0.1',
            port: config.port || 12345,
            scriptTimeout: config.scriptTimeout || 5000,
        };
    }
    /**
     * Connect to REAPER TCP server
     */
    async connect() {
        return new Promise((resolve, reject) => {
            this.socket = createConnection({
                host: this.config.host,
                port: this.config.port,
            });
            this.socket.on('connect', () => {
                resolve();
            });
            this.socket.on('error', (error) => {
                reject(error);
            });
            this.socket.on('data', (data) => {
                this.handleResponse(data.toString());
            });
            this.socket.on('close', () => {
                this.socket = null;
            });
        });
    }
    /**
     * Disconnect from REAPER
     */
    disconnect() {
        if (this.socket) {
            this.socket.end();
            this.socket = null;
        }
    }
    /**
     * Send command and wait for response
     */
    async sendCommand(action, params = {}) {
        if (!this.socket) {
            throw new Error('Not connected to REAPER');
        }
        return new Promise((resolve, reject) => {
            const command = JSON.stringify({ action, params });
            // Set timeout
            const timeout = setTimeout(() => {
                reject(new Error('Command timeout'));
            }, this.config.scriptTimeout);
            // Queue the promise
            this.messageQueue.push({ resolve, reject, timeout });
            // Send command
            this.socket.write(command + '\n');
        });
    }
    /**
     * Handle incoming response
     */
    handleResponse(data) {
        const lines = data.split('\n').filter(line => line.trim());
        for (const line of lines) {
            try {
                const response = JSON.parse(line);
                const pending = this.messageQueue.shift();
                if (pending) {
                    clearTimeout(pending.timeout);
                    if (response.success) {
                        pending.resolve(response.data);
                    }
                    else {
                        pending.reject(new Error(response.error || 'Unknown error'));
                    }
                }
            }
            catch (error) {
                // Ignore parse errors
            }
        }
    }
    /**
     * Check if connected
     */
    isConnected() {
        return this.socket !== null && this.socket.writable;
    }
    // ===== Project Commands =====
    async getProjectInfo() {
        return this.sendCommand('get_project_info');
    }
    // ===== Track Commands =====
    async getTrackInfo(trackIndex) {
        return this.sendCommand('get_track_info', { trackIndex });
    }
    async setTrackVolume(trackIndex, volumeDb) {
        await this.sendCommand('set_track_volume', { trackIndex, volumeDb });
    }
    async setTrackPan(trackIndex, pan) {
        await this.sendCommand('set_track_pan', { trackIndex, pan });
    }
    // ===== FX Commands =====
    async listAvailableFX() {
        return this.sendCommand('list_available_fx');
    }
    async getTrackFX(trackIndex) {
        return this.sendCommand('get_track_fx', { trackIndex });
    }
    async addFXToTrack(trackIndex, fxName) {
        return this.sendCommand('add_fx_to_track', { trackIndex, fxName });
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
    // ===== Audio Analysis =====
    async analyzeMediaItem(trackIndex, itemIndex) {
        return this.sendCommand('analyze_media_item', { trackIndex, itemIndex });
    }
}
//# sourceMappingURL=tcp-client.js.map