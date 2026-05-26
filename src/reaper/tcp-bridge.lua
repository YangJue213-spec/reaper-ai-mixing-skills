-- REAPER MCP TCP Bridge
-- Run this script in REAPER: Actions > New Action > Load ReaScript
-- This creates a TCP server that accepts JSON commands

local socket = require("socket")

-- Configuration
local HOST = "127.0.0.1"
local PORT = 12345
local server = nil
local client = nil
local running = true

-- JSON encoder/decoder (REAPER has dkjson built-in)
local json = require("dkjson")

-- Command handlers
local handlers = {}

function handlers.get_project_info()
    local proj = 0
    local sample_rate = reaper.SNM_GetIntConfigVar("projsrate", 44100)
    local tempo = reaper.Master_GetTempo()
    local num, den = reaper.GetProjectTimeSignature2(proj)
    local track_count = reaper.CountTracks(proj)
    local item_count = 0
    
    for i = 0, track_count - 1 do
        local track = reaper.GetTrack(proj, i)
        item_count = item_count + reaper.CountTrackMediaItems(track)
    end
    
    return {
        success = true,
        data = {
            sampleRate = sample_rate,
            tempo = tempo,
            timeSignatureNum = num,
            timeSignatureDen = den,
            trackCount = track_count,
            itemCount = item_count,
            projectLength = reaper.GetProjectLength(proj)
        }
    }
end

function handlers.get_track_info(params)
    local track_index = params.trackIndex or 0
    local track = reaper.GetTrack(0, track_index)
    
    if not track then
        return { success = false, error = "Track not found" }
    end
    
    local _, name = reaper.GetTrackName(track)
    local volume = reaper.GetMediaTrackInfo_Value(track, "D_VOL")
    local pan = reaper.GetMediaTrackInfo_Value(track, "D_PAN")
    local mute = reaper.GetMediaTrackInfo_Value(track, "B_MUTE") == 1
    local solo = reaper.GetMediaTrackInfo_Value(track, "I_SOLO") > 0
    local fx_count = reaper.TrackFX_GetCount(track)
    local item_count = reaper.CountTrackMediaItems(track)
    
    return {
        success = true,
        data = {
            trackNumber = track_index + 1,
            name = name,
            volumeDb = 20 * math.log(volume, 10),
            pan = pan,
            mute = mute,
            solo = solo,
            fxCount = fx_count,
            itemCount = item_count
        }
    }
end

function handlers.set_track_volume(params)
    local track_index = params.trackIndex or 0
    local volume_db = params.volumeDb or 0
    
    local track = reaper.GetTrack(0, track_index)
    if not track then
        return { success = false, error = "Track not found" }
    end
    
    local volume = 10 ^ (volume_db / 20)
    reaper.SetMediaTrackInfo_Value(track, "D_VOL", volume)
    
    return { success = true, data = { volumeDb = volume_db } }
end

function handlers.set_track_pan(params)
    local track_index = params.trackIndex or 0
    local pan = params.pan or 0
    
    local track = reaper.GetTrack(0, track_index)
    if not track then
        return { success = false, error = "Track not found" }
    end
    
    reaper.SetMediaTrackInfo_Value(track, "D_PAN", pan)
    return { success = true }
end

function handlers.list_available_fx()
    local fx_list = {}
    local i = 0
    
    while true do
        local retval, fx_name = reaper.EnumerateFX(i)
        if not retval then break end
        table.insert(fx_list, fx_name)
        i = i + 1
    end
    
    return { success = true, data = fx_list }
end

function handlers.get_track_fx(params)
    local track_index = params.trackIndex or 0
    local track = reaper.GetTrack(0, track_index)
    
    if not track then
        return { success = false, error = "Track not found" }
    end
    
    local fx_list = {}
    local fx_count = reaper.TrackFX_GetCount(track)
    
    for i = 0, fx_count - 1 do
        local retval, fx_name = reaper.TrackFX_GetFXName(track, i, "")
        local enabled = reaper.TrackFX_GetEnabled(track, i)
        local param_count = reaper.TrackFX_GetNumParams(track, i)
        
        table.insert(fx_list, {
            fxIndex = i,
            name = fx_name,
            enabled = enabled,
            paramCount = param_count
        })
    end
    
    return { success = true, data = fx_list }
end

function handlers.add_fx_to_track(params)
    local track_index = params.trackIndex or 0
    local fx_name = params.fxName
    
    if not fx_name then
        return { success = false, error = "fxName required" }
    end
    
    local track = reaper.GetTrack(0, track_index)
    if not track then
        return { success = false, error = "Track not found" }
    end
    
    local fx_index = reaper.TrackFX_AddByName(track, fx_name, false, -1)
    if fx_index < 0 then
        return { success = false, error = "Failed to add FX: " .. fx_name }
    end
    
    reaper.TrackFX_SetEnabled(track, fx_index, true)
    return { success = true, data = { fxIndex = fx_index } }
end

function handlers.remove_fx_from_track(params)
    local track_index = params.trackIndex or 0
    local fx_index = params.fxIndex or 0
    
    local track = reaper.GetTrack(0, track_index)
    if not track then
        return { success = false, error = "Track not found" }
    end
    
    reaper.TrackFX_Delete(track, fx_index)
    return { success = true }
