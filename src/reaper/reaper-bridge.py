#!/usr/bin/env python3
"""
REAPER MCP Bridge - Python script to communicate with REAPER via ReaScript
This script runs inside REAPER and communicates via files
"""

import reaper_python as RPR
import json
import os
import sys
import time

def get_project_info():
    """Get current project information"""
    proj = 0  # current project
    
    # Get project settings
    sample_rate = RPR.SNM_GetIntConfigVar("projsrate", 44100)
    tempo = RPR.Master_GetTempo()
    num, den = RPR.GetProjectTimeSignature2(proj)
    
    # Count tracks and items
    track_count = RPR.CountTracks(proj)
    item_count = 0
    for i in range(track_count):
        track = RPR.GetTrack(proj, i)
        item_count += RPR.CountTrackMediaItems(track)
    
    # Get project length
    project_length = RPR.GetProjectLength(proj)
    
    return {
        "sampleRate": sample_rate,
        "tempo": tempo,
        "timeSignatureNum": num,
        "timeSignatureDen": den,
        "trackCount": track_count,
        "itemCount": item_count,
        "projectLength": project_length
    }

def get_track_info(track_index):
    """Get information about a track"""
    track = RPR.GetTrack(0, track_index)
    if not track:
        return {"error": "Track not found"}
    
    _, name = RPR.GetTrackName(track, "", 256)
    volume = RPR.GetMediaTrackInfo_Value(track, "D_VOL")
    pan = RPR.GetMediaTrackInfo_Value(track, "D_PAN")
    mute = RPR.GetMediaTrackInfo_Value(track, "B_MUTE") == 1
    solo = RPR.GetMediaTrackInfo_Value(track, "I_SOLO") > 0
    fx_count = RPR.TrackFX_GetCount(track)
    item_count = RPR.CountTrackMediaItems(track)
    
    # Convert volume to dB
    volume_db = 20 * (volume ** 0.5) if volume > 0 else -float('inf')
    
    return {
        "trackNumber": track_index + 1,
        "name": name,
        "volume": volume_db,
        "pan": pan,
        "mute": mute,
        "solo": solo,
        "fxCount": fx_count,
        "itemCount": item_count
    }

def list_available_fx():
    """Get list of available FX"""
    fx_list = []
    i = 0
    while True:
        retval, fx_name = RPR.EnumerateFX(i)
        if not retval:
            break
        fx_list.append(fx_name)
        i += 1
    return fx_list

def get_track_fx(track_index):
    """Get FX on a track"""
    track = RPR.GetTrack(0, track_index)
    if not track:
        return {"error": "Track not found"}
    
    fx_list = []
    fx_count = RPR.TrackFX_GetCount(track)
    
    for i in range(fx_count):
        retval, fx_name = RPR.TrackFX_GetFXName(track, i, "", 256)
        enabled = RPR.TrackFX_GetEnabled(track, i)
        param_count = RPR.TrackFX_GetNumParams(track, i)
        
        fx_list.append({
            "fxIndex": i,
            "name": fx_name,
            "enabled": enabled,
            "paramCount": param_count
        })
    
    return fx_list

def add_fx_to_track(track_index, fx_name):
    """Add FX to a track"""
    track = RPR.GetTrack(0, track_index)
    if not track:
        return {"error": "Track not found"}
    
    fx_index = RPR.TrackFX_AddByName(track, fx_name, False, -1)
    if fx_index < 0:
        return {"error": f"Failed to add FX: {fx_name}"}
    
    RPR.TrackFX_SetEnabled(track, fx_index, True)
    return {"fxIndex": fx_index}

def get_fx_params(track_index, fx_index):
    """Get FX parameters"""
    track = RPR.GetTrack(0, track_index)
    if not track:
        return {"error": "Track not found"}
    
    params = []
    param_count = RPR.TrackFX_GetNumParams(track, fx_index)
    
    for i in range(param_count):
        retval, param_name = RPR.TrackFX_GetParamName(track, fx_index, i, "", 256)
        value, min_val, max_val = RPR.TrackFX_GetParam(track, fx_index, i)
        normalized = RPR.TrackFX_GetParamNormalized(track, fx_index, i)
        
        params.append({
            "paramIndex": i,
            "name": param_name,
            "value": value,
            "minValue": min_val,
            "maxValue": max_val,
            "normalizedValue": normalized
        })
    
    return params

def set_fx_param(track_index, fx_index, param_index, value):
    """Set FX parameter"""
    track = RPR.GetTrack(0, track_index)
    if not track:
        return {"error": "Track not found"}
    
    RPR.TrackFX_SetParam(track, fx_index, param_index, value)
    return {"success": True}

def set_fx_param_normalized(track_index, fx_index, param_index, normalized_value):
    """Set FX parameter using normalized value"""
    track = RPR.GetTrack(0, track_index)
    if not track:
        return {"error": "Track not found"}
    
    RPR.TrackFX_SetParamNormalized(track, fx_index, param_index, normalized_value)
    return {"success": True}

def set_track_volume(track_index, volume_db):
    """Set track volume in dB"""
    track = RPR.GetTrack(0, track_index)
    if not track:
        return {"error": "Track not found"}
    
    # Convert dB to linear
    volume = 10 ** (volume_db / 20)
    RPR.SetMediaTrackInfo_Value(track, "D_VOL", volume)
    return {"success": True}

def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: reaper-bridge.py <command> [args...]")
        sys.exit(1)
    
    command = sys.argv[1]
    
    try:
        if command == "get_project_info":
            result = get_project_info()
        elif command == "get_track_info":
            result = get_track_info(int(sys.argv[2]))
        elif command == "list_available_fx":
            result = list_available_fx()
        elif command == "get_track_fx":
            result = get_track_fx(int(sys.argv[2]))
        elif command == "add_fx_to_track":
            result = add_fx_to_track(int(sys.argv[2]), sys.argv[3])
        elif command == "get_fx_params":
            result = get_fx_params(int(sys.argv[2]), int(sys.argv[3]))
        elif command == "set_fx_param":
            result = set_fx_param(int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), float(sys.argv[5]))
        elif command == "set_fx_param_normalized":
            result = set_fx_param_normalized(int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), float(sys.argv[5]))
        elif command == "set_track_volume":
            result = set_track_volume(int(sys.argv[2]), float(sys.argv[3]))
        else:
            result = {"error": f"Unknown command: {command}"}
        
        print(json.dumps(result))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()