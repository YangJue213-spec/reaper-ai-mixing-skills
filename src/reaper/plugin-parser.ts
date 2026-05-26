import { promises as fs } from 'fs';

// ===== Public interfaces =====

export interface PluginEntry {
  exactName: string;      // Full string for TrackFX_AddByName (e.g. "VST3: Pro-Q 3 (FabFilter)")
  displayName: string;    // Without vendor suffix (e.g. "Pro-Q 3")
  vendor: string;         // (e.g. "FabFilter")
  type: 'VST3' | 'VST' | 'AU';
  searchTokens: string[]; // lowercase words for fast matching
}

export interface ResolveResult {
  exactName: string;
  displayName: string;
  source: 'cache' | 'js_fallback';
  confidence: 'exact' | 'high' | 'medium' | 'low';
  alternatives: string[]; // other candidate exactNames, up to 3
}

// ===== Cache file paths =====

const VST_INI = '/Applications/reaper-vstplugins_arm64.ini';
const AU_INI  = '/Applications/reaper-auplugins_arm64.ini';

// ===== JS fallback table (used when nothing found in cache) =====

const JS_FALLBACKS: Record<string, string> = {
  'eq':         'VST: ReaEQ (Cockos)',
  'compressor': 'VST: ReaComp (Cockos)',
  'gate':       'VST: ReaGate (Cockos)',
  'limiter':    'VST: ReaLimit (Cockos)',
  'reverb':     'VST: ReaVerbate (Cockos)',
  'delay':      'VST: ReaDelay (Cockos)',
  'deesser':    'VST: ReaEQ (Cockos)',  // fallback to ReaEQ narrow cut
};

// ===== Module-level lazy index =====

let pluginIndex: PluginEntry[] | null = null;

async function ensureIndex(): Promise<PluginEntry[]> {
  if (!pluginIndex) {
    pluginIndex = await parsePluginCache();
    console.error(`[PluginParser] Index loaded: ${pluginIndex.length} entries`);
  }
  return pluginIndex;
}

// ===== Parsing helpers =====

function extractVendorAndDisplay(fullName: string): { displayName: string; vendor: string } {
  // "FabFilter Pro-Q 3 (FabFilter)" → display "FabFilter Pro-Q 3", vendor "FabFilter"
  const parenMatch = fullName.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    return { displayName: parenMatch[1].trim(), vendor: parenMatch[2].trim() };
  }
  return { displayName: fullName, vendor: '' };
}

function buildSearchTokens(displayName: string, vendor: string): string[] {
  const combined = `${displayName} ${vendor}`.toLowerCase();
  // Split on whitespace and common separators, keep tokens ≥ 1 char
  return combined.split(/[\s\-_/\\]+/).filter(t => t.length > 0);
}

function typeScore(type: PluginEntry['type']): number {
  return type === 'VST3' ? 3 : type === 'VST' ? 2 : 1;
}

// ===== Cache parser =====

