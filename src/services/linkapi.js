import { config } from '../config.js';

const MODEL_PREFIX_RE = /^\[[^\]]+\]\s*/;

async function requestJson(url, headers, { method = 'GET', body: payloadBody, timeoutMs = 30000 } = {}) {
  const res = await fetch(url, {
    method,
    headers: { Accept: 'application/json', ...(payloadBody ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: payloadBody ? JSON.stringify(payloadBody) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (body && body.error) {
    const message = typeof body.error === 'string' ? body.error : body.error.message || 'unknown error';
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(body ? body.message || body.error || JSON.stringify(body) : `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

export function stripModelPrefix(name) {
  return String(name || '').replace(MODEL_PREFIX_RE, '').trim();
}

// ราคาต่อครั้งบางโมเดล (รวม [次]) ไม่ได้อยู่ในฟิลด์ model_price
// แต่ฝังอยู่ใน billing_expr เช่น tier("base", fixed(0.2))
export function parseFixedPrice(billingExpr) {
  const m = /fixed\(\s*([0-9.]+)\s*\)/.exec(String(billingExpr || ''));
  return m ? Number(m[1]) : 0;
}

export function normalizeModelLimits(value) {
  let v = value;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return [];
    try {
      v = JSON.parse(s);
    } catch {
      return s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    }
  }
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (v && typeof v === 'object') {
    return Object.entries(v)
      .filter(([, val]) => val !== false && val !== null && val !== undefined && val !== 0)
      .map(([k]) => String(k).trim())
      .filter(Boolean);
  }
  return [];
}

function parseExpiry(value) {
  const n = Number(value || 0);
  if (!n || n < 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms);
}

// ---------------------------------------------------------------------------
// ข้อมูลคีย์ (โควตา + รายชื่อโมเดลลิมิตที่ตั้งไว้ในคีย์)
// ---------------------------------------------------------------------------
export async function getKeyUsage(apiKey) {
  const data = await requestJson(`${config.linkapi.base}/api/usage/token/`, {
    Authorization: `Bearer ${apiKey}`,
  });
  const d = data && data.data ? data.data : data;
  if (!d || typeof d !== 'object') throw new Error('ไม่พบข้อมูลคีย์');
  const granted = Number(d.total_granted) || 0;
  const used = Number(d.total_used) || 0;
  const available = Number(d.total_available);
  return {
    name: d.name || '',
    unlimited: Boolean(d.unlimited_quota),
    totalGrantedRaw: granted,
    totalUsedRaw: used,
    availableRaw: Number.isFinite(available) ? available : Math.max(0, granted - used),
    modelLimits: normalizeModelLimits(d.model_limits),
    modelLimitsEnabled: Boolean(d.model_limits_enabled),
    expiresAt: parseExpiry(d.expires_at),
    checkedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// ราคาต่อครั้งของแต่ละโมเดลจาก /api/pricing
// ---------------------------------------------------------------------------
let pricingCache = { map: null, fetchedAt: 0 };

export async function getPricing(force = false) {
  const ttl = config.linkapi.pricingTtlMs;
  if (!force && pricingCache.map && Date.now() - pricingCache.fetchedAt < ttl) return pricingCache.map;

  const data = await requestJson(`${config.linkapi.base}/api/pricing`);
  const list = (data && (data.data || data.models)) || [];
  const map = new Map();
  for (const m of list) {
    if (!m || !m.model_name) continue;
    const name = String(m.model_name);
    const quotaType = Number(m.quota_type) || 0;
    const declaredPrice = Number(m.model_price) || 0;
    const fixedPrice = parseFixedPrice(m.billing_expr);
    const modelPrice = quotaType === 1 && declaredPrice > 0 ? declaredPrice : fixedPrice;
    map.set(name, {
      name,
      quotaType: modelPrice > 0 ? 1 : quotaType,
      modelPrice,
      modelRatio: Number(m.model_ratio) || 0,
      completionRatio: Number(m.completion_ratio) || 0,
    });
  }
  pricingCache = { map, fetchedAt: Date.now() };
  return map;
}

export function pickPrice(model, pricing) {
  const overrides = config.linkapi.priceOverrides;
  if (overrides && overrides.size) {
    const overridePrice =
      overrides.get(model) ?? overrides.get(stripModelPrefix(model));
    if (overridePrice > 0) {
      return { name: model, quotaType: 1, modelPrice: overridePrice, modelRatio: 0, completionRatio: 0, overridden: true };
    }
  }

  const stripped = stripModelPrefix(model);
  const prefixMatch = /^\[([^\]]+)\]/.exec(model);
  if (prefixMatch) {
    if (prefixMatch[1] !== '次') return null;
    const exact = pricing.get(model);
    if (exact && exact.quotaType === 1 && exact.modelPrice > 0) return exact;
    return null;
  }

  const candidates = [];
  for (const info of pricing.values()) {
    if (
      info.quotaType === 1 &&
      info.modelPrice > 0 &&
      info.name.startsWith('[次]') &&
      stripModelPrefix(info.name) === stripped
    ) {
      candidates.push(info);
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.modelPrice - b.modelPrice);
  return candidates[0];
}

export function computeRemainingCounts(models, usage, pricing) {
  const qpu = config.linkapi.quotaPerUnit > 0 ? config.linkapi.quotaPerUnit : 500000;
  const rows = [];
  for (const model of models || []) {
    const info = pricing ? pickPrice(model, pricing) : null;
    if (!info) continue;
    const costRaw = Math.max(1, Math.round(info.modelPrice * qpu));
    const remaining = usage.unlimited ? null : Math.floor(Math.max(0, usage.availableRaw) / costRaw);
    rows.push({ model, matchedName: info.name, priceUsd: info.modelPrice, costRaw, remaining });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// จำนวนครั้งที่ใช้ไปจริงต่อโมเดล (นับจาก log ของคีย์)
// ---------------------------------------------------------------------------
export async function countUsagePerModel(apiKey) {
  const data = await requestJson(`${config.linkapi.base}/api/log/token`, {
    Authorization: `Bearer ${apiKey}`,
  });
  const items = Array.isArray(data) ? data : data?.data || [];
  const perModel = new Map();
  let total = 0;
  for (const entry of items) {
    if (!entry || !entry.model_name) continue;
    const model = stripModelPrefix(entry.model_name);
    perModel.set(model, (perModel.get(model) || 0) + 1);
    total += 1;
  }
  return { total, perModel };
}

// ---------------------------------------------------------------------------
// ข้อมูลบัญชีที่แอดมินล็อกอิน (ใช้ระบุชื่อ/อีเมลใน Excel)
// ---------------------------------------------------------------------------
let account = null;
let fetchedAt = 0;

export async function getAccountInfo(force = false) {
  const { accessToken, userId } = config.linkapi;
  if (!accessToken || !userId) return null;
  if (!force && account && Date.now() - fetchedAt < 15 * 60 * 1000) return account;

  try {
    const data = await requestJson(`${config.linkapi.base}/api/user/self`, {
      Authorization: `Bearer ${accessToken}`,
      'New-Api-User': userId,
    });
    const user = data && data.data ? data.data : data;
    account = user
      ? {
          username: user.username || '',
          email: user.email || '',
          displayName: user.display_name || user.username || '',
        }
      : null;
  } catch (err) {
    console.warn(`[linkapi] ดึงข้อมูลบัญชีไม่สำเร็จ: ${err.message}`);
    account = null;
  }
  fetchedAt = Date.now();
  return account;
}

function accountHeaders() {
  return {
    Authorization: `Bearer ${config.linkapi.accessToken}`,
    'New-Api-User': config.linkapi.userId,
  };
}

async function fetchTokenList() {
  const items = [];
  let page = 1;
  const pageSize = 100;
  for (let guard = 0; guard < 50; guard++) {
    const data = await requestJson(
      `${config.linkapi.base}/api/token/?p=${page}&page_size=${pageSize}`,
      accountHeaders(),
    );
    const pageItems = (data?.data?.items || []).filter((t) => t && t.id);
    items.push(...pageItems);
    const total = data?.data?.total ?? items.length;
    if (pageItems.length === 0 || items.length >= total) break;
    page += 1;
  }
  return items;
}

async function fetchTokenKeysByIds(ids) {
  const keys = {};
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const data = await requestJson(
      `${config.linkapi.base}/api/token/batch/keys`,
      accountHeaders(),
      { method: 'POST', body: { ids: chunk } },
    );
    Object.assign(keys, data?.data?.keys || {});
  }
  return keys;
}

let keyCache = { map: null, fetchedAt: 0 };

export async function loadAccountKeys(force = false) {
  const { accessToken, userId, keyCacheTtlMs } = config.linkapi;
  if (!accessToken || !userId) return { ok: false, reason: 'ยังไม่ได้ตั้งค่าบัญชี LinkAPI' };
  if (!force && keyCache.map && Date.now() - keyCache.fetchedAt < keyCacheTtlMs) {
    return { ok: true, map: keyCache.map };
  }

  try {
    const items = await fetchTokenList();
    const keysById = await fetchTokenKeysByIds(items.map((t) => t.id));
    const map = new Map();
    for (const t of items) {
      const full = keysById[String(t.id)];
      if (!full) continue;
      map.set(full, {
        id: t.id,
        name: t.name || '',
        unlimited: Boolean(t.unlimited_quota),
        remainQuota: t.remain_quota ?? 0,
        usedQuota: t.used_quota ?? 0,
        expiredTime: t.expired_time ?? -1,
        status: t.status ?? 1,
      });
    }
    keyCache = { map, fetchedAt: Date.now() };
    console.log(`[linkapi] โหลดคีย์ของบัญชีแล้ว ${map.size} คีย์`);
    return { ok: true, map };
  } catch (err) {
    console.warn(`[linkapi] โหลดรายชื่อคีย์ของบัญชีไม่สำเร็จ: ${err.message}`);
    keyCache = { map: null, fetchedAt: Date.now() };
    return { ok: false, reason: friendlyError(err) };
  }
}

export async function verifyKey(key, { force = false } = {}) {
  if (!config.linkapi.strictAccount) return { status: 'skip', token: null };
  if (!config.linkapi.accessToken || !config.linkapi.userId) {
    return { status: 'skip', token: null };
  }
  const res = await loadAccountKeys(force);
  if (!res.ok) return { status: 'unable', token: null, reason: res.reason };
  const token = res.map.get(key);
  if (token) return { status: 'owned', token };
  return { status: 'foreign', token: null };
}

export function friendlyError(err) {
  const message = err?.message || String(err || '');
  if (err?.status === 401 || /invalid token|authentication|unauthorized/i.test(message)) {
    return 'คีย์ไม่ถูกต้อง ถูกยกเลิก หรือหมดอายุ';
  }
  if (err?.status === 429) return 'คำขอถูกจำกัดความถี่ (rate limit) กรุณารอสักครู่แล้วลองใหม่';
  if (err?.name === 'TimeoutError' || /abort|timeout/i.test(message)) {
    return 'เช็คข้อมูลไม่ทันเวลา (timeout)';
  }
  return `เช็คไม่สำเร็จ: ${message || 'ไม่ทราบสาเหตุ'}`;
}
