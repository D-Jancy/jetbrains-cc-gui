/**
 * Discover Grok models from ~/.grok/config.toml profiles and models_cache.json.
 *
 * Grok CLI `-m` must be a **config profile name** (`[model."name"]`) when using
 * custom base_url/api_key. Dumping the entire models_cache (often a third-party
 * OpenAI-compatible gateway catalog with third-party model ids) into the picker
 * is wrong — those ids bypass profile routing.
 *
 * Profile shapes accepted by `grok models` (and therefore by this parser):
 *  - `[model.name]` / `[model."name"]` / `[model.'name']` sections
 *  - inline tables under `[model]` (`name = { model = "...", name = "..." }`)
 *  - unquoted dotted headers such as `[model.gpt-4.1]`, which the CLI itself
 *    registers as the first bare segment (`gpt-4`)
 * Hidden profiles are omitted, matching `grok models`.
 *
 * Priority:
 *  1. Profiles from config.toml (always preferred when present)
 *  2. models_cache.json (official / bare API catalogs, only when no profiles)
 *  3. Static last-resort fallbacks
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function resolveGrokDir() {
  const env = process.env.GROK_HOME;
  if (env && String(env).trim()) return String(env).trim();
  return join(homedir(), '.grok');
}

export function parseModelsCacheJson(jsonText) {
  const models = [];
  const seen = new Set();
  try {
    const data = JSON.parse(jsonText);
    const modelsObj = data?.models || (typeof data === 'object' && !Array.isArray(data) ? data : null);
    if (modelsObj && typeof modelsObj === 'object') {
      for (const [id, entry] of Object.entries(modelsObj)) {
        if (!id || seen.has(id)) continue;
        // Skip scalar metadata keys (e.g. `fetched_at`) that appear in
        // root-map layouts without a `models` wrapper.
        if (!entry || typeof entry !== 'object') continue;
        const raw = entry.info && typeof entry.info === 'object' ? entry.info : entry;
        if (raw.hidden === true) continue;
        seen.add(id);
        models.push({
          id,
          label: raw.name || raw.id || id,
          description: raw.description || raw.model || id,
        });
      }
    }
  } catch {
    // Ignore JSON parse errors
  }
  return { models, seen };
}

/**
 * Extract the body of a TOML section, line-based so a top-level `[` inside a
 * section body (e.g. an unindented multi-line array) cannot truncate it early.
 * Returns null when the section is absent.
 */
function extractTomlSection(src, sectionName) {
  const lines = String(src).split('\n');
  let inSection = false;
  let found = false;
  const body = [];
  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)\]/);
    if (header) {
      if (inSection) break;
      inSection = header[1].trim() === sectionName;
      found = found || inSection;
      continue;
    }
    if (inSection) body.push(line);
  }
  return found ? body.join('\n') : null;
}

function stripTomlComment(line) {
  let quote = null;
  let escaped = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\' && quote === '"') {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#') return line.slice(0, i);
  }
  return line;
}

function splitTomlAssignment(line) {
  const code = stripTomlComment(line).trim();
  if (!code || code.startsWith('#')) return null;
  let quote = null;
  let escaped = false;
  for (let i = 0; i < code.length; i += 1) {
    const ch = code[i];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\' && quote === '"') {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '=') {
      const key = code.slice(0, i).trim();
      const value = code.slice(i + 1).trim();
      if (!key || !value) return null;
      return { key, value };
    }
  }
  return null;
}

function unescapeTomlString(raw, quote) {
  if (quote === "'") return raw;
  return raw.replace(/\\(["\\nrt])/g, (_, ch) => {
    if (ch === 'n') return '\n';
    if (ch === 'r') return '\r';
    if (ch === 't') return '\t';
    return ch;
  });
}

/**
 * Parse a TOML key or scalar that may be bare, basic-quoted, or literal-quoted.
 * Returns null when the token is not a simple key/scalar.
 */
function parseTomlToken(token) {
  const text = String(token || '').trim();
  if (!text) return null;
  const quote = text[0];
  if (quote === '"' || quote === "'") {
    let escaped = false;
    for (let i = 1; i < text.length; i += 1) {
      const ch = text[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\' && quote === '"') {
        escaped = true;
        continue;
      }
      if (ch === quote) {
        return {
          value: unescapeTomlString(text.slice(1, i), quote),
          rest: text.slice(i + 1),
        };
      }
    }
    return null;
  }
  const bare = text.match(/^([A-Za-z0-9_-]+)/);
  if (!bare) return null;
  return { value: bare[1], rest: text.slice(bare[1].length) };
}

function parseTomlScalar(raw) {
  const token = parseTomlToken(raw);
  if (!token) return null;
  if (raw.trim()[0] === '"' || raw.trim()[0] === "'") return token.value;
  if (token.value === 'true') return true;
  if (token.value === 'false') return false;
  return token.value;
}

function parseTomlKey(raw) {
  const token = parseTomlToken(raw);
  if (!token || token.rest.trim()) return null;
  return token.value;
}

function braceDepth(text) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\' && quote === '"') {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
  }
  return depth;
}

