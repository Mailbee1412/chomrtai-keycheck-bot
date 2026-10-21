import { config } from '../../config.js';

const FILE = config.supportForm.dataPath;

import fs from 'node:fs';
import path from 'node:path';

function safeRead() {
  try {
    if (fs.existsSync(FILE)) {
      return JSON.parse(fs.readFileSync(FILE, 'utf8'));
    }
  } catch (err) {
    console.warn(`[supportForm] อ่านข้อมูลไม่สำเร็จ: ${err.message}`);
  }
  return {};
}

function safeWrite(data) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (err) {
    console.warn(`[supportForm] บันทึกข้อมูลไม่สำเร็จ: ${err.message}`);
  }
}

export function saveRequest(id, payload) {
  const store = safeRead();
  store[id] = payload;
  safeWrite(store);
}

export function getRequest(id) {
  const store = safeRead();
  return store[id] || null;
}
