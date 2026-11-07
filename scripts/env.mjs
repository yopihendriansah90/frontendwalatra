import fs from 'node:fs';
import path from 'node:path';

export function loadEnv(root) {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    process.env[match[1]] = value;
  }
}

export function envNumber(name, fallback, {min = 1, max = Number.MAX_SAFE_INTEGER} = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} harus berupa bilangan bulat ${min}–${max}.`);
  return value;
}

export function httpURL(name, fallback, {originOnly = false} = {}) {
  const value = (process.env[name] || fallback).replace(/\/$/, '');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (originOnly && url.pathname !== '/')) {
    throw new Error(`${name} harus URL HTTP(S)${originOnly ? ' origin tanpa path' : ''}, tanpa kredensial, query, atau fragment.`);
  }
  return value;
}