function parseInlineTableFields(inner) {
  const fields = {};
  let quote = null;
  let escaped = false;
  let depth = 0;
  let start = 0;
  const parts = [];
  const text = String(inner || '');
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\' && quote === '"') {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  for (const part of parts) {
    const assignment = splitTomlAssignment(part);
    if (!assignment) continue;
    const key = parseTomlKey(assignment.key);
    if (!key) continue;
    fields[key] = parseTomlScalar(assignment.value);
  }
  return fields;
}

/**
 * Model id from a `[model.<id>]` header.
 *
 * Quoted ids are kept whole (`[model."gpt-4.1"]` → `gpt-4.1`). Unquoted dotted
 * headers are split by TOML the same way `grok models` does
 * (`[model.gpt-4.1]` → `gpt-4`). Extra path segments (`model.foo.bar`) are
 * returned as a low-priority stub so a later exact `[model.foo]` can win.
 */
function modelSectionIdentity(sectionName) {
  if (!sectionName.startsWith('model.')) return null;
  const rest = sectionName.slice('model.'.length).trim();
  if (!rest) return null;
  const quoted = rest[0] === '"' || rest[0] === "'";
  const token = parseTomlToken(rest);
  if (!token || !token.value) return null;
  const after = token.rest.trim();
  if (after.startsWith('.')) {
    return quoted ? null : { id: token.value, exact: false };
  }
  if (after) return null;
  return { id: token.value, exact: true };
}

function isChildOfModel(sectionName, modelId) {
  if (!modelId) return false;
  return sectionName === `model.${modelId}`
    || sectionName.startsWith(`model.${modelId}.`)
    || sectionName.startsWith(`model."${modelId}".`)
    || sectionName.startsWith(`model.'${modelId}'.`);
}

function profileFromFields(id, fields) {
  const nestedId = typeof fields.model === 'string' ? fields.model.trim() : '';
  const displayName = typeof fields.name === 'string' ? fields.name.trim() : '';
  const profile = {
    id,
    // Prefer explicit display name, then nested upstream model id, then profile id.
    label: displayName || nestedId || id,
    description: nestedId || id,
  };
  if (fields.supportsMaxReasoningEffort === true) {
    profile.supportsMaxReasoningEffort = true;
  }
  return profile;
}

export function parseGrokProfilesFromToml(tomlText, seenSet = new Set()) {
  const src = String(tomlText || '');
  let defaultModel = null;

  // Grok keeps `default` inside the `[models]` section. Restrict the match to
  // that section (falling back to the top-level region before the first
  // header) so a `default = "..."` key inside a [model.*] profile or an
  // unrelated section is not misread as the global default.
  const modelsBody = extractTomlSection(src, 'models');
  const defaultScope = modelsBody != null
    ? modelsBody
    : src.split(/^\s*\[/m)[0];
  const defaultMatch = defaultScope.match(/^\s*default\s*=\s*"([^"]+)"/m);
  if (defaultMatch) {
    defaultModel = defaultMatch[1].trim();
  }

  const profiles = new Map();
  const order = [];
  let current = null;
  let inlineBuffer = null;

  const remember = (profile, exact) => {
    if (!profile?.id || seenSet.has(profile.id)) return;
    const existing = profiles.get(profile.id);
    if (existing && existing.exact && !exact) return;
    if (!existing) order.push(profile.id);
    profiles.set(profile.id, { ...profile, exact: exact || existing?.exact || false });
  };

  const commitCurrent = () => {
    if (!current || current.kind !== 'profile' || current.hidden || !current.id) {
      current = null;
      return;
    }
    remember(profileFromFields(current.id, current.fields), current.exact);
    current = null;
  };

  const commitInline = (id, rawTable) => {
    const text = String(rawTable || '').trim();
    if (!text.startsWith('{') || !text.endsWith('}')) return;
    const fields = parseInlineTableFields(text.slice(1, -1));
    if (fields.hidden === true) return;
    remember(profileFromFields(id, fields), true);
  };

  const lines = src.split(/\r?\n/);
  for (const rawLine of lines) {
    if (inlineBuffer) {
      inlineBuffer.text += `\n${rawLine}`;
      inlineBuffer.depth += braceDepth(rawLine);
      if (inlineBuffer.depth <= 0) {
        commitInline(inlineBuffer.id, inlineBuffer.text);
        inlineBuffer = null;
      }
      continue;
    }

    const trimmed = stripTomlComment(rawLine).trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const header = trimmed.match(/^(\[\[|\[)\s*([^\]]+?)\s*(\]\]|\])\s*$/);
    if (header) {
      const isArray = header[1] === '[[';
      const sectionName = header[2].trim();
      if (current && current.kind === 'profile' && isChildOfModel(sectionName, current.id)) {
        continue;
      }
      commitCurrent();
      if (isArray) {
        current = null;
        continue;
      }
      if (sectionName === 'model') {
        current = { kind: 'inline-parent' };
        continue;
      }
      const identity = modelSectionIdentity(sectionName);
      if (!identity) {
        current = null;
        continue;
      }
      current = {
        kind: 'profile',
        id: identity.id,
        exact: identity.exact,
        hidden: false,
        fields: {},
      };
      continue;
    }

    if (!current) continue;
    const assignment = splitTomlAssignment(trimmed);
    if (!assignment) continue;

    if (current.kind === 'inline-parent') {
      const id = parseTomlKey(assignment.key);
      if (!id || !assignment.value.startsWith('{')) continue;
      const depth = braceDepth(assignment.value);
      if (depth > 0) {
        inlineBuffer = { id, text: assignment.value, depth };
      } else {
        commitInline(id, assignment.value);
      }
      continue;
    }

    const key = parseTomlKey(assignment.key);
    if (!key) continue;
    const value = parseTomlScalar(assignment.value);
    if (key === 'hidden' && value === true) current.hidden = true;
    if (key === 'id' && value === 'max') current.fields.supportsMaxReasoningEffort = true;
    if (key === 'model' || key === 'name' || key === 'description') {
      if (typeof value === 'string') current.fields[key] = value;
    }
  }
  if (inlineBuffer) commitInline(inlineBuffer.id, inlineBuffer.text);
  commitCurrent();

  const models = order
    .map((id) => profiles.get(id))
    .filter(Boolean)
    .map(({ exact, ...profile }) => profile);
  for (const model of models) seenSet.add(model.id);
  return { models, defaultModel };
}

