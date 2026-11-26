if (!process.env.SHOP_DATA_DIR) {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  process.env.SHOP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-test-'));
}
process.env.DISCORD_TOKEN = 'test';
process.env.DISCORD_CLIENT_ID = 'test';
process.env.SHOP_GSHEET_WEBHOOK_URL = 'https://sheet.test/hook';
process.env.SHOP_GSHEET_SECRET = 's3cr3t';
process.env.SHOP_GSHEET_SHEET_URL = 'https://docs.google.com/spreadsheets/d/abc';
process.env.SHOP_GSHEET_LINK_DAY = 'https://docs.google.com/spreadsheets/d/abc#gid=1';
process.env.SHOP_ORDER_LOG_CHANNEL_ID = 'ch-log';
process.env.DOTENV_CONFIG_PATH = (await import('node:os')).tmpdir() + '/chomrtai-no-env';

const { config } = await import('../src/config.js');
const {
  isSheetEnabled,
  getSheetLink,
  buildSheetLinkField,
  buildSheetOrderRow,
  buildSheetSummary,
  buildSheetPayload,
  syncSummaryToSheet,
  __setFetch,
} = await import('../src/services/googleSheet.js');

let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` -> ${extra}` : ''}`);
  if (!cond) failed++;
};

const base = {
  transfer: { transRef: 'REF1', paidAt: '2026-11-10T12:00:00.000Z' },
  quantity: 100,
  unitPrice: 39,
  pricePer: 100,
  expected: 39,
  amount: 39,
  priceMatch: true,
  slipUrls: ['https://cdn.test/slip.png'],
};
const orders = [
  { ...base, roomId: 'r1', orderNo: 1, dayKey: '2026-11-10', productName: 'Margarita', createdAt: '2026-11-10T11:00:00.000Z' },
  { ...base, roomId: 'r2', orderNo: 2, dayKey: '2026-11-10', productName: 'Cosmo', amount: 79, expected: 158, priceMatch: false },
  { roomId: 'r3', orderNo: 3, dayKey: '2026-11-10', productName: 'Theme', amount: null, slipUrls: [] },
];

check('isSheetEnabled true เมื่อตั้ง webhook', isSheetEnabled() === true);
const origUrl = config.shop.gsheetWebhookUrl;
config.shop.gsheetWebhookUrl = '';
check('isSheetEnabled false เมื่อปล่อย webhook ว่าง', isSheetEnabled() === false);
const skipped = await syncSummaryToSheet({ period: 'day', label: 'x', orders });
check('syncSummaryToSheet ข้ามเมื่อไม่ได้ตั้งค่า', skipped.skipped === true && skipped.ok === false);
config.shop.gsheetWebhookUrl = origUrl;

const row = buildSheetOrderRow(orders[0]);
check('แถวออเดอร์: เลขที่ padded', row.orderNo === '0001');
check('แถวออเดอร์: ผลตรง', row.checkLabel === '✅ ตรง' && row.checkKey === 'ok');
check('แถวออเดอร์: รับเลขอ้างอิง/ลิงก์สลิป', row.transRef === 'REF1' && row.slipUrl === 'https://cdn.test/slip.png' && row.slipCount === 1);
check('แถวออเดอร์: ไม่มีสลิป', buildSheetOrderRow(orders[2]).checkKey === 'pending');

const summary = buildSheetSummary(orders);
check('สรุป: ยอดรวม/จำนวน', summary.total === 118 && summary.orderCount === 3);
check('สรุป: นับผลตรวจ', summary.ok === 1 && summary.mismatch === 1 && summary.pending === 1 && summary.noSlip === 1);
check('สรุป: แยกตามบริการ', summary.byService.length === 3);

const payload = buildSheetPayload({ period: 'week', label: '2026-11-09 ~ 2026-11-15', startKey: '2026-11-09', endKey: '2026-11-15', orders, now: new Date('2026-11-10T13:00:00.000Z') });
check('payload: ประเภท/ช่วง', payload.type === 'summary' && payload.period === 'week' && payload.endKey === '2026-11-15');
check('payload: เวลา ISO', payload.generatedAt === '2026-11-10T13:00:00.000Z');
check('payload: มีแถวออเดอร์ครบ', payload.orders.length === 3);
check('payload: ไม่ฝัง secret', payload.secret === undefined);

let captured = null;
__setFetch(async (url, opts) => {
  captured = { url, opts, body: JSON.parse(opts.body) };
  return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, orders: 3, updated: 1 }) };
});
const sent = await syncSummaryToSheet({ period: 'day', label: '2026-11-10', orders });
check('ส่งขึ้นชีตสำเร็จ', sent.ok === true && sent.written === 3);
check('POST ไป URL ที่ตั้ง', captured.url === 'https://sheet.test/hook' && captured.opts.method === 'POST');
check('แนบ secret ใน body', captured.body.secret === 's3cr3t');

__setFetch(async () => ({ ok: false, status: 500, text: async () => 'boom' }));
const httpFail = await syncSummaryToSheet({ period: 'day', label: 'x', orders });
check('HTTP 500 → ไม่ throw', httpFail.ok === false && httpFail.status === 500);

__setFetch(async () => { throw new Error('network down'); });
const netFail = await syncSummaryToSheet({ period: 'day', label: 'x', orders });
check('เน็ตหลุด → ไม่ throw', netFail.ok === false && /network down/.test(netFail.error));

check('ลิงก์รายวันใช้ override', getSheetLink('day') === 'https://docs.google.com/spreadsheets/d/abc#gid=1');
check('ลิงก์รายสัปดาห์ใช้ลิงก์หลัก', getSheetLink('week') === 'https://docs.google.com/spreadsheets/d/abc');
const field = buildSheetLinkField('month');
check('ฟิลด์ลิงก์ในEmbed', field.name.includes('Google Sheet') && field.value.includes('docs.google.com'));

// ทดสอบเส้นทางส่งจริง: โหมดชีตต้องไม่แนบไฟล์ / ถ้าไม่ตั้งชีตต้องแนบ Excel เหมือนเดิม
const handler = await import('../src/features/shop/handler.js');
const sentMessages = [];
const fakeClient = {
  channels: {
    fetch: async () => ({ send: async (p) => { sentMessages.push(p); return {}; } }),
  },
};
__setFetch(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true, orders: 3 }) }));
await handler.postDailySummary(fakeClient, '2026-11-10');
check('โหมดชีต: ไม่แนบ xlsx/csv ในแชท', sentMessages[0].files === undefined);
check(
  'โหมดชีต: การ์ดสรุปมีลิงก์ชีต',
  sentMessages[0].embeds[0].data.fields.some((f) => f.name.includes('Google Sheet')),
);
check('โหมดชีต: มีการ POST ขึ้นชีต', captured !== null);

sentMessages.length = 0;
config.shop.gsheetWebhookUrl = '';
await handler.postDailySummary(fakeClient, '2026-11-10');
check('โหมดสำรอง: ยังแนบไฟล์เมื่อไม่ตั้งชีต', Array.isArray(sentMessages[0].files) && sentMessages[0].files.length > 0);
config.shop.gsheetWebhookUrl = origUrl;

__setFetch(null);
console.log(`failed=${failed}`);
process.exit(failed ? 1 : 0);
