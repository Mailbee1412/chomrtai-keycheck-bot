import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { config } from '../config.js';

const HEADERS = [
  'เวลาที่เช็ค',
  'ชื่อคีย์',
  'คีย์ (ซ่อน)',
  'คีย์เต็ม',
  'โควตาคงเหลือ',
  'ใช้ไปแล้ว',
  'โควตารวม',
  'หน่วย',
  'หมดอายุ',
  'โมเดลคงเหลือ',
  'ผู้ใช้ Discord',
  'ไอดี Discord',
  'ผลลัพธ์',
];

let queue = Promise.resolve();

export function maskKey(key) {
  if (!key) return '';
  if (key.length <= 14) return `${key.slice(0, 6)}...`;
  return `${key.slice(0, 10)}...${key.slice(-4)}`;
}

function buildRow({ key, user, usage, counts, tokenName, error }) {
  const unit = config.linkapi.quotaPerUnit > 0 ? config.linkapi.quotaPerUnit : 500000;
  const n = (v) => Number(v || 0);
  const modelText = (counts || [])
    .map((c) => (c.remaining == null ? `${c.model}: -` : `${c.model}: ${c.remaining} ครั้ง`))
    .join(' | ');
  return [
    new Date().toLocaleString('th-TH'),
    tokenName || '',
    maskKey(key),
    config.linkapi.storeFullKey ? key : '',
    usage ? n(usage.availableRaw) / unit : '',
    usage ? n(usage.totalUsedRaw) / unit : '',
    usage ? n(usage.totalGrantedRaw) / unit : '',
    config.linkapi.unit,
    usage?.expiresAt ? usage.expiresAt.toLocaleString('th-TH') : '',
    usage ? modelText : '',
    user?.tag || user?.username || '',
    user?.id || '',
    error ? `❌ ${error}` : '✅ สำเร็จ',
  ];
}

async function writeRows(rows) {
  const file = config.linkapi.excelPath;
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });

  const workbook = new ExcelJS.Workbook();
  if (fs.existsSync(file)) await workbook.xlsx.readFile(file);

  const sheet = workbook.getWorksheet('Keys') || workbook.addWorksheet('Keys');

  if (sheet.rowCount === 0) {
    const header = sheet.addRow(HEADERS);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F6FED' } };
    header.alignment = { horizontal: 'center' };
    sheet.columns = [
      { width: 20 },
      { width: 20 },
      { width: 24 },
      { width: 52 },
      { width: 16 },
      { width: 14 },
      { width: 14 },
      { width: 10 },
      { width: 20 },
      { width: 60 },
      { width: 22 },
      { width: 20 },
      { width: 16 },
    ];
  }

  for (const row of rows) sheet.addRow(row);

  const tmp = `${file}.tmp`;
  await workbook.xlsx.writeFile(tmp);
  fs.renameSync(tmp, file);
}

export function logKey(entry) {
  const job = queue
    .then(() => writeRows([buildRow(entry)]))
    .catch((err) => console.error('[linkapi] บันทึก Excel ไม่สำเร็จ:', err.message));
  queue = job;
  return job;
}

export function flush() {
  return queue;
}
