export class ReaperTrackController {
    runner;
    constructor(runner) {
        this.runner = runner;
    }
    /**
     * Get track information
     */
    async getTrackInfo(trackIndex) {
        const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

local _, name = reaper.GetTrackName(track)
local volume = reaper.GetMediaTrackInfo_Value(track, "D_VOL")
local pan = reaper.GetMediaTrackInfo_Value(track, "D_PAN")
local mute = reaper.GetMediaTrackInfo_Value(track, "B_MUTE") == 1
local solo = reaper.GetMediaTrackInfo_Value(track, "I_SOLO") > 0
local fxCount = reaper.TrackFX_GetCount(track)
local itemCount = reaper.CountTrackMediaItems(track)

-- Convert volume to dB for display
local volumeDb = 20 * math.log(volume, 10)

result = {
  trackNumber = ${trackIndex} + 1,
  name = name,
  volume = volumeDb,
  pan = pan,
  mute = mute,
  solo = solo,
  fxCount = fxCount,
  itemCount = itemCount
}
`;
        const result = await this.runner.executeLuaScript(script);
        if (!result.success) {
            throw new Error(result.error || 'Failed to get track info');
        }
        return result.data;
    }
    /**
     * Set track volume in dB
     */
    async setTrackVolume(trackIndex, volumeDb) {
        const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

-- Convert dB to linear
local volume = 10 ^ (${volumeDb} / 20)
reaper.SetMediaTrackInfo_Value(track, "D_VOL", volume)
result = true
`;
        const result = await this.runner.executeLuaScript(script);
        if (!result.success) {
            throw new Error(result.error || 'Failed to set track volume');
        }
    }
    /**
     * Set track pan (-1 to 1)
     */
    async setTrackPan(trackIndex, pan) {
        const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

reaper.SetMediaTrackInfo_Value(track, "D_PAN", ${pan})
result = true
`;
        const result = await this.runner.executeLuaScript(script);
        if (!result.success) {
            throw new Error(result.error || 'Failed to set track pan');
        }
    }
    /**
     * Set track mute
     */
    async setTrackMute(trackIndex, mute) {
        const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

reaper.SetMediaTrackInfo_Value(track, "B_MUTE", ${mute ? '1' : '0'})
result = true
`;
        const result = await this.runner.executeLuaScript(script);
        if (!result.success) {
            throw new Error(result.error || 'Failed to set track mute');
        }
    }
    /**
     * Set track solo
     */
    async setTrackSolo(trackIndex, solo) {
        const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

reaper.SetMediaTrackInfo_Value(track, "I_SOLO", ${solo ? '1' : '0'})
result = true
`;
        const result = await this.runner.executeLuaScript(script);
        if (!result.success) {
            throw new Error(result.error || 'Failed to set track solo');
        }
    }
    /**
     * Set track name
     */
    async setTrackName(trackIndex, name) {
        const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

reaper.GetSetMediaTrackInfo_String(track, "P_NAME", "${name}", true)
result = true
`;
        const result = await this.runner.executeLuaScript(script);
        if (!result.success) {
            throw new Error(result.error || 'Failed to set track name');
        }
    }
    /**
     * Get all tracks info
     */
    async getAllTracks() {
        const script = `
local tracks = {}
local trackCount = reaper.CountTracks(0)

for i = 0, trackCount - 1 do
  local track = reaper.GetTrack(0, i)
  local _, name = reaper.GetTrackName(track)
  local volume = reaper.GetMediaTrackInfo_Value(track, "D_VOL")
  local pan = reaper.GetMediaTrackInfo_Value(track, "D_PAN")
  local mute = reaper.GetMediaTrackInfo_Value(track, "B_MUTE") == 1
  local solo = reaper.GetMediaTrackInfo_Value(track, "I_SOLO") > 0
  local fxCount = reaper.TrackFX_GetCount(track)
  local itemCount = reaper.CountTrackMediaItems(track)
  
  table.insert(tracks, {
    trackNumber = i + 1,
    name = name,
    volume = 20 * math.log(volume, 10),
    pan = pan,
    mute = mute,
    solo = solo,
    fxCount = fxCount,
    itemCount = itemCount
  })
end

result = tracks
`;
        const result = await this.runner.executeLuaScript(script);
        if (!result.success) {
            throw new Error(result.error || 'Failed to get all tracks');
        }
        return result.data;
    }
    /**
     * Set track color
     */
    async setTrackColor(trackIndex, color) {
        const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

reaper.SetMediaTrackInfo_Value(track, "I_CUSTOMCOLOR", ${color})
result = true
`;
        const result = await this.runner.executeLuaScript(script);
        if (!result.success) {
            throw new Error(result.error || 'Failed to set track color');
        }
    }
    /**
     * Set track height
     */
    async setTrackHeight(trackIndex, height) {
        const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

reaper.SetMediaTrackInfo_Value(track, "I_TCPH", ${height})
result = true
`;
        const result = await this.runner.executeLuaScript(script);
        if (!result.success) {
            throw new Error(result.error || 'Failed to set track height');
        }
    }
    /**
     * Insert new track
     */
    async insertTrack(index) {
        const script = `
reaper.InsertTrackAtIndex(${index}, true)
result = ${index}
`;
        const result = await this.runner.executeLuaScript(script);
        if (!result.success) {
            throw new Error(result.error || 'Failed to insert track');
        }
        return result.data;
    }
    /**
     * Delete track
     */
    async deleteTrack(trackIndex) {
        const script = `
local track = reaper.GetTrack(0, ${trackIndex})
if not track then error("Track not found") end

reaper.DeleteTrack(track)
result = true
`;
        const result = await this.runner.executeLuaScript(script);
        if (!result.success) {
            throw new Error(result.error || 'Failed to delete track');
        }
    }
}
//# sourceMappingURL=track-controller.js.map