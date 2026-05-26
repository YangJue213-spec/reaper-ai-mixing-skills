import { createConnection, Socket } from 'net';
import { ReaperConfig, AudioAnalysisResult, ProjectInfo, TrackInfo, FXInfo, FXParam } from '../types/reaper.js';

export class ReaperTCPClient {
  private config: ReaperConfig;
  private socket: Socket | null = null;
  private messageQueue: Array<{
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];

  constructor(config: ReaperConfig = {}) {
    this.config = {
      host: config.host || '127.0.0.1',
      port: config.port || 12345,
      scriptTimeout: config.scriptTimeout || 5000,
    };
  }

  /**
   * Connect to REAPER TCP server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = createConnection({
        host: this.config.host!,
        port: this.config.port!,
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
  disconnect(): void {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }

  /**
   * Send command and wait for response
   */
  private async sendCommand(action: string, params: any = {}): Promise<any> {
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
      this.socket!.write(command + '\n');
    });
  }

  /**
   * Handle incoming response
   */
  private handleResponse(data: string): void {
    const lines = data.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const response = JSON.parse(line);
        const pending = this.messageQueue.shift();
        
        if (pending) {
          clearTimeout(pending.timeout);
          
          if (response.success) {
            pending.resolve(response.data);
          } else {
            pending.reject(new Error(response.error || 'Unknown error'));
          }
        }
      } catch (error) {
        // Ignore parse errors
      }
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket !== null && this.socket.writable;
  }

  // ===== Project Commands =====

  async getProjectInfo(): Promise<ProjectInfo> {
    return this.sendCommand('get_project_info');
  }

  // ===== Track Commands =====

  async getTrackInfo(trackIndex: number): Promise<TrackInfo> {
    return this.sendCommand('get_track_info', { trackIndex });
  }

  async setTrackVolume(trackIndex: number, volumeDb: number): Promise<void> {
    await this.sendCommand('set_track_volume', { trackIndex, volumeDb });
  }

  async setTrackPan(trackIndex: number, pan: number): Promise<void> {
    await this.sendCommand('set_track_pan', { trackIndex, pan });
  }

  // ===== FX Commands =====

  async listAvailableFX(): Promise<string[]> {
    return this.sendCommand('list_available_fx');
  }

  async getTrackFX(trackIndex: number): Promise<FXInfo[]> {
    return this.sendCommand('get_track_fx', { trackIndex });
  }

  async addFXToTrack(trackIndex: number, fxName: string): Promise<{ fxIndex: number }> {
    return this.sendCommand('add_fx_to_track', { trackIndex, fxName });
  }

  async removeFXFromTrack(trackIndex: number, fxIndex: number): Promise<void> {
    await this.sendCommand('remove_fx_from_track', { trackIndex, fxIndex });
  }

  async getFXParams(trackIndex: number, fxIndex: number): Promise<FXParam[]> {
    return this.sendCommand('get_fx_params', { trackIndex, fxIndex });
  }

  async setFXParam(trackIndex: number, fxIndex: number, paramIndex: number, value: number): Promise<void> {
    await this.sendCommand('set_fx_param', { trackIndex, fxIndex, paramIndex, value });
  }

  async setFXParamNormalized(trackIndex: number, fxIndex: number, paramIndex: number, normalizedValue: number): Promise<void> {
    await this.sendCommand('set_fx_param_normalized', { trackIndex, fxIndex, paramIndex, normalizedValue });
  }

  async setFXEnabled(trackIndex: number, fxIndex: number, enabled: boolean): Promise<void> {
    await this.sendCommand('set_fx_enabled', { trackIndex, fxIndex, enabled });
  }

  // ===== Audio Analysis =====

  async analyzeMediaItem(trackIndex: number, itemIndex: number): Promise<AudioAnalysisResult> {
    return this.sendCommand('analyze_media_item', { trackIndex, itemIndex });
  }
}