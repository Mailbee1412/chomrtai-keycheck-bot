import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (!process.env.SHOP_DATA_DIR) {
  process.env.SHOP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-test-'));
}
process.env.DISCORD_TOKEN = 'test';
process.env.DISCORD_CLIENT_ID = 'test';
process.env.SHOP_CHANNEL_ID = 'ch-shop';
process.env.SHOP_CATEGORY_ID = 'cat-shop';
process.env.SHOP_ORDER_LOG_CHANNEL_ID = 'ch-log';
process.env.SUPPORT_FORM_STAFF_ROLE_IDS = 'role-staff';
process.env.SHOP_STAFF_ROLE_IDS = '';
process.env.DOTENV_CONFIG_PATH = path.join(os.tmpdir(), 'chomrtai-no-env');

const calls = [];
const mkReply = (name) => async (p) => {
  calls.push([name, p]);
};

function shopChannel() {
  return {
    id: 'ch-shop',
    parentId: 'cat-shop',
    guild: { iconURL: () => 'https://cdn.example/icon.png' },
    isTextBased: () => true,
    isThread: () => false,
    send: async (p) => calls.push(['send', p]),
  };
}

function guild() {
  return {
    id: 'g1',
    roles: { everyone: { id: 'role-everyone' } },
    channels: {
      create: async (opts) => {
        calls.push(['channelCreate', opts]);
        return {
          id: 'ch-room',
          send: async (p) => calls.push(['roomSend', p]),
        };
      },
    },
  };
}

function client() {
  return {
    channels: {
      fetch: async (id) => {
        calls.push(['fetch', id]);
        if (id === 'ch-shop') return shopChannel();
        if (id === 'ch-log') return { id, send: async (p) => calls.push(['logSend', p]) };
        if (String(id).startsWith('ch-room')) return { id, delete: async (reason) => calls.push(['channelDelete', id, reason]) };
        return { id, isTextBased: () => true, send: async (p) => calls.push(['send', p]) };
      },
    },
    users: { fetch: async () => ({ id: 'u1', tag: 'tester#1' }) },
    user: { id: 'bot1' },
  };
}

function baseInteraction(customId) {
  return {
    isButton: () => false,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
    customId,
    user: { id: 'u1', username: 'tester', tag: 'tester#1' },
    member: { id: 'u1', roles: { cache: { some: () => false } }, permissions: { has: () => false } },
    reply: mkReply('reply'),
    update: mkReply('update'),
    deferUpdate: mkReply('deferUpdate'),
    deferReply: mkReply('deferReply'),
    editReply: mkReply('editReply'),
    client: client(),
    guild: guild(),
  };
}

function buttonInteraction(customId) {
  const i = baseInteraction(customId);
  i.isButton = () => true;
  return i;
}

function selectInteraction(customId, values) {
  const i = baseInteraction(customId);
  i.isStringSelectMenu = () => true;
  i.values = values;
  return i;
}

function closeInteraction() {
  const i = buttonInteraction('shop:close');
  i.channel = {
    id: 'ch-room',
    permissionOverwrites: {
      cache: new Map([
        ['role-everyone', { id: 'role-everyone', type: 0 }],
        ['u1', { id: 'u1', type: 1 }],
        ['role-staff', { id: 'role-staff', type: 0 }],
      ]),
    },
    delete: async (reason) => calls.push(['channelDelete', 'ch-room', reason]),
  };
  return i;
}

function slipButtonInteraction() {
  const i = buttonInteraction('shop:slip');
  i.showModal = async (m) => calls.push(['showModal', m]);
  return i;
}

let slipSeq = 0;
const slipUrl = (url) => url || `https://cdn.example/slip-${++slipSeq}.png`;

function slipSubmitInteraction(amount, quantity = '', roomId = 'ch-room', url = null) {
  const i = baseInteraction('shop:slipModal');
  i.isModalSubmit = () => true;
  i.fields = {
    getTextInputValue: (id) => (id === 'amount' ? amount : id === 'quantity' ? quantity : ''),
    getUploadedFiles: () => new Map([['s1', { url: slipUrl(url), name: 'slip.png' }]]),
  };
  i.channel = { id: roomId, send: async (p) => calls.push(['roomSlipSend', p]) };
  return i;
}

function slipSelectInteraction(quantityValue, amount, roomId = 'ch-room', url = null) {
  const i = baseInteraction('shop:slipModal');
  i.isModalSubmit = () => true;
  i.fields = {
    getStringSelectValues: (id) => (id === 'quantity' ? [String(quantityValue)] : []),
    getTextInputValue: (id) => (id === 'amount' ? amount : ''),
    getUploadedFiles: () => new Map([['s1', { url: slipUrl(url), name: 'slip.png' }]]),
  };
  i.channel = { id: roomId, send: async (p) => calls.push(['roomSlipSend', p]) };
  return i;
}

