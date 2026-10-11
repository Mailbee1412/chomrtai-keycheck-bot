import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = process.env.SHOP_DATA_DIR
  ? path.resolve(process.env.SHOP_DATA_DIR)
  : path.join(ROOT_DIR, 'data');

export const config = {
  token: process.env.DISCORD_TOKEN || '',
  clientId: process.env.DISCORD_CLIENT_ID || '',
  guildId: process.env.DISCORD_GUILD_ID || '',

  shopName: process.env.SHOP_NAME || 'ร้านของฉัน',
  currency: process.env.SHOP_CURRENCY || 'THB',
  adminRoleIds: (process.env.SHOP_ADMIN_ROLE_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  logChannelId: process.env.SHOP_LOG_CHANNEL_ID || '',
  ticketCategoryId: process.env.SHOP_TICKET_CATEGORY_ID || '',
  shippingFee: Number(process.env.SHOP_SHIPPING_FEE) || 0,
  contact: process.env.SHOP_CONTACT || '',
  autoReply: process.env.SHOP_AUTO_REPLY === 'true',
  chatChannelIds: (process.env.SHOP_CHAT_CHANNEL_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  shopDescription: process.env.SHOP_DESCRIPTION || '',
  shopHours: process.env.SHOP_HOURS || '',
  shopPayment: process.env.SHOP_PAYMENT || '',
  shopShippingInfo: process.env.SHOP_SHIPPING_INFO || '',
  shopFaq: process.env.SHOP_FAQ || '',
  linkapiNote: process.env.SHOP_LINKAPI_NOTE || '',

  ai: {
    apiKey: process.env.AI_API_KEY || '',
    baseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
  },

  linkapi: {
    base: (process.env.LINKAPI_BASE || 'https://linkapi.ai').replace(/\/+$/, ''),
    unit: process.env.LINKAPI_QUOTA_UNIT || 'USD',
    quotaPerUnit: Number(process.env.LINKAPI_QUOTA_PER_UNIT) || 500000,
    lowAlert: Number(process.env.LINKAPI_LOW_ALERT) || 1,
    accessToken: (process.env.LINKAPI_ACCESS_TOKEN || '').trim(),
    userId: (process.env.LINKAPI_USER_ID || '').trim(),
    channelIds: (process.env.LINKAPI_CHANNEL_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    storeFullKey: process.env.LINKAPI_STORE_FULL_KEY === 'true',
    excelPath: process.env.LINKAPI_EXCEL_PATH
      ? path.resolve(process.env.LINKAPI_EXCEL_PATH)
      : path.join(DATA_DIR, 'linkapi-keys.xlsx'),
    checkDelayMs: Number(process.env.LINKAPI_CHECK_DELAY_MS) || 400,
    strictAccount: process.env.LINKAPI_STRICT_ACCOUNT === 'true',
    keyCacheTtlMs: Number(process.env.LINKAPI_KEY_CACHE_TTL_MS) || 30 * 60 * 1000,
    pricingTtlMs: Number(process.env.LINKAPI_PRICING_TTL_MS) || 30 * 60 * 1000,
    privateMode: (process.env.LINKAPI_PRIVATE_MODE || 'thread').trim().toLowerCase(),
    maxKeys: Number(process.env.LINKAPI_MAX_KEYS) || 10,
    modelLimits: parseModelLimits(process.env.LINKAPI_MODEL_LIMITS),
    priceOverrides: parsePriceOverrides(process.env.LINKAPI_PRICE_OVERRIDES),
  },
};

function parseModelLimits(raw) {
  if (!raw) return {};
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const norm = (n) => Math.floor(n);
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed)
          .map(([model, value]) => [model.trim(), norm(Number(value))])
          .filter(([, value]) => Number.isFinite(value) && value > 0),
      );
    }
  } catch {
    /* fall through to text format */
  }
  const limits = {};
  for (const pair of trimmed.split(/[,;]/)) {
    const [model, value] = pair.split('=');
    if (!model || value === undefined) continue;
    const num = norm(Number(value.trim()));
    if (Number.isFinite(num) && num > 0) limits[model.trim()] = num;
  }
  return limits;
}

function parsePriceOverrides(raw) {
  const out = new Map();
  if (!raw) return out;
  const trimmed = raw.trim();
  if (!trimmed) return out;
  const add = (model, value) => {
    const name = String(model).replace(/\[[^\]]+\]\s*/, '').trim();
    const num = Number(value);
    if (name && Number.isFinite(num) && num > 0) out.set(name, num);
  };
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed)) add(k, v);
      return out;
    }
  } catch {
    /* fall through to text format */
  }
  for (const pair of trimmed.split(/[,;]/)) {
    const [model, value] = pair.split('=');
    if (!model || value === undefined) continue;
    add(model, value);
  }
  return out;
}

export function hasAI() {
  return Boolean(config.ai.apiKey);
}

export function missingConfig() {
  const missing = [];
  if (!config.token) missing.push('DISCORD_TOKEN');
  if (!config.clientId) missing.push('DISCORD_CLIENT_ID');
  return missing;
}
