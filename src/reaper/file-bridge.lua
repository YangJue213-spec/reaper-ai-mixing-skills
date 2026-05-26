-- REAPER MCP File-based IPC Bridge - Complete Version
-- Supports all MCP tools with robust JSON parsing

-- Configuration
local IPC_DIR = "/tmp/reaper-mcp"
local COMMAND_FILE = IPC_DIR .. "/command.json"
local RESPONSE_FILE = IPC_DIR .. "/response.json"

-- Ensure IPC directory exists
local function ensure_dir()
    os.execute('mkdir -p "' .. IPC_DIR .. '"')
end

-- ===== JSON Encoder =====
local function to_json(obj)
    local t = type(obj)
    if t == "nil" then return "null"
    elseif t == "boolean" then return obj and "true" or "false"
    elseif t == "number" then return tostring(obj)
    elseif t == "string" then
        return '"' .. obj:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', '\\n'):gsub('\r', '\\r'):gsub('\t', '\\t') .. '"'
    elseif t == "table" then
        local parts = {}
        -- Check if it's an array
        local is_array = true
        local max_index = 0
        for k, v in pairs(obj) do
            if type(k) ~= "number" or k < 1 or math.floor(k) ~= k then
                is_array = false
                break
            end
            max_index = math.max(max_index, k)
        end
        -- Empty table or array with gaps is treated as object
        if max_index ~= #obj then is_array = false end
        
        if is_array and #obj > 0 then
            for _, v in ipairs(obj) do
                table.insert(parts, to_json(v))
            end
            return "[" .. table.concat(parts, ",") .. "]"
        else
            for k, v in pairs(obj) do
                table.insert(parts, to_json(tostring(k)) .. ":" .. to_json(v))
            end
            return "{" .. table.concat(parts, ",") .. "}"
        end
    else return "null" end
end

-- ===== JSON Parser (Robust version with array support) =====
local function parse_json(str)
    if not str or str == "" then return nil end
    
    local pos = 1
    local len = #str
    
    local function skip_whitespace()
        while pos <= len and str:sub(pos, pos):match("%s") do
            pos = pos + 1
        end
    end
    
    local function parse_value()
        skip_whitespace()
        if pos > len then return nil end
        
        local char = str:sub(pos, pos)
        
        -- Parse string
        if char == '"' then
            pos = pos + 1
            local result = ""
            while pos <= len do
                local c = str:sub(pos, pos)
                if c == '"' then
                    pos = pos + 1
                    return result
                elseif c == '\\' then
                    pos = pos + 1
                    if pos > len then break end
                    local esc = str:sub(pos, pos)
                    if esc == 'n' then result = result .. '\n'
                    elseif esc == 'r' then result = result .. '\r'
                    elseif esc == 't' then result = result .. '\t'
                    elseif esc == 'b' then result = result .. '\b'
                    elseif esc == 'f' then result = result .. '\f'
                    else result = result .. esc end
                    pos = pos + 1
                else
                    result = result .. c
                    pos = pos + 1
                end
            end
            return result
        
        -- Parse number
        elseif char:match("[%-%d]") then
            local start = pos
            if char == '-' then pos = pos + 1 end
            while pos <= len and str:sub(pos, pos):match("%d") do pos = pos + 1 end
            if pos <= len and str:sub(pos, pos) == '.' then
                pos = pos + 1
                while pos <= len and str:sub(pos, pos):match("%d") do pos = pos + 1 end
            end
            return tonumber(str:sub(start, pos - 1))
        
        -- Parse object
        elseif char == '{' then
            pos = pos + 1
            local obj = {}
            skip_whitespace()
            if str:sub(pos, pos) == '}' then
                pos = pos + 1
                return obj
            end
            while true do
                skip_whitespace()
                local key = parse_value()
                skip_whitespace()
                if str:sub(pos, pos) ~= ':' then break end
                pos = pos + 1
                local val = parse_value()
                obj[key] = val
                skip_whitespace()
                local next_char = str:sub(pos, pos)
                pos = pos + 1
                if next_char == '}' then
                    return obj
                elseif next_char ~= ',' then
                    break
                end
            end
            return obj
        
        -- Parse array
        elseif char == '[' then
            pos = pos + 1
            local arr = {}
            skip_whitespace()
            if str:sub(pos, pos) == ']' then
                pos = pos + 1
                return arr
            end
            while true do
                local val = parse_value()
                table.insert(arr, val)
                skip_whitespace()
                local next_char = str:sub(pos, pos)
                pos = pos + 1
                if next_char == ']' then
                    return arr
                elseif next_char ~= ',' then
                    break
                end
            end
            return arr
        
        -- Parse boolean/null
        elseif str:sub(pos, pos + 3) == "true" then
            pos = pos + 4
            return true
        elseif str:sub(pos, pos + 4) == "false" then
            pos = pos + 5
            return false
        elseif str:sub(pos, pos + 3) == "null" then
            pos = pos + 4
            return nil
        end
        
        return nil
    end
    
    local result = parse_value()
    if type(result) == "table" then
        return result
    end
    return nil
