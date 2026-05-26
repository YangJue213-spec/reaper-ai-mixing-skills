import { ReaperScriptRunner } from './script-runner.js';
import { FXInfo, FXParam, FXPreset } from '../types/reaper.js';

export class ReaperFXManager {
  private runner: ReaperScriptRunner;

  constructor(runner: ReaperScriptRunner) {
    this.runner = runner;
  }

  /**
   * Get list of available FX on the system
   */
  async getAvailableFX(): Promise<string[]> {
    const script = `
local fxList = {}
local i = 0
while true do
  local retval, fxName = reaper.EnumerateFX(i)
  if not retval then break end
  table.insert(fxList, fxName)
  i = i + 1
end
result = fxList
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to get FX list');
    }
    return result.data as string[];
  }

  /**
   * Add FX to a track
   */
  async addFXToTrack(trackIndex: number, fxName: string): Promise<number> {
    const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

-- Add FX by name
local fxIndex = reaper.TrackFX_AddByName(track, "${fxName}", false, -1)
if fxIndex < 0 then
  error("Failed to add FX: ${fxName}")
end

reaper.TrackFX_SetEnabled(track, fxIndex, true)
result = fxIndex
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to add FX to track');
    }
    return result.data as number;
  }

  /**
   * Add FX to a media item (take FX)
   */
  async addFXToItem(trackIndex: number, itemIndex: number, fxName: string): Promise<number> {
    const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

local item = reaper.GetTrackMediaItem(track, ${itemIndex})
if not item then error("Item not found") end

local take = reaper.GetActiveTake(item)
if not take then error("No active take") end

-- Add take FX
local fxIndex = reaper.TakeFX_AddByName(take, "${fxName}", -1)
if fxIndex < 0 then
  error("Failed to add FX to take: ${fxName}")
end

reaper.TakeFX_SetEnabled(take, fxIndex, true)
result = fxIndex
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to add FX to item');
    }
    return result.data as number;
  }

  /**
   * Remove FX from track
   */
  async removeFXFromTrack(trackIndex: number, fxIndex: number): Promise<void> {
    const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

reaper.TrackFX_Delete(track, ${fxIndex})
result = true
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to remove FX');
    }
  }

  /**
   * Get track FX information
   */
  async getTrackFX(trackIndex: number): Promise<FXInfo[]> {
    const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

local fxList = {}
local fxCount = reaper.TrackFX_GetCount(track)

for i = 0, fxCount - 1 do
  local retval, fxName = reaper.TrackFX_GetFXName(track, i, "")
  local enabled = reaper.TrackFX_GetEnabled(track, i)
  local paramCount = reaper.TrackFX_GetNumParams(track, i)
  
  table.insert(fxList, {
    fxIndex = i,
    name = fxName,
    enabled = enabled,
    paramCount = paramCount
  })
end

result = fxList
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to get track FX');
    }
    return result.data as FXInfo[];
  }

  /**
   * Get FX parameters
   */
  async getFXParams(trackIndex: number, fxIndex: number): Promise<FXParam[]> {
    const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

local params = {}
local paramCount = reaper.TrackFX_GetNumParams(track, ${fxIndex})

for i = 0, paramCount - 1 do
  local retval, paramName = reaper.TrackFX_GetParamName(track, ${fxIndex}, i, "")
  local value, minValue, maxValue = reaper.TrackFX_GetParam(track, ${fxIndex}, i)
  local normalizedValue = reaper.TrackFX_GetParamNormalized(track, ${fxIndex}, i)
  
  table.insert(params, {
    paramIndex = i,
    name = paramName,
    value = value,
    minValue = minValue,
    maxValue = maxValue,
    normalizedValue = normalizedValue
  })
end

result = params
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to get FX params');
    }
    return result.data as FXParam[];
  }

  /**
   * Set FX parameter value
   */
  async setFXParam(trackIndex: number, fxIndex: number, paramIndex: number, value: number): Promise<void> {
    const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

reaper.TrackFX_SetParam(track, ${fxIndex}, ${paramIndex}, ${value})
result = true
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to set FX param');
    }
  }

  /**
   * Set FX parameter by normalized value (0-1)
   */
  async setFXParamNormalized(trackIndex: number, fxIndex: number, paramIndex: number, normalizedValue: number): Promise<void> {
    const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

reaper.TrackFX_SetParamNormalized(track, ${fxIndex}, ${paramIndex}, ${normalizedValue})
result = true
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to set FX param');
    }
  }

  /**
   * Enable/disable FX
   */
  async setFXEnabled(trackIndex: number, fxIndex: number, enabled: boolean): Promise<void> {
    const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

reaper.TrackFX_SetEnabled(track, ${fxIndex}, ${enabled ? 'true' : 'false'})
result = true
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to set FX enabled state');
    }
  }

  /**
   * Get FX presets
   */
  async getFXPresets(trackIndex: number, fxIndex: number): Promise<FXPreset[]> {
    const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

local presets = {}
local presetCount = reaper.TrackFX_GetPresetIndex(track, ${fxIndex})

-- Note: Getting preset names requires cycling through them
-- This is a simplified version
local currentPreset = reaper.TrackFX_GetPreset(track, ${fxIndex}, -1)
result = { currentPreset = currentPreset }
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to get FX presets');
    }
    return result.data as FXPreset[];
  }

  /**
   * Set FX preset
   */
  async setFXPreset(trackIndex: number, fxIndex: number, presetName: string): Promise<void> {
    const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

reaper.TrackFX_SetPreset(track, ${fxIndex}, "${presetName}")
result = true
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to set FX preset');
    }
  }

  /**
   * Open/close FX UI
   */
  async setFXOpen(trackIndex: number, fxIndex: number, open: boolean): Promise<void> {
    const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

reaper.TrackFX_SetOpen(track, ${fxIndex}, ${open ? 'true' : 'false'})
result = true
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to set FX UI state');
    }
  }

  /**
   * Bypass all FX on a track
   */
  async bypassAllFX(trackIndex: number, bypass: boolean): Promise<void> {
    const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

reaper.SetMediaTrackInfo_Value(track, "I_FXEN", ${bypass ? '0' : '1'})
result = true
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to bypass FX');
    }
  }

  /**
   * Copy FX from one track to another
   */
  async copyFX(sourceTrackIndex: number, sourceFxIndex: number, destTrackIndex: number): Promise<number> {
    const script = `
local sourceTrack = reaper.GetTrack(0, ${sourceTrackIndex})
local destTrack = reaper.GetTrack(0, ${destTrackIndex})
if not sourceTrack then error("Source track not found") end
if not destTrack then error("Destination track not found") end

-- Get FX state chunk
local retval, fxState = reaper.TrackFX_GetFXGUID(sourceTrack, ${sourceFxIndex})
-- Copy FX
local newFxIndex = reaper.TrackFX_CopyToTrack(sourceTrack, ${sourceFxIndex}, destTrack, reaper.TrackFX_GetCount(destTrack), true)

result = newFxIndex
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to copy FX');
    }
    return result.data as number;
  }
}