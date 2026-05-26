import { ReaperScriptRunner } from './script-runner.js';
import { AudioAnalysisResult, ProjectInfo, MediaItemInfo } from '../types/reaper.js';

export class ReaperAudioAnalyzer {
  private runner: ReaperScriptRunner;

  constructor(runner: ReaperScriptRunner) {
    this.runner = runner;
  }

  /**
   * Analyze a media item's audio properties
   */
  async analyzeMediaItem(trackIndex: number, itemIndex: number): Promise<AudioAnalysisResult> {
    const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

local item = reaper.GetTrackMediaItem(track, ${itemIndex})
if not item then error("Item not found") end

local take = reaper.GetActiveTake(item)
if not take then error("No active take") end

local source = reaper.GetMediaItemTake_Source(take)
local accessor = reaper.CreateTakeAudioAccessor(take)

-- Get basic info
local itemLength = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
local sourceLength = reaper.GetMediaSourceLength(source)
local numChannels = reaper.GetMediaSourceNumChannels(source)
local sampleRate = reaper.GetMediaSourceSampleRate(source)

-- Analyze audio levels
local bufferSize = 4096
local buffer = reaper.new_array(bufferSize * numChannels)
local totalSamples = math.floor(itemLength * sampleRate)
local position = 0

local peakLevel = 0
local sumSquares = 0
local sampleCount = 0

while position < totalSamples do
  local samplesToRead = math.min(bufferSize, totalSamples - position)
  local samplesRead = reaper.GetAudioAccessorSamples(
    accessor, sampleRate, numChannels, 
    position / sampleRate, samplesToRead, buffer
  )
  
  if samplesRead <= 0 then break end
  
  for i = 0, samplesRead * numChannels - 1 do
    local sample = buffer[i]
    local absSample = math.abs(sample)
    if absSample > peakLevel then
      peakLevel = absSample
    end
    sumSquares = sumSquares + sample * sample
    sampleCount = sampleCount + 1
  end
  
  position = position + samplesToRead
end

reaper.DestroyAudioAccessor(accessor)

local rmsLevel = 0
if sampleCount > 0 then
  rmsLevel = math.sqrt(sumSquares / sampleCount)
end

-- Calculate LUFS (simplified, using RMS as approximation)
local lufs = 20 * math.log10(rmsLevel) + 14 -- Rough approximation

result = {
  itemLength = itemLength,
  sampleRate = sampleRate,
  numChannels = numChannels,
  peakLevel = peakLevel,
  rmsLevel = rmsLevel,
  lufs = lufs
}
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to analyze media item');
    }
    return result.data as AudioAnalysisResult;
  }

  /**
   * Get project information
   */
  async getProjectInfo(): Promise<ProjectInfo> {
    const script = `
local proj = 0 -- current project

-- Get project settings
local sampleRate = reaper.SNM_GetIntConfigVar("projsrate", 44100)
local tempo = reaper.Master_GetTempo()
local num, den = reaper.GetProjectTimeSignature2(proj)

-- Count tracks and items
local trackCount = reaper.CountTracks(proj)
local itemCount = 0
for i = 0, trackCount - 1 do
  local track = reaper.GetTrack(proj, i)
  itemCount = itemCount + reaper.CountTrackMediaItems(track)
end

-- Get project length
local projectLength = reaper.GetProjectLength(proj)

result = {
  sampleRate = sampleRate,
  tempo = tempo,
  timeSignatureNum = num,
  timeSignatureDen = den,
  trackCount = trackCount,
  itemCount = itemCount,
  projectLength = projectLength
}
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to get project info');
    }
    return result.data as ProjectInfo;
  }

  /**
   * Analyze selected items
   */
  async analyzeSelectedItems(): Promise<AudioAnalysisResult[]> {
    const script = `
local results = {}
local itemCount = reaper.CountSelectedMediaItems(0)

for i = 0, itemCount - 1 do
  local item = reaper.GetSelectedMediaItem(0, i)
  local track = reaper.GetMediaItemTrack(item)
  local trackIdx = reaper.CSurf_TrackToID(track, false) - 1
  local itemIdx = reaper.GetMediaItemInfo_Value(item, "IP_ITEMNUMBER")
  
  -- Basic analysis for each item
  local take = reaper.GetActiveTake(item)
  if take then
    local source = reaper.GetMediaItemTake_Source(take)
    local accessor = reaper.CreateTakeAudioAccessor(take)
    
    local itemLength = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
    local numChannels = reaper.GetMediaSourceNumChannels(source)
    local sampleRate = reaper.GetMediaSourceSampleRate(source)
    
    -- Quick peak analysis
    local peakLevel = reaper.NF_GetMediaItemMaxPeak(item)
    
    table.insert(results, {
      trackIndex = trackIdx,
      itemIndex = itemIdx,
      itemLength = itemLength,
      sampleRate = sampleRate,
      numChannels = numChannels,
      peakLevel = peakLevel
    })
    
    reaper.DestroyAudioAccessor(accessor)
  end
end

result = results
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to analyze selected items');
    }
    return result.data as AudioAnalysisResult[];
  }

  /**
   * Get media item information
   */
  async getMediaItemInfo(trackIndex: number, itemIndex: number): Promise<MediaItemInfo> {
    const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

local item = reaper.GetTrackMediaItem(track, ${itemIndex})
if not item then error("Item not found") end

local position = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
local length = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
local fadeIn = reaper.GetMediaItemInfo_Value(item, "D_FADEINLEN")
local fadeOut = reaper.GetMediaItemInfo_Value(item, "D_FADEOUTLEN")
local volume = reaper.GetMediaItemInfo_Value(item, "D_VOL")

local take = reaper.GetActiveTake(item)
local sourceFile = nil
if take then
  local source = reaper.GetMediaItemTake_Source(take)
  sourceFile = reaper.GetMediaSourceFileName(source)
end

result = {
  itemIndex = ${itemIndex},
  trackNumber = ${trackIndex} + 1,
  position = position,
  length = length,
  fadeIn = fadeIn,
  fadeOut = fadeOut,
  volume = volume,
  sourceFile = sourceFile
}
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to get media item info');
    }
    return result.data as MediaItemInfo;
  }

  /**
   * Get peak level of specific item (fast method)
   */
  async getItemPeak(trackIndex: number, itemIndex: number): Promise<number> {
    const script = `
local track = reaper.GetTrack(0, ${trackIndex})
local item = reaper.GetTrackMediaItem(track, ${itemIndex})
result = reaper.NF_GetMediaItemMaxPeak(item)
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to get item peak');
    }
    return result.data as number;
  }

  /**
   * Analyze frequency content (using REAPER's spectral analysis)
   */
  async analyzeSpectrum(trackIndex: number, itemIndex: number): Promise<any> {
    const script = `
-- This uses REAPER's built-in spectral analysis
local track = reaper.GetTrack(0, ${trackIndex})
local item = reaper.GetTrackMediaItem(track, ${itemIndex})

-- Get spectral data using SWS extension if available
local spectralData = {}
local success = false

-- Try to get spectral info through take
local take = reaper.GetActiveTake(item)
if take then
  -- Note: Full spectral analysis requires SWS or custom FFT
  -- This is a simplified version
  local peak = reaper.NF_GetMediaItemMaxPeak(item)
  local rms = reaper.NF_GetMediaItemAverageRMS(item)
  
  spectralData = {
    peak = peak,
    rms = rms,
    note = "Full spectrum analysis requires SWS extension"
  }
  success = true
end

result = spectralData
`;

    const result = await this.runner.executeLuaScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to analyze spectrum');
    }
    return result.data;
  }
}