async function parsePluginCache(): Promise<PluginEntry[]> {
  const entries: PluginEntry[] = [];

  // --- Parse VST/VST3 cache ---
  try {
    const content = await fs.readFile(VST_INI, 'utf-8');
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith(';') || line.startsWith('[')) continue;

      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;

      const keyRaw = line.substring(0, eqIdx);
      const value  = line.substring(eqIdx + 1);

      // Determine filename (strip shell sub-ID after '<')
      const angleIdx = keyRaw.indexOf('<');
      const filename = (angleIdx !== -1 ? keyRaw.substring(0, angleIdx) : keyRaw).toLowerCase();

      // Determine type
      let type: PluginEntry['type'] | null = null;
      if (filename.endsWith('.vst3')) {
        type = 'VST3';
      } else if (filename.endsWith('.vst') || filename.endsWith('.vst.dylib')) {
        type = 'VST';
      } else {
        continue; // not a plugin line we care about
      }

      // Extract display name: always the last comma-separated field
      // For VST3: "HASH,ID{HEX,Name (Vendor)"  → split by comma, last part
      // For VST:  "HASH,ID,Name (Vendor)"        → split by comma, last part
      const parts = value.split(',');
      const rawName = parts[parts.length - 1].trim();

      // Skip entries without a real name (just hashes, SHELL headers, etc.)
      if (!rawName || rawName.startsWith('<') || /^[0-9A-Fa-f{]+$/.test(rawName) || rawName === '0') {
        continue;
      }

      // Strip instrument marker
      const cleanName = rawName.replace(/!!!VSTi$/, '').trim();
      if (!cleanName) continue;

      const { displayName, vendor } = extractVendorAndDisplay(cleanName);
      const exactName = `${type}: ${cleanName}`;
      const searchTokens = buildSearchTokens(displayName, vendor);

      entries.push({ exactName, displayName, vendor, type, searchTokens });
    }
    console.error(`[PluginParser] Parsed VST cache: ${entries.length} entries so far`);
  } catch (err) {
    console.error(`[PluginParser] VST cache error:`, err);
  }

  // --- Parse AU cache ---
  const auCount = entries.length;
  try {
    const content = await fs.readFile(AU_INI, 'utf-8');
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith(';') || line.startsWith('[')) continue;

      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;

      const key = line.substring(0, eqIdx).trim();
      // AU key format: "Developer: PluginName"
      if (!key.includes(':')) continue;

      const exactName = `AU: ${key}`;
      const colonIdx = key.indexOf(':');
      const vendor = key.substring(0, colonIdx).trim();
      const displayName = key.substring(colonIdx + 1).trim();
      const searchTokens = buildSearchTokens(displayName, vendor);

      entries.push({ exactName, displayName, vendor, type: 'AU', searchTokens });
    }
    console.error(`[PluginParser] Parsed AU cache: ${entries.length - auCount} AU entries`);
  } catch (err) {
    console.error(`[PluginParser] AU cache error:`, err);
  }

  return entries;
}

// ===== Levenshtein distance (for priority 4 fuzzy fallback) =====

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = a[i - 1] === b[j - 1]
        ? prevDiag
        : 1 + Math.min(prevDiag, prev[j], prev[j - 1]);
      prevDiag = temp;
    }
  }
  return prev[b.length];
}

// ===== Core resolver =====

