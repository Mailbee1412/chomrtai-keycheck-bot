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
    messageCheck: process.env.LINKAPI_MESSAGE_CHECK === 'true',
    maxKeys: Number(process.env.LINKAPI_MAX_KEYS) || 10,
    welcomeChannelId: (process.env.LINKAPI_WELCOME_CHANNEL_ID || '').trim(),
    modelLimits: parseModelLimits(process.env.LINKAPI_MODEL_LIMITS),
    priceOverrides: parsePriceOverrides(process.env.LINKAPI_PRICE_OVERRIDES),
  },

  supportForm: {
    formChannelId: (process.env.SUPPORT_FORM_CHANNEL_ID || '').trim(),
    targetChannelId: (process.env.SUPPORT_FORM_TARGET_CHANNEL_ID || '').trim(),
    targetType: (process.env.SUPPORT_FORM_TARGET_TYPE || 'text').trim().toLowerCase(),
    forumTagIds: (process.env.SUPPORT_FORM_FORUM_TAG_ID || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    buttonLabel: process.env.SUPPORT_FORM_BUTTON_LABEL || 'แจ้งปัญหา',
    dataPath: process.env.SUPPORT_FORM_DATA_PATH
      ? path.resolve(process.env.SUPPORT_FORM_DATA_PATH)
      : path.join(DATA_DIR, 'support-requests.json'),
    allowedRoleIds: (process.env.SUPPORT_FORM_ALLOWED_ROLE_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    notifyRoleIds: (process.env.SUPPORT_FORM_NOTIFY_ROLE_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    staffRoleIds: (process.env.SUPPORT_FORM_STAFF_ROLE_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  shop: {
    channelId: (process.env.SHOP_CHANNEL_ID || '').trim(),
    categoryId: (process.env.SHOP_CATEGORY_ID || '').trim(),
    orderLogChannelId: (process.env.SHOP_ORDER_LOG_CHANNEL_ID || '').trim(),
    timezone: (process.env.SHOP_TIMEZONE || 'Asia/Bangkok').trim(),
    dailySummaryTime: (process.env.SHOP_DAILY_SUMMARY_TIME || '23:59').trim(),
    currencySymbol: process.env.SHOP_CURRENCY_SYMBOL || '฿',
    qrImagePath: (process.env.SHOP_QR_IMAGE_PATH || '').trim(),
    slipVerifyProvider: (process.env.SHOP_SLIP_VERIFY_PROVIDER || 'easyslip').trim().toLowerCase(),
    slipVerifyKey: (process.env.SHOP_SLIP_VERIFY_KEY || '').trim(),
    slipVerifyBase: (process.env.SHOP_SLIP_VERIFY_BASE || '').trim(),
    slipVerifyModel: (process.env.SHOP_SLIP_VERIFY_MODEL || 'gemini-2.5-flash').trim(),
    slipMaxAgeHours: Number(process.env.SHOP_SLIP_MAX_AGE_HOURS || 24) || 0,
    staffRoleIds: (process.env.SHOP_STAFF_ROLE_IDS || process.env.SUPPORT_FORM_STAFF_ROLE_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    mentionStaff: (process.env.SHOP_MENTION_STAFF || 'true').trim().toLowerCase() !== 'false',
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
