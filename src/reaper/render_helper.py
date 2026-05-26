#!/usr/bin/env python3
"""
REAPER Render Helper - Safe background rendering
Uses REAPER's ReaScript Python API for true silent rendering
"""

import reapy
import sys
import os
import time

def render_project(output_path, start_time=0, end_time=None, track_ids=None):
    """
    Render REAPER project to file
    
    Args:
        output_path: Output file path
        start_time: Start time in seconds
        end_time: End time in seconds (None for project end)
        track_ids: List of track IDs to solo (None for master mix)
    """
    try:
        # Connect to REAPER
        proj = reapy.Project()
        
        # Save current solo states
        original_solo_states = []
        for track in proj.tracks:
            original_solo_states.append(track.is_solo)
            track.is_solo = False
        
        # Apply solo if needed
        if track_ids:
            for idx in track_ids:
                if idx < len(proj.tracks):
                    proj.tracks[idx].is_solo = True
        
        # Set time selection
        if end_time is None:
            end_time = proj.length
        proj.time_selection = start_time, end_time
        
        # Configure render settings
        # Use REAPER's render preset
        render_settings = {
            'output_file': output_path,
            'sample_rate': 44100,
            'channels': 2,
        }
        
        # Perform silent render using reapy
        # This uses REAPER's API directly without blocking UI
        proj.render(
            path=output_path,
            source='master',
            bounds='time_selection',
            options={
                'sample_rate': 44100,
                'channels': 2,
            }
        )
        
        # Restore solo states
        for i, track in enumerate(proj.tracks):
            track.is_solo = original_solo_states[i]
        
        # Wait for file to be created
        max_wait = 30  # seconds
        waited = 0
        while not os.path.exists(output_path) and waited < max_wait:
            time.sleep(0.5)
            waited += 0.5
        
        if os.path.exists(output_path):
            file_size = os.path.getsize(output_path)
            print(f"SUCCESS: {output_path} ({file_size} bytes)")
            return True
        else:
            print(f"ERROR: File not created after {max_wait}s")
            return False
            
    except Exception as e:
        print(f"ERROR: {str(e)}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: render_helper.py <output_path> <start_time> [end_time] [track_ids...]")
        sys.exit(1)
    
    output_path = sys.argv[1]
    start_time = float(sys.argv[2])
    end_time = float(sys.argv[3]) if len(sys.argv) > 3 else None
    track_ids = [int(x) for x in sys.argv[4:]] if len(sys.argv) > 4 else None
    
    success = render_project(output_path, start_time, end_time, track_ids)
    sys.exit(0 if success else 1)