export async function resolvePluginName(intent: string): Promise<ResolveResult> {
  const index = await ensureIndex();

  const intentLower = intent.toLowerCase().trim();
  // Split intent into tokens (whitespace + punctuation boundaries)
  const intentTokens = intentLower.split(/[\s\-_/\\]+/).filter(t => t.length > 0);

  // Helper: full searchable text for an entry
  const fullText = (e: PluginEntry) => `${e.displayName} ${e.vendor}`.toLowerCase();

  // Score VST3 > VST > AU for tie-breaking
  const sortByType = (a: PluginEntry, b: PluginEntry) => typeScore(b.type) - typeScore(a.type);

  // ---- Priority 1: exact display name match ----
  const exactMatches = index.filter(e =>
    e.displayName.toLowerCase() === intentLower ||
    e.exactName.toLowerCase() === intentLower
  ).sort(sortByType);

  if (exactMatches.length > 0) {
    const best = exactMatches[0];
    return {
      exactName:   best.exactName,
      displayName: best.displayName,
      source:      'cache',
      confidence:  'exact',
      alternatives: exactMatches.slice(1, 4).map(e => e.exactName),
    };
  }

  // ---- Priority 2: all intent tokens appear as substrings in full text ----
  const highMatches = index.filter(e => {
    const text = fullText(e);
    return intentTokens.every(t => text.includes(t));
  }).sort(sortByType);

  if (highMatches.length > 0) {
    const best = highMatches[0];
    return {
      exactName:   best.exactName,
      displayName: best.displayName,
      source:      'cache',
      confidence:  'high',
      alternatives: highMatches.slice(1, 4).map(e => e.exactName),
    };
  }

  // ---- Priority 3: longest token appears in displayName ----
  const longestToken = intentTokens.sort((a, b) => b.length - a.length)[0] ?? '';
  if (longestToken.length > 1) {
    const mediumMatches = index.filter(e =>
      e.displayName.toLowerCase().includes(longestToken) ||
      e.vendor.toLowerCase().includes(longestToken)
    ).sort(sortByType);

    if (mediumMatches.length > 0) {
      const best = mediumMatches[0];
      return {
        exactName:   best.exactName,
        displayName: best.displayName,
        source:      'cache',
        confidence:  'medium',
        alternatives: mediumMatches.slice(1, 4).map(e => e.exactName),
      };
    }
  }

  // ---- Priority 4: minimum Levenshtein distance against displayName ----
  let bestEntry: PluginEntry | null = null;
  let bestDist = Infinity;

  for (const entry of index) {
    const dist = levenshtein(intentLower, entry.displayName.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      bestEntry = entry;
    }
  }

  // Only use Levenshtein result if reasonably close (dist ≤ 8)
  if (bestEntry && bestDist <= 8) {
    return {
      exactName:   bestEntry.exactName,
      displayName: bestEntry.displayName,
      source:      'cache',
      confidence:  'low',
      alternatives: [],
    };
  }

  // ---- Priority 5: JS fallback ----
  for (const [keyword, fallbackName] of Object.entries(JS_FALLBACKS)) {
    if (intentLower.includes(keyword)) {
      return {
        exactName:   fallbackName,
        displayName: fallbackName.replace(/^(?:VST3?|AU|JS):\s*/, ''),
        source:      'js_fallback',
        confidence:  'low',
        alternatives: [],
      };
    }
  }

  // Last resort: return intent as-is
  return {
    exactName:   intent,
    displayName: intent,
    source:      'js_fallback',
    confidence:  'low',
    alternatives: [],
  };
}

// ===== Compatibility class (used by file-client.ts) =====

export class ReaperPluginParser {
  /**
   * Get available plugins with optional search.
   * forceRefresh clears the module-level cache.
   */
  async getAvailablePlugins(
    searchQuery?: string,
    maxResults: number = 50,
    forceRefresh: boolean = false
  ): Promise<{
    plugins: string[];
    count: number;
    totalCount: number;
    source: 'cache' | 'fallback';
    searchQuery?: string;
    cachePaths: { vst: string; au: string };
  }> {
    if (forceRefresh) pluginIndex = null;

    const index = await ensureIndex();
    let results = index;

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const tokens = q.split(/[\s\-_/\\]+/).filter(t => t.length > 0);
      results = index
        .filter(e => {
          const text = fullTextOf(e);
          return tokens.some(t => text.includes(t));
        })
        .sort((a, b) => {
          // Score: more tokens matched = higher score, VST3 preferred
          const scoreOf = (e: PluginEntry) => {
            const text = fullTextOf(e);
            const matched = tokens.filter(t => text.includes(t)).length;
            return matched * 10 + typeScore(e.type);
          };
          return scoreOf(b) - scoreOf(a);
        });
    }

    const limited = results.slice(0, maxResults);
    const source: 'cache' | 'fallback' = index.length > 0 ? 'cache' : 'fallback';

    return {
      plugins:    limited.map(e => e.exactName),
      count:      limited.length,
      totalCount: index.length,
      source,
      searchQuery: searchQuery || undefined,
      cachePaths: { vst: VST_INI, au: AU_INI },
    };
  }

  clearCache(): void {
    pluginIndex = null;
  }

  getCachePaths(): { vst: string; au: string } {
    return { vst: VST_INI, au: AU_INI };
  }
}

function fullTextOf(e: PluginEntry): string {
  return `${e.displayName} ${e.vendor}`.toLowerCase();
}
