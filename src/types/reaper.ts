// REAPER MCP Server Type Definitions

export interface ReaperConfig {
  reaperPath?: string;
  pythonPath?: string;
  scriptTimeout?: number;
  host?: string;
  port?: number;
}

export interface AudioAnalysisResult {
  itemLength: number;
  sampleRate: number;
  numChannels: number;
  peakLevel: number;
  rmsLevel: number;
  lufs?: number;
}

export interface ProjectInfo {
  sampleRate: number;
  tempo: number;
  timeSignatureNum: number;
  timeSignatureDen: number;
  trackCount: number;
  itemCount: number;
  projectLength: number;
}

export interface TrackInfo {
  trackNumber: number;
  name: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  fxCount: number;
  itemCount: number;
  trackChannels?: number;
  isMono?: boolean;
}

export interface FXInfo {
  fxIndex: number;
  name: string;
  enabled: boolean;
  paramCount: number;
}

export interface FXParam {
  paramIndex: number;
  name: string;
  value: number;
  minValue: number;
  maxValue: number;
  normalizedValue: number;
}

export interface FXPreset {
  name: string;
  index: number;
}

export interface MediaItemInfo {
  itemIndex: number;
  trackNumber: number;
  position: number;
  length: number;
  fadeIn: number;
  fadeOut: number;
  volume: number;
  sourceFile?: string;
}

export interface RenderSettings {
  outputPath: string;
  sampleRate?: number;
  bitDepth?: number;
  channels?: number;
  format?: 'WAV' | 'AIFF' | 'FLAC' | 'MP3';
  quality?: number;
}

export interface ReaperScriptResult {
  success: boolean;
  data?: any;
  error?: string;
}