let failed = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${e ? ' -> ' + e : ''}`);
  if (!c) failed++;
};

const store = await import('../src/features/shop/store.js');
const { buildProductSelect, buildRoomButtons, buildSlipModal, buildPackageOptions } = await import('../src/features/shop/ui.js');
const { handleShopInteraction, postShopPanel, postDailySummary, msUntilNextDailyTime } = await import('../src/features/shop/handler.js');
const { buildServiceRoomContent, buildDailySummary } = await import('../src/features/shop/embeds.js');

// ---------- store ----------
store.ensureSeeded();
const products = store.listProducts({ onlyEnabled: true });
const topProducts = store.listTopProducts({ onlyEnabled: true });
check('มีบริการเริ่มต้น 10 รายการ (6 หลัก + 4 ย่อย)', products.length === 10, String(products.length));
check('มีบริการระดับบนสุด 6 รายการ', topProducts.length === 6, String(topProducts.length));
check('ดึงบริการด้วย id ได้', store.getProduct('api-key')?.name === '🔑 ◦ API Key', String(store.getProduct('api-key')?.name));
check('Api key เป็นกลุ่มที่มี 4 ตัวเลือกย่อย', store.getChildren('api-key').length === 4, String(store.getChildren('api-key').length));
check('ตัวเลือกย่อยอ้าง parent', ['api-key-long-island', 'api-key-margarita', 'api-key-angel-shot', 'api-key-cosmo'].every((id) => store.getProduct(id)?.parent === 'api-key'));
check('มีบริการครบตามหมวด', ['theme', 'nitro-boost', 'commission-bot', 'vertex-email', 'inquiry'].every((id) => store.getProduct(id)));
check('มีตัวเลือกสอบถามเพิ่มเติม', store.getProduct('inquiry')?.name === '💬 ◦ สอบถามเพิ่มเติม', String(store.getProduct('inquiry')?.name));

// ---------- ui ----------
const sel = buildProductSelect(topProducts).toJSON();
check('เมนูเลือกบริการอยู่ใน action row', sel.type === 1 && sel.components?.[0]?.type === 3, JSON.stringify(sel.type));
check('เมนูหลักมี 6 ตัวเลือก', (sel.components[0].options?.length || 0) === 6, String(sel.components[0].options?.length));
check('option อ้าง product id', sel.components[0].options[0].value === 'api-key');
check('option ไม่บอกราคา', sel.components[0].options[0].description === undefined, String(sel.components[0].options[0].description));
const subSel = buildProductSelect(store.getChildren('api-key'), 'เลือกประเภท').toJSON();
check('เมนูย่อย Api key มี 4 ตัวเลือก', (subSel.components[0].options?.length || 0) === 4, String(subSel.components[0].options?.length));
const firstLabel = String(sel.components[0].options[0].label);
check('ชื่อบริการใช้จุด ◦ คั่น (ไม่มีจุดนำหน้า)', firstLabel.includes(' ◦ ') && !firstLabel.startsWith('◦ '), firstLabel);
check('ข้อย่อยบริการใช้จุด ◦ เช่นกัน', String(subSel.components[0].options[0].label).includes(' ◦ '), String(subSel.components[0].options[0].label));

// ---------- ฟอร์มแนบสลิป: เมนูเลือกแพ็ก ----------
const pkgs = buildPackageOptions(store.getProduct('api-key-margarita'));
check('แพ็กสินค้าคีย์ 5 ระดับ (100–500 ข้อความ)', pkgs.length === 5 && pkgs[0].qty === 100 && pkgs[4].qty === 500, JSON.stringify(pkgs));
check('แพ็กราคาตรงเรต (39/100 → 39…195)', pkgs[0].price === 39 && pkgs[4].price === 195, JSON.stringify(pkgs.map((p) => p.price)));
check('ป้ายแพ็กบอกจำนวน+ราคา', pkgs[2].label.includes('300 ข้อความ') && pkgs[2].label.includes('117 ฿'), pkgs[2].label);
const slipModalJson = JSON.stringify(buildSlipModal(store.getProduct('api-key-margarita')).toJSON().components);
check('บริการมีเรต → ฟอร์มมีเมนูเลือกจำนวน', slipModalJson.includes('เลือกจำนวนที่ซื้อ') && slipModalJson.includes('quantity'), slipModalJson.slice(0, 120));
check('ฟอร์มแนบสลิปไม่มีช่องจำนวนเงิน', !slipModalJson.includes('จำนวนเงิน') && !slipModalJson.includes('amount'), slipModalJson.slice(0, 120));
const plainModalJson = JSON.stringify(buildSlipModal(store.getProduct('theme')).toJSON().components);
check('บริการไม่มีเรต → ฟอร์มใช้ช่องกรอกจำนวน', !plainModalJson.includes('เลือกจำนวนที่ซื้อ') && plainModalJson.includes('quantity') && !plainModalJson.includes('จำนวนเงิน'), plainModalJson.slice(0, 120));
check('บริการไม่มีเรต → ไม่มีแพ็ก', buildPackageOptions(store.getProduct('theme')).length === 0);

// ---------- panel (embed การ์ดสี + โลโก้เซิร์ฟเวอร์, ไม่มีปุ่มเปิด/ปิดร้าน) ----------
calls.length = 0;
await postShopPanel(client());
const panel = calls.find((c) => c[0] === 'send');
check('โพสต์แผงร้านค้า', Boolean(panel), JSON.stringify(calls.map((c) => c[0])));
const panelEmbed = panel?.[1]?.embeds?.[0]?.toJSON?.() || {};
const panelDesc = panelEmbed.description || '';
check('แผงเป็นการ์ด embed', Boolean(panel?.[1]?.embeds?.length), JSON.stringify(Object.keys(panel?.[1] || {})));
check('การ์ดมีสี', typeof panelEmbed.color === 'number', String(panelEmbed.color));
check('การ์ดมีโลโก้เซิร์ฟเวอร์', Boolean(panelEmbed.thumbnail?.url), String(panelEmbed.thumbnail?.url));
check('การ์ดโชว์บริการหลัก (API Key)', panelDesc.includes('API Key') && panelDesc.includes('Theme') && panelDesc.includes('สอบถามเพิ่มเติม'), panelDesc.slice(0, 60));
check('การ์ดไม่โชว์ตัวเลือกย่อย', !panelDesc.includes('Long Island'), panelDesc.slice(0, 80));
check('การ์ดโชว์ชื่อบริการแบบมีจุด ◦ คั่น', panelDesc.includes('🔑 ◦ API Key') && panelDesc.includes('💬 ◦ สอบถามเพิ่มเติม'), panelDesc.slice(0, 120));
check('การ์ดไม่บอกราคา', !panelDesc.includes('฿'));
const panelComp = JSON.stringify(panel?.[1]?.components || []);
check('แผงมีเมนูเลือกบริการบนแผงเลย', panelComp.includes('shop:product'));
check('แผงไม่มีปุ่มเปิดร้าน', !panelComp.includes('shop:open'));
check('แผงไม่มีปุ่มปิดร้าน', !panelComp.includes('shop:closeShop'));

// ---------- เลือก Api key → ขึ้นเมนูย่อย ----------
calls.length = 0;
check('กด Api key สำเร็จ', (await handleShopInteraction(selectInteraction('shop:product', ['api-key']))) === true);
const subReply = calls.find((c) => c[0] === 'reply');
check('ขึ้นเมนูย่อยแบบ ephemeral', Boolean(subReply) && subReply[1].flags === 64, JSON.stringify(calls.map((c) => c[0])));
const subComp = JSON.stringify(subReply?.[1]?.components || []);
check('เมนูย่อยมี 4 ตัวเลือก', subComp.includes('api-key-long-island') && subComp.includes('api-key-cosmo'), subComp.slice(0, 80));
check('กด Api key ไม่สร้างห้องทันที', !calls.some((c) => c[0] === 'channelCreate'));

// ---------- เลือกประเภทย่อย → สร้างห้อง ----------
calls.length = 0;
check('เลือกประเภทย่อย สำเร็จ', (await handleShopInteraction(selectInteraction('shop:product', ['api-key-long-island']))) === true);
check('เลือกบริการไม่ทับแผง (ไม่ update)', !calls.some((c) => c[0] === 'update'), JSON.stringify(calls.map((c) => c[0])));
const roomCreate = calls.find((c) => c[0] === 'channelCreate');
check('สร้างช่องออเดอร์ส่วนตัว', Boolean(roomCreate) && roomCreate[1].type === 0, JSON.stringify(roomCreate?.[1]?.type));
check('ช่องออเดอร์อยู่ในหมวดที่กำหนด', roomCreate?.[1]?.parent === 'cat-shop', String(roomCreate?.[1]?.parent));
const overwrites = roomCreate?.[1]?.permissionOverwrites || [];
const everyoneOw = overwrites.find((o) => o.id === 'role-everyone');
const buyerOw = overwrites.find((o) => o.id === 'u1');
const staffOw = overwrites.find((o) => o.id === 'role-staff');
check('ห้ามทุกคนมองเห็น', Boolean(everyoneOw) && everyoneOw.deny.length > 0);
check('อนุญาตผู้ซื้อเห็น', Boolean(buyerOw) && buyerOw.allow.length > 0);
check('อนุญาตทีมงานเห็น', Boolean(staffOw) && staffOw.allow.length > 0);
const roomSend = calls.find((c) => c[0] === 'roomSend');
const roomContent = roomSend?.[1]?.content || '';
check('โพสต์รายละเอียดในห้อง', roomContent.includes('Long Island') && roomContent.includes('วิธีชำระเงิน'), roomContent.slice(0, 80));
check('โพสต์มีคำอธิบายเฉพาะบริการ', roomContent.includes('คีย์ API โมเดล Gemini Pro / Flash'));
check('โพสต์แนะนำให้แนบสลิป', roomContent.includes('แนบสลิป'));
check('โพสต์บอกราคาเป็นชุดแพ็ก (ไม่มีบรรทัดเรต)', roomContent.includes('✦ ราคา') && roomContent.includes('500 ข้อความ : 245 ฿') && !roomContent.includes('/ 100 ข้อความ'), roomContent.slice(0, 90));
check('โพสต์แท็กทีมงาน', roomContent.includes('<@&role-staff>'));
const roomBtn = JSON.stringify(roomSend?.[1]?.components || []);
check('ห้องมีปุ่มปิดห้อง', roomBtn.includes('shop:close') && roomBtn.includes('ปิดห้อง'));
check('ห้องมีปุ่มแนบสลิป', roomBtn.includes('shop:slip') && roomBtn.includes('แนบสลิป'));
check('ตอบกลับพร้อมลิงก์ห้อง', calls.some((c) => c[0] === 'editReply' && /<#ch-room>/.test(JSON.stringify(c[1]))));
const recorded = store.listOrders({ openOnly: true });
check('บันทึกออเดอร์ในห้อง', recorded.length === 1 && recorded[0].roomId === 'ch-room', JSON.stringify(recorded));
check('ออเดอร์มีชื่อบริการ', recorded[0]?.productName === '🥃 ◦ Long Island [ Gemini Pro / Flash ]');
check('ออเดอร์เริ่มต้นยังไม่มียอด', recorded[0]?.amount === null);

// ---------- แนบสลิป ----------
calls.length = 0;
check('กดปุ่มแนบสลิป สำเร็จ', (await handleShopInteraction(slipButtonInteraction())) === true);
check('เปิดฟอร์มแนบสลิป', calls.some((c) => c[0] === 'showModal'));

calls.length = 0;
check('ส่งสลิป สำเร็จ', (await handleShopInteraction(slipSubmitInteraction('350'))) === true);
const slipPost = calls.find((c) => c[0] === 'roomSlipSend');
check('โพสต์สลิปในห้อง', Boolean(slipPost), JSON.stringify(calls.map((c) => c[0])));
check('ข้อความสลิปมียอด', /350/.test(slipPost?.[1]?.content || ''));
check('แนบไฟล์สลิป', (slipPost?.[1]?.files?.length || 0) === 1);
check('บันทึกยอดจากสลิปในออเดอร์', store.getOrder('ch-room')?.amount === 350, JSON.stringify(store.getOrder('ch-room')));

calls.length = 0;
await handleShopInteraction(selectInteraction('shop:product', ['not-exist']));
check('บริการที่ไม่มีจริงถูกปฏิเสธ', calls.some((c) => c[0] === 'reply' && /ไม่พบบริการ/.test(JSON.stringify(c[1]))));

// ---------- close room ----------
calls.length = 0;
check('กดปุ่มปิดห้อง สำเร็จ', (await handleShopInteraction(closeInteraction())) === true);
const closeLog = calls.find((c) => c[0] === 'logSend');
const closeLogContent = closeLog?.[1]?.content || '';
check('แจ้งยอดไปช่อง log ตอนปิดห้อง', Boolean(closeLog) && /ปิดออเดอร์/.test(closeLogContent), JSON.stringify(calls.map((c) => c[0])));
check('แจ้งยอดจากสลิปครบ (ผู้ซื้อ/บริการ/ยอด/คนปิด)', closeLogContent.includes('<@u1>') && closeLogContent.includes('Long Island') && closeLogContent.includes('350') && closeLogContent.includes('ปิดโดย'));
check('ลบห้องเมื่อปิด', calls.some((c) => c[0] === 'channelDelete' && c[1] === 'ch-room'), JSON.stringify(calls.map((c) => c[0])));
check('แจ้งผลปิดห้อง', calls.some((c) => c[0] === 'editReply' && /ปิดห้อง/.test(JSON.stringify(c[1]))));
check('มาร์กออเดอร์ว่าปิดแล้ว', store.listOrders({ openOnly: true }).length === 0);

// ---------- embeds ----------
const content = buildServiceRoomContent(store.getProduct('theme'), { id: 'u1' });
check('ข้อความห้องไม่มีราคา', !content.includes('ราคา') && !content.includes('฿'));
check('ข้อความห้องมีคำอธิบาย', content.includes('Theme'));
check('ข้อความห้องไม่เกิน 2000 ตัว', content.length <= 2000, String(content.length));

// ---------- ห้องสอบถามเพิ่มเติม ----------
const inquiry = store.getProduct('inquiry');
const inquiryContent = buildServiceRoomContent(inquiry, { id: 'u1' });
check('ห้องสอบถามไม่มีวิธีชำระเงิน', !inquiryContent.includes('วิธีชำระเงิน') && !inquiryContent.includes('แนบสลิป'), inquiryContent.slice(0, 60));
check('ห้องสอบถามมีหัวข้อสอบถาม', inquiryContent.includes('สอบถาม'));
check('ห้องสอบถามมีรายละเอียด', inquiryContent.includes(inquiry.description));
const inquiryBtns = JSON.stringify(buildRoomButtons({ withSlip: false }).toJSON());
check('ปุ่มห้องสอบถามไม่มีแนบสลิป', !inquiryBtns.includes('shop:slip'), inquiryBtns);
check('ปุ่มห้องสอบถามมีปิดห้อง', inquiryBtns.includes('shop:close'));
const orderBtns = JSON.stringify(buildRoomButtons().toJSON());
check('ปุ่มห้องออเดอร์มีแนบสลิป+ปิดห้อง', orderBtns.includes('shop:slip') && orderBtns.includes('shop:close'));

// ---------- สรุปยอดรายได้รายวัน ----------
const daily = buildDailySummary({
  dayKey: '2026-10-14',
  orders: [
    { userId: 'u1', productName: '🥃 ◦ Long Island', amount: 100 },
    { userId: 'u2', productName: '🎨 ◦ Theme', amount: 250 },
    { userId: 'u3', productName: '🎨 ◦ Theme', amount: null },
  ],
});
check('สรุปรายวันมีวันที่', daily.includes('2026-10-14'), daily.slice(0, 60));
check('สรุปรายวันนับจำนวนออเดอร์', /3/.test(daily), daily.slice(0, 80));
check('สรุปรายวันรวมยอดจากสลิป (350)', daily.includes('350'), daily.slice(0, 120));
check('สรุปรายวันนับที่ยังไม่แนบสลิป', daily.includes('ยังไม่แนบสลิป'), '');
check('สรุปรายวันแยกตามบริการ', daily.includes('Theme × 2'), daily.slice(0, 200));
check('สรุปรายวันมีรายชื่อผู้ซื้อ', daily.includes('<@u1>') && daily.includes('<@u3>'), '');
check('สรุปรายวันไม่เกิน 2000 ตัว', daily.length <= 2000, String(daily.length));
check('สรุปรายวันไม่บอกว่าไม่มีออเดอร์', !buildDailySummary({ dayKey: '2026-10-14', orders: [] }).includes('350'));

const dA = msUntilNextDailyTime('23:59', 'Asia/Bangkok', new Date('2026-10-14T10:00:00Z'));
check('คำนวณเวลาสรุปถัดไป ~6ชม59น', dA > 6 * 3600000 && dA < 7 * 3600000, String(dA));
const dB = msUntilNextDailyTime('23:59', 'Asia/Bangkok', new Date('2026-10-14T18:00:00Z'));
check('เลยเวลาแล้วเลื่อนเป็นวันถัดไป', dB > 22 * 3600000 && dB < 23 * 3600000, String(dB));

calls.length = 0;
check('ส่งสรุปเข้าช่องแจ้งเตือนออเดอร์สำเร็จ', (await postDailySummary(client(), '2026-10-14')) === true);
check('สรุปถูกส่งไปที่ช่อง log', calls.some((c) => c[0] === 'fetch' && c[1] === 'ch-log') && calls.some((c) => c[0] === 'logSend'), JSON.stringify(calls.map((c) => c[0])));

// ---------- อ่านสลิปอัตโนมัติ (mock ผู้ให้บริการ) ----------
const { config } = await import('../src/config.js');
const slip = await import('../src/features/shop/slip.js');
check('ปิดอ่านสลิปเมื่อไม่มีคีย์', slip.isSlipVerifyEnabled() === false);

const easySlipMock = (payload) =>
  slip.__setFetch(async (url) => {
    if (String(url).includes('easyslip')) return { json: async () => payload };
    return { arrayBuffer: async () => new TextEncoder().encode(String(url)).buffer, headers: { get: () => 'image/png' } };
  });

config.shop.slipVerifyProvider = 'easyslip';
config.shop.slipVerifyKey = 'test-key';
easySlipMock({
  success: true,
  data: {
    amountInSlip: 500,
    isDuplicate: false,
    rawSlip: {
      transRef: 'REF-XYZ',
      date: '2026-10-15T10:00:00+07:00',
      amount: { amount: 500 },
      sender: { bank: { short: 'KBANK' }, account: { name: { th: 'นายทดสอบ ใจดี' } } },
      receiver: { bank: { short: 'SCB' }, account: { name: { th: 'ร้านสมฤทัย' } } },
    },
  },
});
calls.length = 0;
check('ส่งสลิปแบบเว้นยอด (ให้บอทอ่าน)', (await handleShopInteraction(slipSubmitInteraction(''))) === true);
const autoPost = calls.find((c) => c[0] === 'roomSlipSend');
const autoContent = autoPost?.[1]?.content || '';
check('อ่านยอดจากสลิปอัตโนมัติ (500)', store.getOrder('ch-room')?.amount === 500, String(store.getOrder('ch-room')?.amount));
check('โพสต์ข้อมูลการโอน (ธนาคารต้นทาง→ปลายทาง)', autoContent.includes('KBANK') && autoContent.includes('SCB'), autoContent.slice(0, 160));
check('โพสต์ข้อมูลผู้โอน', autoContent.includes('นายทดสอบ ใจดี'));
check('โพสต์เลขอ้างอิง', autoContent.includes('REF-XYZ'));
check('บันทึกข้อมูลโอนในออเดอร์', store.getOrder('ch-room')?.transfer?.transRef === 'REF-XYZ');
check('ยืนยันอ่านสลิปสำเร็จ', calls.some((c) => c[0] === 'editReply' && /อ่านสลิปสำเร็จ/.test(JSON.stringify(c[1]))));

easySlipMock({ success: false, error: { message: 'slip not found' } });
calls.length = 0;
await handleShopInteraction(slipSubmitInteraction('123'));
check('อ่านสลิปพังแล้วใช้ยอดที่กรอกเอง (123)', store.getOrder('ch-room')?.amount === 123, String(store.getOrder('ch-room')?.amount));
check('แจ้งเตือนเมื่ออ่านสลิปไม่ได้', calls.some((c) => c[0] === 'editReply' && /อ่านสลิปไม่ได้/.test(JSON.stringify(c[1]))));

// ---------- อ่านสลิปด้วย Gemini ----------
const geminiMock = (payload) =>
  slip.__setFetch(async (url) => {
    if (String(url).includes('generativelanguage')) return { json: async () => payload };
    return { arrayBuffer: async () => new TextEncoder().encode(String(url)).buffer, headers: { get: () => 'image/png' } };
  });

config.shop.slipVerifyProvider = 'gemini';
config.shop.slipVerifyKey = 'gemini-key';
geminiMock({
  candidates: [
    {
      content: {
        parts: [
          {
            text: '{"isSlip":true,"amount":750,"transRef":"GX-999","paidAt":"2026-10-15T11:00:00+07:00","sendingBank":"KBank","receivingBank":"SCB","senderName":"สมชาย ใจดี","receiverName":"ร้านสมฤทัย"}',
          },
        ],
      },
    },
  ],
});
calls.length = 0;
await handleShopInteraction(slipSubmitInteraction(''));
check('Gemini อ่านยอดสลิปอัตโนมัติ (750)', store.getOrder('ch-room')?.amount === 750, String(store.getOrder('ch-room')?.amount));
check('Gemini อ่านเลขอ้างอิง', store.getOrder('ch-room')?.transfer?.transRef === 'GX-999');
check('Gemini บันทึกข้อมูลการโอน', store.getOrder('ch-room')?.transfer?.sendingBank === 'KBank');
check('Gemini ยืนยันอ่านสลิปสำเร็จ', calls.some((c) => c[0] === 'editReply' && /อ่านสลิปสำเร็จ/.test(JSON.stringify(c[1]))));

geminiMock({ candidates: [{ content: { parts: [{ text: '```json\n{"isSlip":true,"amount":222,"transRef":"GF-1"}\n```' }] } }] });
calls.length = 0;
await handleShopInteraction(slipSubmitInteraction(''));
check('Gemini อ่าน JSON ที่ครอบ code fence ได้ (222)', store.getOrder('ch-room')?.amount === 222, String(store.getOrder('ch-room')?.amount));

geminiMock({ candidates: [{ content: { parts: [{ text: '{"isSlip":false}' }] } }] });
calls.length = 0;
await handleShopInteraction(slipSubmitInteraction('99'));
check('Gemini บอกไม่ใช่สลิป → ใช้ยอดที่กรอก (99)', store.getOrder('ch-room')?.amount === 99, String(store.getOrder('ch-room')?.amount));
check('แจ้งเตือนรูปไม่ใช่สลิป', calls.some((c) => c[0] === 'editReply' && /ไม่ใช่สลิป/.test(JSON.stringify(c[1]))));

config.shop.slipVerifyKey = '';
slip.__setFetch(null);

// ---------- แนบรูป QR ร้านในห้องออเดอร์ ----------
const qrTmp = path.join(os.tmpdir(), 'shop-qr-test.png');
fs.writeFileSync(qrTmp, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
config.shop.qrImagePath = qrTmp;
calls.length = 0;
await handleShopInteraction(selectInteraction('shop:product', ['theme']));
const qrSend = calls.find((c) => c[0] === 'roomSend');
check('ห้องออเดอร์แนบรูป QR ร้าน', (qrSend?.[1]?.files?.length || 0) === 1, JSON.stringify(calls.map((c) => c[0])));
check('ข้อความห้องบอกให้สแกน QR', /สแกน QR/.test(qrSend?.[1]?.content || ''), (qrSend?.[1]?.content || '').slice(0, 120));
calls.length = 0;
await handleShopInteraction(selectInteraction('shop:product', ['inquiry']));
const inqSend = calls.find((c) => c[0] === 'roomSend');
check('ห้องสอบถามไม่แนบ QR', (inqSend?.[1]?.files?.length || 0) === 0);
config.shop.qrImagePath = '';

// ---------- ราคาต่อหน่วย (ตั้งผ่าน Discord) + เทียบยอดสลิป ----------
const { handlePriceCommand, priceCommandJSON, PRICE_COMMAND_NAME } = await import('../src/features/shop/priceCommand.js');

check('คำสั่งตั้งราคาถูกสร้างจากสินค้า', priceCommandJSON()?.name === PRICE_COMMAND_NAME, String(priceCommandJSON()?.name));

function priceInteraction({ staff = false, product = null, price = null } = {}) {
  return {
    isChatInputCommand: () => true,
    commandName: PRICE_COMMAND_NAME,
    member: {
      roles: { cache: { some: () => staff } },
      permissions: { has: () => false },
    },
    options: { getString: () => product, getNumber: () => price },
    reply: mkReply('reply'),
  };
}

calls.length = 0;
await handlePriceCommand(priceInteraction({ staff: false }));
check('ตั้งราคา: ไม่ใช่ทีมงาน ถูกปฏิเสธ', calls.some((c) => c[0] === 'reply' && /ทีมงาน/.test(JSON.stringify(c[1]))));

calls.length = 0;
await handlePriceCommand(priceInteraction({ staff: true, product: 'api-key-long-island', price: 40 }));
check('ตั้งราคา: ทีมงานตั้งราคาต่อหน่วยได้', store.getProduct('api-key-long-island')?.price === 40);
check('ตั้งราคา: ตอบแบบ ephemeral', calls.some((c) => c[0] === 'reply' && c[1]?.flags === 64));

calls.length = 0;
await handlePriceCommand(priceInteraction({ staff: true }));
check('ตั้งราคา: ไม่ใส่อะไร = ดูราคาทั้งหมด', calls.some((c) => c[0] === 'reply' && /ราคาบริการ/.test(JSON.stringify(c[1]))));

// ---------- เทียบยอดสลิปกับ (ราคา ÷ ต่อกี่หน่วย × จำนวน) ----------
store.addOrder({
  roomId: 'ch-price',
  userId: 'u1',
  userName: 'tester',
  productId: 'api-key-long-island',
  productName: '🥃 ◦ Long Island [ Gemini Pro / Flash ]',
  unitPrice: 40,
  pricePer: 1,
  amount: null,
  slipUrls: [],
  dayKey: store.dayKey(),
  createdAt: new Date().toISOString(),
  closedAt: null,
});

calls.length = 0;
await handleShopInteraction(slipSubmitInteraction('120', '3', 'ch-price'));
const okPriceOrder = store.getOrder('ch-price');
check('ยอดตรง: เก็บราคา/จำนวน/ยอดที่ควรได้', okPriceOrder?.unitPrice === 40 && okPriceOrder?.quantity === 3 && okPriceOrder?.expected === 120, JSON.stringify({ unitPrice: okPriceOrder?.unitPrice, quantity: okPriceOrder?.quantity, expected: okPriceOrder?.expected }));
check('ยอดตรง: ทำเครื่องหมายตรง', okPriceOrder?.priceMatch === true, String(okPriceOrder?.priceMatch));
check('ยอดตรง: ตอบผู้ซื้อว่ายอดตรง', calls.some((c) => c[0] === 'editReply' && /ยอดตรงกับราคา/.test(JSON.stringify(c[1]))));
check('ยอดตรง: ไม่แจ้งทีมงาน', !calls.some((c) => c[0] === 'logSend'), JSON.stringify(calls.map((c) => c[0])));

calls.length = 0;
await handleShopInteraction(slipSubmitInteraction('100', '3', 'ch-price'));
const badPriceOrder = store.getOrder('ch-price');
check('ยอดไม่ตรง: ทำเครื่องหมายไม่ตรง', badPriceOrder?.priceMatch === false, String(badPriceOrder?.priceMatch));
check('ยอดไม่ตรง: แจ้งทีมงานเข้าช่อง log', calls.some((c) => c[0] === 'logSend'), JSON.stringify(calls.map((c) => c[0])));
const mismatchNotice = calls.find((c) => c[0] === 'logSend')?.[1]?.content || '';
check('ยอดไม่ตรง: แจ้งยอดที่ควรได้ 120', mismatchNotice.includes('120'), mismatchNotice.slice(0, 120));
check('ยอดไม่ตรง: แจ้งยอดจากสลิป 100', mismatchNotice.includes('100'));
check('ยอดไม่ตรง: ไม่เตือนผู้ซื้อ', !calls.some((c) => c[0] === 'editReply' && /ยอดไม่ตรง/.test(JSON.stringify(c[1]))));

calls.length = 0;
await handleShopInteraction(slipSubmitInteraction('999', '', 'ch-price'));
check('ไม่ใส่จำนวน = 1 หน่วย (999 != 40)', store.getOrder('ch-price')?.quantity === 1 && store.getOrder('ch-price')?.priceMatch === false);

calls.length = 0;
await handleShopInteraction(slipSubmitInteraction('50', '1', 'ch-unknown-room'));
check('ห้องไม่มีออเดอร์ → ไม่เทียบราคา (ไม่แจ้ง log)', !calls.some((c) => c[0] === 'logSend'));

// ---------- ราคาแบบเรต/100 ข้อความ (สินค้าคีย์จริง) ----------
store.addOrder({
  roomId: 'ch-per',
  userId: 'u1',
  userName: 'tester',
  productId: 'api-key-margarita',
  productName: '🍹 ◦ Margarita [ Gemini Flash ล้วน ]',
  unitPrice: 39,
  pricePer: 100,
  amount: null,
  slipUrls: [],
  dayKey: store.dayKey(),
  createdAt: new Date().toISOString(),
  closedAt: null,
});

calls.length = 0;
await handleShopInteraction(slipSubmitInteraction('117', '300', 'ch-per'));
const perOrder = store.getOrder('ch-per');
check('เรต/100: 300 ข้อความ × 39 = 117 ตรง', perOrder?.expected === 117 && perOrder?.priceMatch === true, JSON.stringify({ expected: perOrder?.expected, priceMatch: perOrder?.priceMatch }));

calls.length = 0;
await handleShopInteraction(slipSubmitInteraction('195', '5', 'ch-per'));
check('เรต/100: ผู้ซื้อกรอก 5 (ไม่ใช่ 500) → ไม่ตรง แจ้งทีมงาน', store.getOrder('ch-per')?.priceMatch === false && calls.some((c) => c[0] === 'logSend'));
const perNotice = calls.find((c) => c[0] === 'logSend')?.[1]?.content || '';
check('เรต/100: แจ้งเตือนบอกเรต / 100 ข้อความ', perNotice.includes('/ 100 ข้อความ'), perNotice.slice(0, 200));

calls.length = 0;
await handleShopInteraction(slipSelectInteraction('400', '156', 'ch-per'));
check('เลือกแพ็กจากเมนู: 400 ข้อความ ของ 39฿ = 156 ตรง', store.getOrder('ch-per')?.quantity === 400 && store.getOrder('ch-per')?.expected === 156 && store.getOrder('ch-per')?.priceMatch === true, JSON.stringify({ qty: store.getOrder('ch-per')?.quantity, expected: store.getOrder('ch-per')?.expected }));

// ---------- กันสลิปซ้ำ (transRef) ----------
config.shop.slipVerifyKey = 'gemini-key';
config.shop.slipVerifyProvider = 'gemini';
geminiMock({
  candidates: [
    {
      content: {
        parts: [
          { text: '{"isSlip":true,"amount":39,"transRef":"DUP-X1","paidAt":"2026-10-17T12:00:00+07:00"}' },
        ],
      },
    },
  ],
});
store.addOrder({
  roomId: 'ch-dupa',
  userId: 'u1',
  productId: 'api-key-margarita',
  productName: '🍹 ◦ Margarita [ Gemini Flash ล้วน ]',
  unitPrice: 39,
  pricePer: 100,
  amount: null,
  slipUrls: [],
  dayKey: store.dayKey(),
  createdAt: new Date().toISOString(),
  closedAt: null,
});
calls.length = 0;
await handleShopInteraction(slipSubmitInteraction('39', '100', 'ch-dupa'));
check('ส่งสลิปครั้งแรกลงทะเบียน transRef', store.getOrder('ch-dupa')?.priceMatch === true);
store.addOrder({
  roomId: 'ch-dupb',
  userId: 'u1',
  productId: 'api-key-margarita',
  productName: '🍹 ◦ Margarita [ Gemini Flash ล้วน ]',
  unitPrice: 39,
  pricePer: 100,
  amount: null,
  slipUrls: [],
  dayKey: store.dayKey(),
  createdAt: new Date().toISOString(),
  closedAt: null,
});
calls.length = 0;
await handleShopInteraction(slipSubmitInteraction('39', '100', 'ch-dupb'));
check('ส่งสลิปซ้ำ (transRef เดียว) → แจ้งทีมงาน', calls.some((c) => c[0] === 'logSend'), JSON.stringify(calls.map((c) => c[0])));
const dupNotice = calls.find((c) => c[0] === 'logSend')?.[1]?.content || '';
check('แจ้งเตือน "สลิปนี้เคยถูกใช้แล้ว"', dupNotice.includes('เคยถูกใช้แล้ว'), dupNotice.slice(0, 200));

// ---------- สลิปเก่า (paidAt มากกว่า 24 ชม.) ----------
config.shop.slipVerifyKey = 'gemini-key';
config.shop.slipVerifyProvider = 'gemini';
geminiMock({
  candidates: [
    {
      content: {
        parts: [
          { text: '{"isSlip":true,"amount":39,"transRef":"OLD-Y1","paidAt":"2026-10-15T00:00:00+07:00"}' },
        ],
      },
    },
  ],
});
store.addOrder({
  roomId: 'ch-old',
  userId: 'u1',
  productId: 'api-key-margarita',
  productName: '🍹 ◦ Margarita [ Gemini Flash ล้วน ]',
  unitPrice: 39,
  pricePer: 100,
  amount: null,
  slipUrls: [],
  dayKey: store.dayKey(),
  createdAt: new Date().toISOString(),
  closedAt: null,
});
calls.length = 0;
await handleShopInteraction(slipSubmitInteraction('39', '', 'ch-old'));
check('สลิปเก่า → แจ้งทีมงาน', calls.some((c) => c[0] === 'logSend'));
const oldNotice = calls.find((c) => c[0] === 'logSend')?.[1]?.content || '';
check('แจ้งเตือน "สลิปเก่า"', oldNotice.includes('สลิปเก่า'), oldNotice.slice(0, 200));

// ---------- โหมดไม่แท็กทีมงาน (ไว้เทส) ----------
config.shop.mentionStaff = false;
calls.length = 0;
await handleShopInteraction(selectInteraction('shop:product', ['theme']));
const quietSend = calls.find((c) => c[0] === 'roomSend');
check('โหมดไม่แท็ก: ห้องออเดอร์ไม่แท็กทีมงาน', !(quietSend?.[1]?.content || '').includes('<@&role-staff>'), (quietSend?.[1]?.content || '').slice(0, 40));
config.shop.mentionStaff = true;

console.log(failed === 0 ? '\nผ่านทั้งหมด ✅' : `\nมี ${failed} รายการที่ไม่ผ่าน ❌`);
process.exit(failed === 0 ? 0 : 1);
