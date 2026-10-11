if (!process.env.SHOP_DATA_DIR) {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  process.env.SHOP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'linkapi-test-'));
}

const { config } = await import('../src/config.js');
const linkapi = await import('../src/services/linkapi.js');
const keylog = await import('../src/services/keylog.js');
const { handleKeys, extractKeys } = await import('../src/handlers/keycheck.js');
const fs = await import('node:fs');

let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` -> ${extra}` : ''}`);
  if (!cond) failed++;
};

config.linkapi.quotaPerUnit = 500000;
config.linkapi.pricingTtlMs = 0;
config.linkapi.privateMode = 'off';
config.linkapi.channelIds = [];
config.linkapi.strictAccount = false;
config.linkapi.accessToken = '';
config.linkapi.userId = '';

const response = (status, body) => ({
  status,
  ok: status >= 200 && status < 400,
  text: async () => JSON.stringify(body),
});

const scenario = { auth: true };

globalThis.fetch = async (url) => {
  if (!scenario.auth) {
    return response(401, { error: { message: 'Invalid token', type: 'new_api_error' } });
  }
  if (url.includes('/api/pricing')) {
    return response(200, {
      success: true,
      data: [
        { model_name: '[次]gemini-3.1-pro-preview', quota_type: 1, model_price: 0.05, model_ratio: 0 },
        { model_name: '[SP]gemini-3.1-pro-preview', quota_type: 1, model_price: 0.015, model_ratio: 0 },
        { model_name: 'gemini-3.1-pro-preview', quota_type: 0, model_price: 0, model_ratio: 1 },
        { model_name: '[次]gemini-3.8-flash', quota_type: 1, model_price: 0.03, model_ratio: 0 },
        { model_name: '[SP]claude-opus-4-7', quota_type: 1, model_price: 0.1, model_ratio: 0 },
        { model_name: 'gemini-3.1-pro-preview-r', quota_type: 0, model_price: 0, model_ratio: 0.5 },
      ],
    });
  }
  if (url.includes('/api/usage/token/')) {
    return response(200, {
      success: true,
      data: {
        name: 'คีย์ทดสอบ',
        unlimited_quota: false,
        total_granted: 10000000,
        total_used: 3750000,
        total_available: 6250000,
        expires_at: 0,
        model_limits: { '[次]gemini-3.1-pro-preview': true, '[次]gemini-3.8-flash': true },
        model_limits_enabled: true,
      },
    });
  }
  if (url.includes('/api/log/token')) {
    return response(200, {
      success: true,
      data: [
        { model_name: '[次]gemini-3.1-pro-preview' },
        { model_name: '[次]gemini-3.1-pro-preview' },
        { model_name: '[次]gemini-3.8-flash' },
      ],
    });
  }
  return response(200, {});
};

check('extractKeys หาคีย์เจอ', extractKeys('แปะคีย์ sk-abc1234567890abcd ลงไป').length === 1);
check('extractKeys คีย์ซ้ำไม่นับซ้ำ', extractKeys('sk-a111111111111111 sk-a111111111111111').length === 1);
check('extractKeys ข้อความธรรมดา', extractKeys('สวัสดีครับ').length === 0);
check('maskKey', keylog.maskKey('sk-abc1234567890abcd') === 'sk-abc1234...abcd');

check('stripModelPrefix ตัด [次]', linkapi.stripModelPrefix('[次]gemini-3.1-pro-preview') === 'gemini-3.1-pro-preview');
check(
  'normalizeModelLimits จาก object',
  linkapi.normalizeModelLimits({ 'a-model': true, 'b-model': false }).join(',') === 'a-model',
);
check('normalizeModelLimits จาก array', linkapi.normalizeModelLimits(['x', 'y']).join(',') === 'x,y');
check('normalizeModelLimits จาก string', linkapi.normalizeModelLimits('m1, m2').join(',') === 'm1,m2');

const usage = await linkapi.getKeyUsage('sk-abc1234567890abcd');
check('getKeyUsage อ่านโควตา', usage.availableRaw === 6250000 && usage.totalUsedRaw === 3750000, JSON.stringify(usage.availableRaw));
check('getKeyUsage อ่านรายชื่อโมเดลลิมิต', usage.modelLimits.length === 2 && usage.modelLimitsEnabled === true);

const pricing = await linkapi.getPricing(true);
check('getPricing โหลดราคาโมเดล', pricing.size === 6, `${pricing.size}`);
check(
  'pickPrice เลือกแบบคิดราคาต่อครั้ง (exact)',
  linkapi.pickPrice('[次]gemini-3.1-pro-preview', pricing)?.modelPrice === 0.05,
);
check(
  'pickPrice ชื่อไม่มี prefix -> เลือกแบบ [次]',
  linkapi.pickPrice('gemini-3.1-pro-preview', pricing)?.name === '[次]gemini-3.1-pro-preview',
);
check('pickPrice ข้าม [SP] (เฉพาะ [次])', linkapi.pickPrice('[SP]gemini-3.1-pro-preview', pricing) === null);
check('pickPrice ข้าม [SP] ที่ไม่มี [次]', linkapi.pickPrice('[SP]claude-opus-4-7', pricing) === null);
check(
  'computeRemainingCounts ข้ามโมเดลที่ไม่มีราคา [次]',
  linkapi.computeRemainingCounts(['[SP]claude-opus-4-7'], usage, pricing).length === 0,
);

const counts = linkapi.computeRemainingCounts(usage.modelLimits, usage, pricing);
const byModel = Object.fromEntries(counts.map((c) => [c.model, c]));
check('เหลือ gemini-3.1-pro-preview = 6250000/25000', byModel['[次]gemini-3.1-pro-preview']?.remaining === 250);
check('เหลือ gemini-3.8-flash = 6250000/15000', byModel['[次]gemini-3.8-flash']?.remaining === 416);

check('ไม่มี per-call -> ไม่พบราคา', linkapi.pickPrice('gemini-3.1-pro-preview-r', pricing) === null);
config.linkapi.priceOverrides = new Map([['gemini-3.1-pro-preview-r', 0.05]]);
check(
  'override ราคาต่อครั้งเอง ได้ผล',
  linkapi.pickPrice('gemini-3.1-pro-preview-r', pricing)?.modelPrice === 0.05,
);
check(
  'override คำนวณเหลือข้อความได้',
  linkapi.computeRemainingCounts(['gemini-3.1-pro-preview-r'], usage, pricing)[0].remaining === 250,
);
config.linkapi.priceOverrides = new Map();

const usagePerModel = await linkapi.countUsagePerModel('sk-abc1234567890abcd');
check(
  'countUsagePerModel นับครั้งและตัด prefix',
  usagePerModel.total === 3 &&
    usagePerModel.perModel.get('gemini-3.1-pro-preview') === 2 &&
    usagePerModel.perModel.get('gemini-3.8-flash') === 1,
);

const sends = [];
function mockMessage(content, userId = '500') {
  return {
    author: {
      id: userId,
      bot: false,
      tag: 'buyer#0001',
      username: 'buyer',
      send: async () => {},
    },
    guild: { id: 'g1' },
    channel: { id: 'ch1', isThread: () => false, send: async (payload) => sends.push(payload) },
    content,
    deletable: false,
    delete: async () => {},
  };
}

scenario.auth = false;
const bad = mockMessage('คีย์นี้เลย sk-bad000000000000000000');
const handledBad = await handleKeys(bad);
check('เช็คคีย์ผิด ได้รับการตอบ', handledBad === true);
check('เช็คคีย์ผิด ส่ง embed ข้อผิดพลาด', sends.length === 1 && sends[0].embeds[0].data.title.includes('ไม่สำเร็จ'));

scenario.auth = true;
const okMsg = mockMessage('ลอง sk-abc1234567890abcd');
check('ส่งคีย์ปกติ ได้รับการตอบ', (await handleKeys(okMsg)) === true);
const okEmbed = sends.at(-1)?.embeds[0]?.data;
check('embed แสดงจำนวนข้อความคงเหลือ', okEmbed?.title?.includes('จำนวนข้อความคงเหลือ'), JSON.stringify(okEmbed?.title));
check('embed เหลือต่อโมเดลถูกต้อง', okEmbed?.description?.includes('เหลืออีก **250** ข้อความ'), okEmbed?.description);
check('embed แสดงจำนวนที่ใช้ไปจาก log', okEmbed?.description?.includes('ใช้ไป 2 ข้อความ'));
check('embed ไม่เปิดเผยราคา/ยอดเงิน', !okEmbed?.description?.includes('$') && !okEmbed?.description?.includes('ครั้ง'));

const plain = mockMessage('มีกาแฟขายไหม');
check('ข้อความธรรมดาไม่ถูกตอบ', (await handleKeys(plain)) === false);

config.linkapi.privateMode = 'off';
const excelFile = config.linkapi.excelPath;
await keylog.flush();
check('มีไฟล์ Excel เกิดขึ้น', fs.existsSync(excelFile), excelFile);
check('ไฟล์ Excel มีแถวข้อมูล', fs.existsSync(excelFile) && fs.statSync(excelFile).size > 500);

console.log(failed === 0 ? '\nผ่านทั้งหมด ✅' : `\nมี ${failed} รายการที่ไม่ผ่าน ❌`);
process.exit(failed === 0 ? 0 : 1);