end

function handlers.get_fx_params(params)
    local track_index = params.trackIndex or 0
    local fx_index = params.fxIndex or 0
    
    local track = reaper.GetTrack(0, track_index)
    if not track then
        return { success = false, error = "Track not found" }
    end
    
    local params_list = {}
    local param_count = reaper.TrackFX_GetNumParams(track, fx_index)
    
    for i = 0, param_count - 1 do
        local retval, param_name = reaper.TrackFX_GetParamName(track, fx_index, i, "")
        local value, min_val, max_val = reaper.TrackFX_GetParam(track, fx_index, i)
        local normalized = reaper.TrackFX_GetParamNormalized(track, fx_index, i)
        
        table.insert(params_list, {
            paramIndex = i,
            name = param_name,
            value = value,
            minValue = min_val,
            maxValue = max_val,
            normalizedValue = normalized
        })
    end
    
    return { success = true, data = params_list }
end

function handlers.set_fx_param(params)
    local track_index = params.trackIndex or 0
    local fx_index = params.fxIndex or 0
    local param_index = params.paramIndex or 0
    local value = params.value
    
    if value == nil then
        return { success = false, error = "value required" }
    end
    
    local track = reaper.GetTrack(0, track_index)
    if not track then
        return { success = false, error = "Track not found" }
    end
    
    reaper.TrackFX_SetParam(track, fx_index, param_index, value)
    return { success = true }
end

function handlers.set_fx_param_normalized(params)
    local track_index = params.trackIndex or 0
    local fx_index = params.fxIndex or 0
    local param_index = params.paramIndex or 0
    local normalized_value = params.normalizedValue
    
    if normalized_value == nil then
        return { success = false, error = "normalizedValue required" }
    end
    
    local track = reaper.GetTrack(0, track_index)
    if not track then
        return { success = false, error = "Track not found" }
    end
    
    reaper.TrackFX_SetParamNormalized(track, fx_index, param_index, normalized_value)
    return { success = true }
end

function handlers.set_fx_enabled(params)
    local track_index = params.trackIndex or 0
    local fx_index = params.fxIndex or 0
    local enabled = params.enabled
    
    if enabled == nil then
        return { success = false, error = "enabled required" }
    end
    
    local track = reaper.GetTrack(0, track_index)
    if not track then
        return { success = false, error = "Track not found" }
    end
    
    reaper.TrackFX_SetEnabled(track, fx_index, enabled)
    return { success = true }
end

function handlers.analyze_media_item(params)
    local track_index = params.trackIndex or 0
    local item_index = params.itemIndex or 0
    
    local track = reaper.GetTrack(0, track_index)
    if not track then
        return { success = false, error = "Track not found" }
    end
    
    local item = reaper.GetTrackMediaItem(track, item_index)
    if not item then
        return { success = false, error = "Item not found" }
    end
    
    local take = reaper.GetActiveTake(item)
    if not take then
        return { success = false, error = "No active take" }
    end
    
    local source = reaper.GetMediaItemTake_Source(take)
    local item_length = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
    local num_channels = reaper.GetMediaSourceNumChannels(source)
    local sample_rate = reaper.GetMediaSourceSampleRate(source)
    
    -- Get peak using SWS extension if available
    local peak_level = 0
    if reaper.NF_GetMediaItemMaxPeak then
        peak_level = reaper.NF_GetMediaItemMaxPeak(item)
    end
    
    return {
        success = true,
        data = {
            itemLength = item_length,
            sampleRate = sample_rate,
            numChannels = num_channels,
            peakLevel = peak_level
        }
    }
end

-- Main server loop
function main()
    server = socket.bind(HOST, PORT)
    if not server then
        reaper.ShowConsoleMsg("REAPER MCP: Failed to start server on " .. HOST .. ":" .. PORT .. "\n")
        return
    end
    
    server:settimeout(0) -- Non-blocking
    reaper.ShowConsoleMsg("REAPER MCP: Server started on " .. HOST .. ":" .. PORT .. "\n")
    
    -- Register timer to handle connections
    local function timer_callback()
        if not running then return end
        
        -- Accept new connections
        local new_client = server:accept()
        if new_client then
            new_client:settimeout(0)
            client = new_client
            reaper.ShowConsoleMsg("REAPER MCP: Client connected\n")
        end
        
        -- Handle client communication
        if client then
            local line, err = client:receive("*l")
            if line then
                -- Parse JSON command
                local command = json.decode(line)
                if command and command.action then
                    local handler = handlers[command.action]
                    if handler then
                        local response = handler(command.params or {})
                        local response_json = json.encode(response)
                        client:send(response_json .. "\n")
                    else
                        local error_response = json.encode({
                            success = false,
                            error = "Unknown action: " .. command.action
                        })
                        client:send(error_response .. "\n")
                    end
                end
            elseif err == "closed" then
                reaper.ShowConsoleMsg("REAPER MCP: Client disconnected\n")
                client:close()
                client = nil
            end
        end
        
        -- Continue timer
        reaper.defer(timer_callback)
    end
    
    -- Start timer
    reaper.defer(timer_callback)
end

-- Run main
main()