/** Static last-resort list when neither profiles nor cache exist. */
export const GROK_STATIC_FALLBACK_MODELS = [
  { id: 'grok-4.6', label: 'Grok 4.6', description: "SpaceXAI's new frontier model" },
  { id: 'grok-3', label: 'Grok 3', description: 'xAI Grok 3' },
  { id: 'grok-2', label: 'Grok 2', description: 'xAI Grok 2' },
  { id: 'grok-beta', label: 'Grok Beta', description: 'xAI Grok Beta' },
];

/**
 * Pure merge used by listModels (and tests): prefer profiles over the raw
 * API catalog dump.
 */
export function resolveGrokPickerModels({ profileModels = [], cacheModels = [], defaultModel = null } = {}) {
  const profiles = Array.isArray(profileModels) ? profileModels : [];
  const cache = Array.isArray(cacheModels) ? cacheModels : [];

  if (profiles.length > 0) {
    // Enrich profile labels from cache when the same id exists and the profile
    // still shows a bare id as its label.
    const cacheById = new Map(cache.map((m) => [m.id, m]));
    const models = profiles.map((profile) => {
      const fromCache = cacheById.get(profile.id);
      if (!fromCache) return profile;
      const labelIsBareId = !profile.label || profile.label === profile.id;
      if (!labelIsBareId) return profile;
      return {
        ...profile,
        label: fromCache.label || profile.label,
        description: profile.description || fromCache.description,
      };
    });
    return {
      models,
      defaultModel: defaultModel || profiles[0].id,
    };
  }

  if (cache.length > 0) {
    return {
      models: cache,
      defaultModel: defaultModel || cache[0].id,
    };
  }

  return {
    models: [...GROK_STATIC_FALLBACK_MODELS],
    defaultModel: defaultModel || 'grok-4.6',
  };
}

export function listModels() {
  const grokDir = resolveGrokDir();
  const cachePath = join(grokDir, 'models_cache.json');
  const configPath = join(grokDir, 'config.toml');

  let cacheModels = [];
  let profileModels = [];
  let defaultModel = null;

  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf8');
      const parsed = parseGrokProfilesFromToml(raw, new Set());
      profileModels = parsed.models;
      if (parsed.defaultModel) defaultModel = parsed.defaultModel;
    } catch (e) {
      console.error('[Grok Models] Failed to read config.toml:', e?.message || e);
    }
  }

  if (existsSync(cachePath)) {
    try {
      const raw = readFileSync(cachePath, 'utf8');
      const { models } = parseModelsCacheJson(raw);
      cacheModels = models;
    } catch (e) {
      console.error('[Grok Models] Failed to read models_cache.json:', e?.message || e);
    }
  }

  const resolved = resolveGrokPickerModels({
    profileModels,
    cacheModels,
    defaultModel,
  });

  const payload = {
    success: true,
    models: resolved.models,
    defaultModel: resolved.defaultModel,
  };

  console.log(JSON.stringify(payload));
  return payload;
}