end

-- ===== File Operations =====
local function file_exists(path)
    local f = io.open(path, "r")
    if f then f:close() return true end
    return false
end

local function read_file(path)
    local f = io.open(path, "r")
    if not f then return nil end
    local content = f:read("*all")
    f:close()
    return content
end

local function write_file(path, content)
    local f = io.open(path, "w")
    if not f then return false end
    f:write(content)
    f:close()
    return true
end

-- ===== Command Handlers =====
local handlers = {}

function handlers.get_project_info()
    local proj = 0
    return {
        success = true,
        data = {
            sampleRate = reaper.SNM_GetIntConfigVar("projsrate", 44100),
            tempo = reaper.Master_GetTempo(),
            timeSignatureNum = 4,
            timeSignatureDen = 4,
            trackCount = reaper.CountTracks(proj),
            itemCount = 1,
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
    local volume_db = 20 * math.log(volume, 10)
    local pan = reaper.GetMediaTrackInfo_Value(track, "D_PAN")
    local mute = reaper.GetMediaTrackInfo_Value(track, "B_MUTE") == 1
    local solo = reaper.GetMediaTrackInfo_Value(track, "I_SOLO") > 0
    
    -- Get track channel count
    local track_channels = reaper.GetMediaTrackInfo_Value(track, "I_NCHAN")
    local is_mono = (track_channels == 1)
    
    return {
        success = true,
        data = {
            trackNumber = track_index + 1,
            name = name,
            volumeDb = volume_db,
            pan = pan,
            mute = mute,
            solo = solo,
            fxCount = reaper.TrackFX_GetCount(track),
            itemCount = reaper.CountTrackMediaItems(track),
            trackChannels = track_channels,
            isMono = is_mono
        }
    }
end

function handlers.create_track(params)
    local track_index = reaper.GetNumTracks()
    reaper.InsertTrackAtIndex(track_index, true)
    local track = reaper.GetTrack(0, track_index)
    if params.trackName and track then
        reaper.GetSetMediaTrackInfo_String(track, "P_NAME", params.trackName, true)
    end
    reaper.TrackList_AdjustWindows(false)
    reaper.UpdateArrange()
    return {
        success = true,
        data = {
            trackIndex = track_index,
            trackNumber = track_index + 1,
            name = params.trackName or ""
        }
    }
end

function handlers.set_track_volume(params)
    local track = reaper.GetTrack(0, params.trackIndex or 0)
    if not track then return { success = false, error = "Track not found" } end
    local volume = 10 ^ ((params.volumeDb or 0) / 20)
    reaper.SetMediaTrackInfo_Value(track, "D_VOL", volume)
    return { success = true }
end

function handlers.set_track_pan(params)
    local track = reaper.GetTrack(0, params.trackIndex or 0)
    if not track then return { success = false, error = "Track not found" } end
    reaper.SetMediaTrackInfo_Value(track, "D_PAN", math.max(-1, math.min(1, params.pan or 0)))
    return { success = true }
end

-- ===== NEW: Delete Track Handler =====
function handlers.delete_track(params)
    local track = reaper.GetTrack(0, params.trackIndex or 0)
    if not track then 
        return { success = false, error = "Track not found" }
    end
    
    reaper.DeleteTrack(track)
    reaper.TrackList_AdjustWindows(false)
    reaper.UpdateArrange()
    
    return { success = true, data = { deletedTrackIndex = params.trackIndex } }
end

-- ===== NEW: Set Track Name Handler =====
function handlers.set_track_name(params)
    local track = reaper.GetTrack(0, params.trackIndex or 0)
    if not track then 
        return { success = false, error = "Track not found" }
    end
    
    local track_name = params.trackName or ""
    reaper.GetSetMediaTrackInfo_String(track, "P_NAME", track_name, true)
    reaper.TrackList_AdjustWindows(false)
    reaper.UpdateArrange()
    
    return { 
        success = true, 
        data = { 
            trackIndex = params.trackIndex,
            name = track_name
        } 
    }
end

-- ===== NEW: Track Send/Output Handlers =====
function handlers.set_track_send(params)
    local source_track = reaper.GetTrack(0, params.sourceTrackIndex or 0)
    local dest_track = reaper.GetTrack(0, params.destTrackIndex or 0)
    if not source_track then return { success = false, error = "Source track not found" } end
    if not dest_track then return { success = false, error = "Destination track not found" } end
    
    local send_idx = reaper.CreateTrackSend(source_track, dest_track)
    if send_idx < 0 then
        return { success = false, error = "Failed to create send" }
    end
    
    local volume = 10 ^ ((params.volumeDb or 0) / 20)
    reaper.SetTrackSendInfo_Value(source_track, 0, send_idx, "D_VOL", volume)
    
    return { success = true, data = { sendIndex = send_idx } }
end

function handlers.set_track_output(params)
    local source_track = reaper.GetTrack(0, params.sourceTrackIndex or 0)
    if not source_track then return { success = false, error = "Source track not found" } end
    
    local dest_track = nil
    if params.destTrackIndex >= 0 then
        dest_track = reaper.GetTrack(0, params.destTrackIndex)
    end
    
    -- Set track output: -1 = master, otherwise specific track
    local channel_count = 2  -- stereo
    if dest_track then
        reaper.SetMediaTrackInfo_Value(source_track, "B_MAINSEND", 0)  -- Disable master send
        reaper.CreateTrackSend(source_track, dest_track)
    else
        reaper.SetMediaTrackInfo_Value(source_track, "B_MAINSEND", 1)  -- Enable master send
    end
    
    return { success = true }
end

function handlers.batch_set_track_send(params)
    local results = {}
    local source_indices = params.sourceTrackIndices or {}
    local dest_index = params.destTrackIndex or 0
    local volume_db = params.volumeDb or 0
    
    for _, idx in ipairs(source_indices) do
        local result = handlers.set_track_send({
            sourceTrackIndex = idx,
            destTrackIndex = dest_index,
            volumeDb = volume_db
        })
        table.insert(results, { trackIndex = idx, success = result.success, error = result.error })
    end
    
    return { success = true, data = { results = results } }
end

function handlers.batch_set_track_output(params)
    local results = {}
    local source_indices = params.sourceTrackIndices or {}
    local dest_index = params.destTrackIndex or -1
    
    for _, idx in ipairs(source_indices) do
        local result = handlers.set_track_output({
            sourceTrackIndex = idx,
            destTrackIndex = dest_index
        })
        table.insert(results, { trackIndex = idx, success = result.success, error = result.error })
    end
    
    return { success = true, data = { results = results } }
end

-- ===== FX Handlers =====
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
    local track = reaper.GetTrack(0, params.trackIndex or 0)
    if not track then return { success = false, error = "Track not found" } end
    local fx_list = {}
    local fx_count = reaper.TrackFX_GetCount(track)
    for i = 0, fx_count - 1 do
        local retval, fx_name = reaper.TrackFX_GetFXName(track, i, "")
        table.insert(fx_list, {
            fxIndex = i,
            name = fx_name,
            enabled = reaper.TrackFX_GetEnabled(track, i)
        })
    end
    return { success = true, data = fx_list }
end

function handlers.add_fx_to_track(params)
    local track = reaper.GetTrack(0, params.trackIndex or 0)
    if not track then return { success = false, error = "Track not found" } end
    local fx_index = reaper.TrackFX_AddByName(track, params.fxName, false, -1)
    if fx_index < 0 then return { success = false, error = "Failed to add FX" } end
    return { success = true, data = { fxIndex = fx_index } }
end

-- ===== Smart FX Add (TypeScript resolves the exact name via plugin-parser.ts) =====
function handlers.add_fx_to_track_smart(params)
    local track_index = params.trackIndex or 0
    local track = reaper.GetTrack(0, track_index)

    if not track then
        local track_count = reaper.CountTracks(0)
        return {
            success = false,
            error = string.format(
                "Track index %d not found. Project has %d track(s) (valid indices: 0 to %d)",
                track_index, track_count, math.max(0, track_count - 1)
            )
        }
    end

    if not params.fxName then
        return { success = false, error = "fxName is required" }
    end

    -- Exact name already resolved by TypeScript plugin-parser; add (-1) or match loaded (-1000)
    local fx_index = reaper.TrackFX_AddByName(track, params.fxName, false, -1)
    if fx_index < 0 then
        fx_index = reaper.TrackFX_AddByName(track, params.fxName, false, -1000)
    end

    if fx_index < 0 then
        return { success = false, error = "插件加载失败，精确名称为: " .. params.fxName }
    end

    local track_channels = reaper.GetMediaTrackInfo_Value(track, "I_NCHAN")
    return {
        success = true,
        data = {
            fxIndex = fx_index,
            fxName = params.fxName,
            trackChannels = track_channels,
            isMono = (track_channels == 1),
            vendor = params.vendor or "generic"
        }
    }
end

-- ===== NEW: Remove FX Handler =====
function handlers.remove_fx_from_track(params)
    local track = reaper.GetTrack(0, params.trackIndex or 0)
    if not track then return { success = false, error = "Track not found" } end
    local fx_count = reaper.TrackFX_GetCount(track)
    if params.fxIndex < 0 or params.fxIndex >= fx_count then
        return { success = false, error = "FX index out of range" }
    end
    reaper.TrackFX_Delete(track, params.fxIndex)
    return { success = true }
end

-- ===== NEW: FX Parameter Handlers =====
function handlers.get_fx_params(params)
    local track = reaper.GetTrack(0, params.trackIndex or 0)
    if not track then return { success = false, error = "Track not found" } end
    
    local fx_index = params.fxIndex or 0
    local max_params = params.maxParams or 30  -- Increased limit but with full info
    
    -- Check if FX exists
    local fx_count = reaper.TrackFX_GetCount(track)
    if fx_index < 0 or fx_index >= fx_count then
        return { success = false, error = "FX index out of range" }
    end
    
    local param_count = reaper.TrackFX_GetNumParams(track, fx_index)
    local params_list = {}
    local limit = math.min(param_count - 1, max_params - 1)
    
    -- Get FX name for context
    local _, fx_name = reaper.TrackFX_GetFXName(track, fx_index, "")
    
    -- Full param retrieval with all details
    for i = 0, limit do
        local param_info = {
            paramIndex = i,
            name = "Unknown",
            value = 0,
            normalizedValue = 0,
            min = 0,
            max = 1
        }
        
        -- Get parameter name (required)
        local name_ok, retval, name = pcall(reaper.TrackFX_GetParamName, track, fx_index, i, "")
        if name_ok and retval then
            param_info.name = name
        end
        
        -- Get current value
        local value_ok, value = pcall(reaper.TrackFX_GetParam, track, fx_index, i)
        if value_ok then
            param_info.value = value
        end
        
        -- Get extents for normalized calculation
        local extents_ok, min_val, max_val = pcall(reaper.TrackFX_GetParamExtents, track, fx_index, i)
        if extents_ok and min_val and max_val then
            param_info.min = min_val
            param_info.max = max_val
            
            -- Calculate normalized value safely
            local range = max_val - min_val
            if range > 0 then
                param_info.normalizedValue = (param_info.value - min_val) / range
            else
                param_info.normalizedValue = 0
            end
        end
        
        table.insert(params_list, param_info)
    end
    
    return { 
        success = true, 
        data = {
            fxName = fx_name,
            params = params_list,
            totalParams = param_count,
            returnedParams = #params_list
        }
    }
end

function handlers.set_fx_param(params)
    local track = reaper.GetTrack(0, params.trackIndex or 0)
    if not track then return { success = false, error = "Track not found" } end
    
    local ok = pcall(reaper.TrackFX_SetParam, track, params.fxIndex or 0, params.paramIndex or 0, params.value or 0)
    if not ok then
        return { success = false, error = "Failed to set parameter" }
    end
    return { success = true }
end

function handlers.set_fx_param_normalized(params)
    local track = reaper.GetTrack(0, params.trackIndex or 0)
    if not track then return { success = false, error = "Track not found" } end
    
    local fx_index = params.fxIndex or 0
    local param_index = params.paramIndex or 0
    local normalized = params.normalizedValue or 0
    
    -- Use pcall for safety
    local ok, min_val, max_val = pcall(reaper.TrackFX_GetParamExtents, track, fx_index, param_index)
    if not ok then
        -- Fallback: just set the normalized value directly
        pcall(reaper.TrackFX_SetParam, track, fx_index, param_index, normalized)
        return { success = true, warning = "Used direct value (no extents)" }
    end
    
    local actual_value = min_val + normalized * (max_val - min_val)
    local set_ok = pcall(reaper.TrackFX_SetParam, track, fx_index, param_index, actual_value)
    
    if not set_ok then
        return { success = false, error = "Failed to set parameter value" }
    end
    return { success = true }
end

-- ===== NEW: Tweak FX Parameter by Name =====
function handlers.tweak_fx_parameter(params)
    local track = reaper.GetTrack(0, params.trackIndex or 0)
    if not track then return { success = false, error = "Track not found" } end
    
    local fx_name = params.fxName
    local param_index = params.paramIndex or 0
    local normalized_value = params.normalizedValue or 0
    
    if not fx_name then
        return { success = false, error = "fxName is required" }
    end
    
    -- Find FX by name using pcall for safety
    local find_ok, fx_index = pcall(reaper.TrackFX_GetByName, track, fx_name, false)
    if not find_ok or not fx_index or fx_index < 0 then
        -- Try to find by partial match
        local fx_count = reaper.TrackFX_GetCount(track)
        fx_index = -1
        local search_name_lower = fx_name:lower()
        
        for i = 0, fx_count - 1 do
            local name_ok, retval, fx_display_name = pcall(reaper.TrackFX_GetFXName, track, i, "")
            if name_ok and retval and fx_display_name then
                if fx_display_name:lower():find(search_name_lower, 1, true) then
                    fx_index = i
                    break
                end
            end
        end
        
        if fx_index < 0 then
            return { success = false, error = "FX '" .. fx_name .. "' not found on track" }
        end
    end
    
    -- Note: TrackFX_GetParamExtents is not available in all REAPER versions
    -- Use normalized value directly (0-1 range works for most parameters)
    local actual_value = normalized_value
    
    -- Try to use TrackFX_SetParamNormalized if available (preferred)
    local set_ok = false
    if reaper.TrackFX_SetParamNormalized then
        set_ok = pcall(reaper.TrackFX_SetParamNormalized, track, fx_index, param_index, normalized_value)
    end
    
    -- Fallback to TrackFX_SetParam
    if not set_ok then
        set_ok = pcall(reaper.TrackFX_SetParam, track, fx_index, param_index, actual_value)
    end
    
    if not set_ok then
        return { success = false, error = "Failed to set parameter" }
    end
    
    -- Get param name for confirmation
    local name_ok, retval, param_name = pcall(reaper.TrackFX_GetParamName, track, fx_index, param_index, "")
    
    return {
        success = true,
        data = {
            fxIndex = fx_index,
            fxName = fx_name,
            paramIndex = param_index,
            paramName = (name_ok and retval) and param_name or ("Param " .. param_index),
            normalizedValue = normalized_value,
            actualValue = actual_value
        }
    }
end

-- ===== NEW: Manage Track Routing =====
function handlers.manage_track_routing(params)
    local action = params.action
    local source_track_idx = params.sourceTrackIndex
    local dest_track_idx = params.destTrackIndex
    local send_volume_db = params.sendVolumeDb or 0
    local send_pan = params.sendPan or 0
    
    if not action then
        return { success = false, error = "action is required (add_send, remove_send, set_master_send)" }
    end
    
    local source_track = reaper.GetTrack(0, source_track_idx or 0)
    if not source_track then
        return { success = false, error = "Source track not found" }
    end
    
    -- Handle set_master_send: enable/disable master output
    if action == "set_master_send" then
        local enable = params.enable
        if enable == nil then enable = true end
        
        reaper.SetMediaTrackInfo_Value(source_track, "B_MAINSEND", enable and 1 or 0)
        
        return {
            success = true,
            data = {
                action = action,
                sourceTrackIndex = source_track_idx,
                masterSendEnabled = enable
            }
        }
    end
    
    -- For add_send and remove_send, we need destination track
    if action == "add_send" or action == "remove_send" then
        local dest_track = nil
        if dest_track_idx == -1 or dest_track_idx == nil then
            dest_track = reaper.GetMasterTrack(0)
        else
            dest_track = reaper.GetTrack(0, dest_track_idx)
        end
        
        if not dest_track then
            return { success = false, error = "Destination track not found" }
        end
        
        if action == "add_send" then
            -- Create send
            local send_idx = reaper.CreateTrackSend(source_track, dest_track)
            if send_idx < 0 then
                return { success = false, error = "Failed to create send" }
            end
            
            -- Set volume (convert dB to linear)
            local volume_linear = math.exp(send_volume_db / 8.685889638)
            reaper.SetTrackSendInfo_Value(source_track, 0, send_idx, "D_VOL", volume_linear)
            
            -- Set pan (-1 to 1)
            reaper.SetTrackSendInfo_Value(source_track, 0, send_idx, "D_PAN", math.max(-1, math.min(1, send_pan)))
            
            return {
                success = true,
                data = {
                    action = action,
                    sourceTrackIndex = source_track_idx,
                    destTrackIndex = dest_track_idx,
                    sendIndex = send_idx,
                    sendVolumeDb = send_volume_db,
                    sendPan = send_pan
                }
            }
            
        elseif action == "remove_send" then
            -- Find and remove send to destination track
            local send_count = reaper.GetTrackNumSends(source_track, 0)
            local removed = false
            
            for i = 0, send_count - 1 do
                local dest = reaper.GetTrackSendInfo_Value(source_track, 0, i, "P_DESTTRACK")
                if dest == dest_track then
                    reaper.RemoveTrackSend(source_track, 0, i)
                    removed = true
                    break
                end
            end
            
            if not removed then
                return { success = false, error = "Send to destination track not found" }
            end
            
            return {
                success = true,
                data = {
                    action = action,
                    sourceTrackIndex = source_track_idx,
                    destTrackIndex = dest_track_idx,
                    removed = true
                }
            }
        end
    end
    
    return { success = false, error = "Unknown action: " .. action }
end

function handlers.set_fx_enabled(params)
    local track = reaper.GetTrack(0, params.trackIndex or 0)
    if not track then return { success = false, error = "Track not found" } end
    
    reaper.TrackFX_SetEnabled(track, params.fxIndex or 0, params.enabled ~= false)
    return { success = true }
end

-- ===== NEW: Media Item Handlers =====
function handlers.split_item(params)
    local track = reaper.GetTrack(0, params.trackIndex or 0)
    if not track then return { success = false, error = "Track not found" } end
    
    local item = reaper.GetTrackMediaItem(track, params.itemIndex or 0)
    if not item then return { success = false, error = "Item not found" } end
    
    local position = params.position or 0
    local new_item = reaper.SplitMediaItem(item, position)
    
    if new_item then
        local new_index = reaper.GetMediaItemInfo_Value(new_item, "IP_ITEMNUMBER")
        return { success = true, data = { newItemIndex = new_index } }
    else
        return { success = false, error = "Failed to split item" }
    end
end

function handlers.get_item_info(params)
    local track = reaper.GetTrack(0, params.trackIndex or 0)
    if not track then return { success = false, error = "Track not found" } end
    
    local item = reaper.GetTrackMediaItem(track, params.itemIndex or 0)
    if not item then return { success = false, error = "Item not found" } end
    
    local position = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
    local length = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
    local fade_in = reaper.GetMediaItemInfo_Value(item, "D_FADEINLEN")
    local fade_out = reaper.GetMediaItemInfo_Value(item, "D_FADEOUTLEN")
    local volume = reaper.GetMediaItemInfo_Value(item, "D_VOL")
    
    return {
        success = true,
        data = {
            position = position,
            length = length,
            fadeIn = fade_in,
            fadeOut = fade_out,
            volume = volume
        }
    }
end

function handlers.analyze_media_item(params)
    local track = reaper.GetTrack(0, params.trackIndex or 0)
    if not track then return { success = false, error = "Track not found" } end
    
    local item = reaper.GetTrackMediaItem(track, params.itemIndex or 0)
    if not item then return { success = false, error = "Item not found" } end
    
    local take = reaper.GetActiveTake(item)
    local source = take and reaper.GetMediaItemTake_Source(take)
    
    local sample_rate = 44100
    local num_channels = 2
    local peak_level = 0
    
    if source then
        sample_rate = reaper.GetMediaSourceSampleRate(source)
        num_channels = reaper.GetMediaSourceNumChannels(source)
        
        -- Analyze peak (simplified)
        local accessor = reaper.CreateTakeAudioAccessor(take)
        if accessor then
            local sample_count = math.floor(reaper.GetMediaItemInfo_Value(item, "D_LENGTH") * sample_rate)
            -- Note: Full peak analysis would require reading samples
            reaper.DestroyAudioAccessor(accessor)
        end
    end
    
    return {
        success = true,
        data = {
            itemLength = reaper.GetMediaItemInfo_Value(item, "D_LENGTH"),
            sampleRate = sample_rate,
            numChannels = num_channels,
            peakLevel = peak_level
        }
    }
end

-- ===== RENDERING =====
function handlers.isolate_and_render(params)
    local track_id = params.trackId
    local track_ids = params.trackIds
    local render_mode = params.renderMode or "solo"
    local start_time = tonumber(params.startTime) or 0
    local end_time = tonumber(params.endTime)
    
    local proj = 0
    if not end_time then end_time = reaper.GetProjectLength(proj) end
    
    -- Setup output path
    local temp_dir = "/tmp/reaper-mcp"
    os.execute('mkdir -p "' .. temp_dir .. '"')
    local output_filename = "render_" .. os.time() .. ".wav"
    local output_file = temp_dir .. "/" .. output_filename
    
    reaper.ShowConsoleMsg("[MCP] isolate_and_render called: mode=" .. render_mode .. 
                         ", start=" .. start_time .. ", end=" .. end_time .. "\n")
    
    -- Step 1: Save current solo states (NOT mute states - preserve user's mute intent)
    local track_count = reaper.CountTracks(proj)
    local original_solo_states = {}
    for i = 0, track_count - 1 do
        local track = reaper.GetTrack(proj, i)
        if track then
            original_solo_states[i] = reaper.GetMediaTrackInfo_Value(track, "I_SOLO")
        end
    end
    
    -- Step 2: Clear all solos - ensures clean slate for rendering
    reaper.SoloAllTracks(0)
    reaper.ShowConsoleMsg("[MCP] All solo states cleared\n")
    
    -- Step 3: Set solo based on render mode
    if render_mode == "solo" and track_id and track_id ~= "master" then
        -- Solo specific track for isolated render
        local track_index = tonumber(track_id)
        local track = reaper.GetTrack(proj, track_index)
        if track then
            reaper.SetMediaTrackInfo_Value(track, "I_SOLO", 2)
            reaper.ShowConsoleMsg("[MCP] Solo track " .. track_index .. " for isolated render\n")
        end
        
    elseif render_mode == "multi" and track_ids and #track_ids > 0 then
        -- Solo multiple tracks
        reaper.ShowConsoleMsg("[MCP] Multi-track render with " .. #track_ids .. " tracks\n")
        for _, id in ipairs(track_ids) do
            local track_index = tonumber(id)
            local track = reaper.GetTrack(proj, track_index)
            if track then
                reaper.SetMediaTrackInfo_Value(track, "I_SOLO", 2)
                reaper.ShowConsoleMsg("[MCP] Solo track " .. track_index .. "\n")
            end
        end
        
    elseif render_mode == "master" or render_mode == "full" or render_mode == "chorus" then
        -- For master/full/chorus render: DO NOT solo any tracks
        -- Keep all solos cleared so Master receives all non-muted tracks
        reaper.ShowConsoleMsg("[MCP] Master/full render - no tracks soloed (all cleared)\n")
    end
    
    -- Step 4: Set time selection BEFORE render
    reaper.GetSet_LoopTimeRange(true, false, start_time, end_time, false)
    
    -- Verify time selection was set
    local loop_start, loop_end = reaper.GetSet_LoopTimeRange(false, false, 0, 0, false)
    reaper.ShowConsoleMsg("[MCP] Time range set: " .. loop_start .. " - " .. loop_end .. "\n")
    
    -- Step 5: Configure render settings
    reaper.GetSetProjectInfo_String(proj, "RENDER_FILE", temp_dir, true)
    reaper.GetSetProjectInfo_String(proj, "RENDER_PATTERN", output_filename, true)
    reaper.GetSetProjectInfo(proj, "RENDER_BOUNDSFLAG", 2, true)  -- 2 = time selection
    reaper.GetSetProjectInfo(proj, "RENDER_SETTINGS", 0, true)    -- Render master mix regardless of solo
    
    -- Create status file
    local render_start_time = os.time()
    local status_file = temp_dir .. "/render_" .. render_start_time .. "_status.json"
    
    write_file(status_file, to_json({
        status = "rendering",
        filePath = output_file,
        timestamp = render_start_time
    }))
    
    -- Step 6: Define state restoration function (local, NOT called yet!)
    local function restore_states()
        reaper.SoloAllTracks(0)
        for i = 0, track_count - 1 do
            local track = reaper.GetTrack(proj, i)
            if track then
                reaper.SetMediaTrackInfo_Value(track, "I_SOLO", original_solo_states[i] or 0)
            end
        end
        reaper.ShowConsoleMsg("[MCP] Original solo states restored\n")
    end
    
    -- Step 7: Start async render with deferred completion check
    reaper.defer(function()
        reaper.ShowConsoleMsg("[MCP] Starting render to: " .. output_file .. "\n")
        
        -- Trigger render
        reaper.Main_OnCommand(41824, 0)  -- Render project using last settings
        
        local check_delay = 3.0
        local check_start = reaper.time_precise()
        
        local function wait_then_check()
            if reaper.time_precise() - check_start < check_delay then
                reaper.defer(wait_then_check)
                return
            end
            
            local check_count = 0
            local max_checks = 600
            
            local function check_file()
                check_count = check_count + 1
                
                local f = io.open(output_file, "rb")
                if f then
                    local size = f:seek("end")
                    f:close()
                    
                    reaper.ShowConsoleMsg("[MCP] Check " .. check_count .. ": " .. size .. " bytes\n")
                    
                    if size > 200 then
                        -- Render completed successfully
                        local status = {
                            status = "completed",
                            filePath = output_file,
                            fileSize = size,
                            timestamp = os.time()
                        }
                        write_file(status_file, to_json(status))
                        reaper.ShowConsoleMsg("[MCP] Render completed: " .. size .. " bytes\n")
                        
                        -- CRITICAL: Restore states ONLY after render is complete
                        restore_states()
                        return
                    end
                end
                
                if check_count < max_checks then
                    reaper.defer(check_file)
                else
                    -- Timeout - render failed
                    local status = {
                        status = "failed",
                        error = "Timeout waiting for render",
                        timestamp = os.time()
                    }
                    write_file(status_file, to_json(status))
                    reaper.ShowConsoleMsg("[MCP] Render timeout\n")
                    
                    -- CRITICAL: Restore states on timeout as well
                    restore_states()
                end
            end
            
            reaper.defer(check_file)
        end
        
        reaper.defer(wait_then_check)
    end)
    
    -- Return immediately - DO NOT restore states here (they're restored in defer)
    return {
        success = true,
        data = {
            filePath = output_file,
            renderMode = render_mode,
            trackId = track_id,
            trackIds = track_ids,
            startTime = start_time,
            endTime = end_time,
            status = "rendering",
            statusFile = status_file,
            message = "Render started. Check statusFile for completion status."
        }
    }
end

-- ===== Main Loop =====
local function main_loop()
    ensure_dir()
    
    if file_exists(COMMAND_FILE) then
        local command_str = read_file(COMMAND_FILE)
        if command_str then
            local command = parse_json(command_str)
            if command and command.id and command.action then
                reaper.ShowConsoleMsg("[MCP] Received: " .. command.action .. "\n")
                local handler = handlers[command.action]
                local response
                if handler then
                    local ok, result = pcall(handler, command.params or {})
                    if ok then
                        response = result
                        response.id = command.id
                        reaper.ShowConsoleMsg("[MCP] Success: " .. command.action .. "\n")
                    else
                        response = { success = false, error = tostring(result), id = command.id }
                        reaper.ShowConsoleMsg("[MCP] Error: " .. tostring(result) .. "\n")
                    end
                else
                    response = { success = false, error = "Unknown action: " .. command.action, id = command.id }
                    reaper.ShowConsoleMsg("[MCP] Unknown action: " .. command.action .. "\n")
                end
                write_file(RESPONSE_FILE, to_json(response))
                reaper.defer(function()
                    os.remove(COMMAND_FILE)
                end)
            end
        end
    end
    
    reaper.defer(main_loop)
end

reaper.ShowConsoleMsg("REAPER MCP Bridge (Complete Version) started\n")
main_loop()