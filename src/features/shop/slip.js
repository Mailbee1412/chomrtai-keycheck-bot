import { config } from '../../config.js';

// เปิดใช้เมื่อมีคีย์ผู้ให้บริการอ่านสลิป
export function isSlipVerifyEnabled() {
  return Boolean(config.shop.slipVerifyKey);
}

// ให้เทสต์สลับ fetch ได้ (ไม่แตะ global)
let fetchImpl = (...args) => globalThis.fetch(...args);
export function __setFetch(fn) {
  fetchImpl = fn ? (...args) => fn(...args) : (...args) => globalThis.fetch(...args);
}

function toAsset(buffer, mime) {
  const type = mime || 'image/jpeg';
  const b64 = Buffer.isBuffer(buffer) ? buffer.toString('base64') : Buffer.from(buffer).toString('base64');
  return { mime: type, base64: b64, dataUri: `data:${type};base64,${b64}` };
}

// แปลงผลจาก EasySlip v2 ให้เป็นรูปแบบกลางของเรา
function normalizeEasySlip(data = {}) {
  const raw = data.rawSlip || {};
  const amount = Number(data.amountInSlip ?? raw.amount?.amount ?? 0) || 0;
  return {
    amount,
    duplicate: Boolean(data.isDuplicate),
    transRef: raw.transRef || null,
    paidAt: raw.date || null,
    sendingBank: raw.sender?.bank?.short || raw.sender?.bank?.name || null,
    receivingBank: raw.receiver?.bank?.short || raw.receiver?.bank?.name || null,
    senderName: raw.sender?.account?.name?.th || raw.sender?.account?.name?.en || null,
    receiverName: raw.receiver?.account?.name?.th || raw.receiver?.account?.name?.en || null,
  };
}

// EasySlip (Thunder) v2 — POST /v2/verify/bank (Bearer + base64)
async function verifyEasySlip(asset) {
  const base = config.shop.slipVerifyBase || 'https://api.easyslip.com';
  const res = await fetchImpl(`${base}/v2/verify/bank`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.shop.slipVerifyKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ base64: asset.dataUri, checkDuplicate: true }),
  });
  const json = await res.json().catch(() => null);
  if (!json) return { ok: false, error: 'อ่านผลจากผู้ให้บริการไม่ได้' };
  if (!json.success) return { ok: false, error: json.error?.message || 'ตรวจสอบสลิปไม่สำเร็จ' };
  return { ok: true, ...normalizeEasySlip(json.data) };
}

// ดึง JSON ก้อนแรกออกจากข้อความ (กันกรณีโมเดลครอบด้วย ```json ... ```)
function parseJsonLoose(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* ลองหาวัตถุ JSON ก้อนแรก */
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

// แปลงผลจาก Gemini ให้เป็นรูปแบบกลางของเรา (Gemini อ่านจากรูปเท่านั้น — ไม่ยืนยันกับธนาคาร)
function normalizeGemini(parsed = {}) {
  const pick = (v) => (v == null || v === '' ? null : String(v));
  return {
    amount: Number(parsed.amount) || 0,
    duplicate: false,
    transRef: pick(parsed.transRef),
    paidAt: pick(parsed.paidAt),
    sendingBank: pick(parsed.sendingBank),
    receivingBank: pick(parsed.receivingBank),
    senderName: pick(parsed.senderName),
    receiverName: pick(parsed.receiverName),
  };
}

const GEMINI_PROMPT = [
  'อ่านสลิปโอนเงินธนาคารไทยจากรูปภาพนี้ แล้วตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่น',
  'รูปแบบ: {"isSlip":true,"amount":0,"transRef":"","paidAt":"","sendingBank":"","receivingBank":"","senderName":"","receiverName":""}',
  '- amount = จำนวนเงินที่โอน (ตัวเลข)',
  '- transRef = เลขอ้างอิง/รหัสธุรกรรมบนสลิป',
  '- paidAt = วันเวลาที่โอน (ตามที่ปรากฏบนสลิป)',
  '- sendingBank / receivingBank = ธนาคารต้นทาง / ปลายทาง',
  '- senderName / receiverName = ชื่อผู้โอน / ผู้รับ',
  'ถ้ารูปนี้ไม่ใช่สลิปโอนเงิน ให้ตอบ {"isSlip":false}',
].join('\n');

// Gemini (Google AI Studio) — POST /v1beta/models/{model}:generateContent?key=...
async function verifyGemini(asset) {
  const base = config.shop.slipVerifyBase || 'https://generativelanguage.googleapis.com';
  const model = config.shop.slipVerifyModel || 'gemini-2.5-flash';
  const url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.shop.slipVerifyKey)}`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: asset.mime, data: asset.base64 } },
            { text: GEMINI_PROMPT },
          ],
        },
      ],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }),
  });
  const json = await res.json().catch(() => null);
  if (!json) return { ok: false, error: 'อ่านผลจาก Gemini ไม่ได้' };
  if (json.error) return { ok: false, error: json.error.message || 'Gemini ตรวจสอบสลิปไม่สำเร็จ' };
  const text = (json.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text)
    .filter(Boolean)
    .join('');
  const parsed = parseJsonLoose(text);
  if (!parsed) return { ok: false, error: 'Gemini ตอบกลับไม่ใช่ JSON' };
  if (parsed.isSlip === false) return { ok: false, error: 'รูปนี้ไม่ใช่สลิป' };
  return { ok: true, ...normalizeGemini(parsed) };
}

const PROVIDERS = { easyslip: verifyEasySlip, gemini: verifyGemini };

// อ่านสลิปจากรูป (buffer) → คืนค่ากลาง: { ok, amount, transRef, paidAt, sendingBank, receivingBank, senderName, receiverName, duplicate } หรือ { ok:false, error }
export async function verifySlip(buffer, { mime = 'image/jpeg' } = {}) {
  if (!isSlipVerifyEnabled()) return { ok: false, disabled: true, error: 'ยังไม่ได้ตั้งค่าคีย์อ่านสลิป' };
  const verify = PROVIDERS[config.shop.slipVerifyProvider];
  if (!verify) return { ok: false, error: `ไม่รองรับผู้ให้บริการอ่านสลิป: ${config.shop.slipVerifyProvider}` };
  try {
    return await verify(toAsset(buffer, mime));
  } catch (err) {
    return { ok: false, error: err?.message || 'เชื่อมต่อผู้ให้บริการอ่านสลิปไม่ได้' };
  }
}

// ดึงไฟล์แนบ (สลิป) มาเป็น buffer + mime
export async function fetchAttachment(attachment) {
  const res = await fetchImpl(attachment.url);
  const ab = await res.arrayBuffer();
  const mime =
    attachment.contentType || res.headers?.get?.('content-type') || 'image/jpeg';
  return { buffer: Buffer.from(ab), mime };
}
