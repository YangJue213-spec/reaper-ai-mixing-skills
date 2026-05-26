import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ReaperConfig, ReaperScriptResult } from '../types/reaper.js';

const execAsync = promisify(exec);

export class ReaperScriptRunner {
  private config: ReaperConfig;

  constructor(config: ReaperConfig = {}) {
    this.config = {
      reaperPath: config.reaperPath || this.getDefaultReaperPath(),
      pythonPath: config.pythonPath || 'python3',
      scriptTimeout: config.scriptTimeout || 30000,
    };
  }

  private getDefaultReaperPath(): string {
    const platform = process.platform;
    switch (platform) {
      case 'darwin':
        return '/Applications/REAPER.app/Contents/MacOS/REAPER';
      case 'win32':
        return 'C:\\Program Files\\REAPER\\reaper.exe';
      case 'linux':
        return '/usr/bin/reaper';
      default:
        return 'reaper';
    }
  }

  /**
   * Execute a Lua script in REAPER via ReaScript
   */
  async executeLuaScript(luaCode: string): Promise<ReaperScriptResult> {
    const scriptPath = join(tmpdir(), `reaper_script_${Date.now()}.lua`);
    const outputPath = join(tmpdir(), `reaper_output_${Date.now()}.txt`);
    
    // Wrap script to write output to file
    const wrappedScript = `
local output_path = "${outputPath.replace(/\\/g, '\\\\')}"
${luaCode}

-- Write result to file
local outputFile = io.open(output_path, "w")
if outputFile then
  local json = require("dkjson")
  local success, encoded = pcall(json.encode, result or {})
  if success then
    outputFile:write(encoded)
  else
    outputFile:write("{}")
  end
  outputFile:close()
else
  reaper.ShowConsoleMsg("Failed to open output file: " .. output_path .. "\\n")
end
`;

    try {
      // Write Lua script to temp file
      await writeFile(scriptPath, wrappedScript, 'utf8');

      // Execute script via REAPER CLI - REAPER runs scripts asynchronously
      const command = `"${this.config.reaperPath}" -run "${scriptPath}"`;
      
      try {
        await execAsync(command, {
          timeout: 5000, // Short timeout since REAPER might hang
          encoding: 'utf8',
        });
      } catch (execError) {
        // REAPER often returns non-zero even on success, ignore
      }

      // Wait a bit for REAPER to execute the script and write output
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Read output from file
      try {
        const output = await readFile(outputPath, 'utf8');
        const data = JSON.parse(output);
        return { success: true, data };
      } catch (readError) {
        // If file doesn't exist yet, try once more after delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          const output = await readFile(outputPath, 'utf8');
          const data = JSON.parse(output);
          return { success: true, data };
        } catch {
          return {
            success: false,
            error: 'Failed to read script output file: ' + outputPath,
          };
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      // Cleanup temp files
      try {
        await unlink(scriptPath);
      } catch {}
      // Don't delete output file immediately to allow debugging
      setTimeout(async () => {
        try {
          await unlink(outputPath);
        } catch {}
      }, 5000);
    }
  }

  /**
   * Execute a Python script in REAPER (requires REAPER Python extension)
   */
  async executePythonScript(pythonCode: string): Promise<ReaperScriptResult> {
    const scriptPath = join(tmpdir(), `reaper_script_${Date.now()}.py`);
    
    try {
      await writeFile(scriptPath, pythonCode, 'utf8');

      const command = `"${this.config.reaperPath}" -nosplash -run "${scriptPath}"`;
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: this.config.scriptTimeout,
        encoding: 'utf8',
      });

      if (stderr && !stderr.includes('ReaScript')) {
        return {
          success: false,
          error: stderr,
        };
      }

      const output = stdout.trim();
      try {
        const data = JSON.parse(output);
        return { success: true, data };
      } catch {
        return { success: true, data: output };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      try {
        await unlink(scriptPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Generate Lua code wrapper with JSON output
   */
  wrapLuaWithOutput(luaCode: string): string {
    return `
local json = require('dkjson')  -- REAPER has dkjson built-in

-- Result table
local result = {}

-- User code
${luaCode}

-- Output result as JSON
reaper.ShowConsoleMsg(json.encode(result))
`;
  }

  /**
   * Check if REAPER is available
   */
  async isReaperAvailable(): Promise<boolean> {
    try {
      const testScript = `reaper.ShowConsoleMsg("OK")`;
      const result = await this.executeLuaScript(testScript);
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * Execute script and return raw output
   */
  async executeRaw(script: string, isLua: boolean = true): Promise<string> {
    const result = isLua 
      ? await this.executeLuaScript(script)
      : await this.executePythonScript(script);
    
    if (!result.success) {
      throw new Error(result.error || 'Unknown error');
    }
    
    return typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
  }
}