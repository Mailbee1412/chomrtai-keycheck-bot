import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';

const FILE = path.join(DATA_DIR, 'linkapi-threads.json');

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    cache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    cache = {};
  }
  return cache;
}

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (err) {
    console.warn(`[linkapi] บันทึกทะเบียน thread ไม่สำเร็จ: ${err.message}`);
  }
}

function keyOf(guildId, userId) {
  return `${guildId}:${userId}`;
}

export function getThreadId(guildId, userId) {
  return load()[keyOf(guildId, userId)] || null;
}

export function setThreadId(guildId, userId, threadId) {
  load()[keyOf(guildId, userId)] = threadId;
  persist();
}

export function clearThreadId(guildId, userId) {
  const map = load();
  if (map[keyOf(guildId, userId)]) {
    delete map[keyOf(guildId, userId)];
    persist();
  }
}
