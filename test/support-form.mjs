import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (!process.env.SHOP_DATA_DIR) {
  process.env.SHOP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'support-test-'));
}
process.env.DISCORD_TOKEN = 'test';
process.env.DISCORD_CLIENT_ID = 'test';
process.env.SUPPORT_FORM_TARGET_CHANNEL_ID = 'ch-target';
process.env.SUPPORT_FORM_FORUM_TAG_ID = 'tag-pending,tag-resolved,tag-closed';
process.env.SUPPORT_FORM_NOTIFY_ROLE_IDS = 'role-support';

const FORUM = 15;
const PUBLIC_THREAD = 11;

const calls = [];
const mkReply = (name) => async (p) => {
  calls.push([name, p]);
};

const forumTags = [
  { id: 'tag-pending', name: 'รอแก้ไข' },
  { id: 'tag-resolved', name: 'แก้ไขแล้ว' },
  { id: 'tag-closed', name: 'ปิดเคส' },
];

function forumChannel() {
  return {
    id: 'ch-target',
    type: FORUM,
    isTextBased: () => true,
    availableTags: forumTags,
    threads: {
      create: async (opts) => {
        calls.push(['threadCreate', opts]);
        return { id: 'post1', type: PUBLIC_THREAD, parent: { type: FORUM, availableTags: forumTags } };
      },
    },
  };
}

function fetchChannel(id) {
  calls.push(['fetch', id]);
  if (id === 'ch-target') return forumChannel();
  return { id, type: PUBLIC_THREAD, isTextBased: () => true };
}

function baseInteraction(userId = 'u1', clientOverride = null) {
  return {
    isButton: () => false,
    isModalSubmit: () => false,
    isRepliable: () => true,
    user: { id: userId, username: 'tester', tag: 'tester#1', displayAvatarURL: () => '' },
    member: { roles: { cache: { some: () => false } }, permissions: { has: () => false } },
    reply: mkReply('reply'),
    deferReply: mkReply('deferReply'),
    editReply: mkReply('editReply'),
    showModal: mkReply('showModal'),
    update: mkReply('update'),
    deferred: false,
    replied: false,
    channelId: 'ch1',
    channel: { id: 'ch1', name: 'แบบฟอร์มแจ้งปัญหา' },
    client:
      clientOverride || {
        channels: { fetch: async (id) => fetchChannel(id) },
        users: { fetch: async () => ({ id: userId, tag: 'tester#1', displayAvatarURL: () => '' }) },
      },
  };
}

function buttonInteraction(customId, userId = 'u1', clientOverride = null) {
  const i = baseInteraction(userId, clientOverride);
  i.isButton = () => true;
  i.customId = customId;
  i.message = { id: 'post1', edit: async (p) => calls.push(['edit', p]) };
  return i;
}

function staffButtonInteraction(customId) {
  const i = buttonInteraction(customId);
  i.member = { roles: { cache: { some: () => false } }, permissions: { has: () => true } };
  i.channel = {
    id: 'post1',
    name: 'เปิดไม่ติด',
    type: PUBLIC_THREAD,
    parent: { type: FORUM, availableTags: forumTags },
    isThread: () => true,
    setName: async (n) => calls.push(['setName', n]),
    setLocked: async (v) => calls.push(['setLocked', v]),
    setAppliedTags: async (arr) => calls.push(['setAppliedTags', arr]),
    send: async (p) => calls.push(['send', p]),
  };
  return i;
}

function formModalInteraction(userId = 'u1', clientOverride = null) {
  const i = baseInteraction(userId, clientOverride);
  i.isModalSubmit = () => true;
  i.customId = 'supportForm:modal';
  i.fields = {
    getStringSelectValues: (id) => {
      if (id === 'channelSelect') return ['google-ai-studio'];
      if (id === 'launchSelect') return ['termux'];
      if (id === 'deviceSelect') return ['pc-windows'];
      return [];
    },
    getTextInputValue: (id) => {
      if (id === 'titleInput') return 'เปิดไม่ติด';
      if (id === 'modelInput') return 'Gemini 3.x';
      return '';
    },
  };
  return i;
}

function step2ModalInteraction(userId = 'u1', clientOverride = null) {
  const i = baseInteraction(userId, clientOverride);
  i.isModalSubmit = () => true;
  i.customId = 'supportForm:step2Modal';
  i.fields = {
    getTextInputValue: (id) => {
      if (id === 'problemInput') return 'ทดสอบปัญหาใช้งาน';
      if (id === 'jailbreakInput') return 'เจลทดสอบ';
      return '';
    },
    getUploadedFiles: (id) =>
      id === 'imageUpload'
        ? { values: () => [{ url: 'https://cdn.example/img.png', name: 'img.png' }] }
        : { values: () => [] },
  };
  return i;
}

let failed = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${e ? ' -> ' + e : ''}`);
  if (!c) failed++;
};

const { buildFormModal, buildStep2Modal } = await import('../src/features/supportForm/ui.js');
const modalJson = buildFormModal().toJSON();
check('สเต็ป 1 มีไม่เกิน 5 ช่อง', modalJson.components.length === 5, `rows=${modalJson.components.length}`);
check('สเต็ป 1 ช่องแรกเป็นหัวข้อปัญหา', modalJson.components[0].component?.custom_id === 'titleInput');
check('สเต็ป 1 ช่องที่สองเป็นเมนูช่องทางการใช้งาน', modalJson.components[1].component?.type === 3 && modalJson.components[1].component?.custom_id === 'channelSelect');
check('สเต็ป 1 ช่องที่สามเป็นเมนูวิธีเปิด', modalJson.components[2].component?.type === 3 && modalJson.components[2].component?.custom_id === 'launchSelect');
check('สเต็ป 1 มีช่องอุปกรณ์', modalJson.components[3].component?.custom_id === 'deviceSelect');
check('สเต็ป 1 มีช่องโมเดล', modalJson.components[4].component?.custom_id === 'modelInput');
const step2Json = buildStep2Modal().toJSON();
check('สเต็ป 2 มี 3 ช่อง (jailbreak + รายละเอียด + แนบรูป)', step2Json.components.length === 3, `rows=${step2Json.components.length}`);
check('สเต็ป 2 ช่องแรกเป็น Jailbreak', step2Json.components[0].component?.custom_id === 'jailbreakInput', step2Json.components[0].component?.custom_id);
check('สเต็ป 2 ช่องที่สองเป็นรายละเอียดปัญหา (min_length)', step2Json.components[1].component?.custom_id === 'problemInput' && step2Json.components[1].component?.min_length === 10);
check('สเต็ป 2 ช่องที่สามเป็นอัปโหลดไฟล์', step2Json.components[2].component?.type === 19);

const { handleSupportFormInteraction } = await import('../src/features/supportForm/handler.js');
const { buildSupportPostContent } = await import('../src/features/supportForm/embeds.js');

calls.length = 0;
check('กดปุ่มแจ้งปัญหา เปิดโมดัล', (await handleSupportFormInteraction(buttonInteraction('supportForm:open'))) === true);
check('กดปุ่มแจ้งปัญหา เรียก showModal', calls.some((c) => c[0] === 'showModal'));

calls.length = 0;
check('ส่งสเต็ป 1 จัดการสำเร็จ', (await handleSupportFormInteraction(formModalInteraction())) === true);
check('สเต็ป 1 ยังไม่สร้างโพสต์ (รอสเต็ป 2)', !calls.some((c) => c[0] === 'threadCreate'));
const step1Reply = calls.find((c) => c[0] === 'editReply');
const step1Btns = (step1Reply?.[1]?.components?.[0]?.components || []).map((b) => b?.data?.custom_id || b?.custom_id);
check('สเต็ป 1 ตอบยืนยัน + ปุ่มไปสเต็ป 2', step1Btns.includes('supportForm:step2'), JSON.stringify(step1Btns));

calls.length = 0;
check('กดปุ่มไปสเต็ป 2 เปิดโมดัล', (await handleSupportFormInteraction(buttonInteraction('supportForm:step2'))) === true);
const step2ModalCall = calls.find((c) => c[0] === 'showModal');
check('โมดัลสเต็ป 2 customId ถูกต้อง', step2ModalCall?.[1]?.toJSON?.().custom_id === 'supportForm:step2Modal', step2ModalCall?.[1]?.toJSON?.().custom_id);

calls.length = 0;
check('ส่งสเต็ป 2 จัดการสำเร็จ', (await handleSupportFormInteraction(step2ModalInteraction())) === true);
const threadCall = calls.find((c) => c[0] === 'threadCreate');
check('สเต็ป 2 สร้างโพสต์ในโหมด Forum', Boolean(threadCall));
check('สเต็ป 2 ติดแท็กรอแก้ไขทันที', JSON.stringify(threadCall?.[1]?.appliedTags) === JSON.stringify(['tag-pending']));
check('ใช้หัวข้อปัญหาเป็นชื่อเรื่อง', threadCall?.[1]?.name === 'เปิดไม่ติด', threadCall?.[1]?.name);
const post = threadCall?.[1]?.message || {};
const postContent = post.content || '';
check('โพสต์มีรายละเอียดปัญหาจากสเต็ป 2', postContent.includes('ทดสอบปัญหาใช้งาน'), postContent);
check('โพสต์แนบรูปจากสเต็ป 2 (ข้อความเดียว)', (post.files?.length || 0) === 1, String(post.files?.length));
check('โพสต์แท็กคนแจ้ง + role ทีมงาน', postContent.includes('<@u1>') && postContent.includes('<@&role-support>'), postContent);
check('แท็กคนแจ้งครั้งเดียว', (postContent.match(/<@u1>/g) || []).length === 1, String((postContent.match(/<@u1>/g) || []).length));
check('โพสต์เป็นข้อความธรรมดา ไม่มีกรอบ embed', !(post.embeds && post.embeds.length));
check('โพสต์แสดงสถานะในข้อความ', postContent.includes('✦ สถานะ :'), postContent);
check('โพสต์มีหัวข้อเทมเพลต', postContent.includes('✦ แจ้งปัญหาการใช้งาน ✦'), postContent);
check('โพสต์มีเส้นคั่นเทมเพลต', postContent.includes('✧ ───────────── ✧'), postContent);
check('โพสต์ไม่มีเส้นข้างหน้า (blockquote)', !postContent.split('\n').some((l) => l.startsWith('>')), postContent);
check('โพสต์แยกโมเดลเป็นบรรทัด', postContent.includes('◦ โมเดล : Gemini 3.x'), postContent);
check('โพสต์แสดงช่องทางการใช้งาน', postContent.includes('◦ ช่องทางการใช้งาน : Google Ai Studio'), postContent);
check('โพสต์แยก Jailbreak เป็นบรรทัด', postContent.includes('◦ Jailbreak : เจลทดสอบ'));
const postButtons = (post.components?.[0]?.components || []).map((b) => b?.data?.custom_id || b?.custom_id);
check('โพสต์มีปุ่มปิดเคสของทีมงาน', postButtons.includes('supportForm:close'), JSON.stringify(postButtons));
check('โพสต์สถานะรอตรวจสอบ ยังไม่มีข้อความปิดเคส', !postContent.includes('เคสของท่านได้รับการแก้ไข'));
check('สเต็ป 2 ตอบยืนยันสำเร็จ', calls.some((c) => c[0] === 'editReply' && /สำเร็จ|ครบแล้ว/.test(JSON.stringify(c[1]))));

// --- fallback: แนบรูปสร้างโพสต์ล้ม -> ยังได้โพสต์ (ไม่มีรูป) ---
function failingForum() {
  return {
    id: 'ch-target',
    type: FORUM,
    isTextBased: () => true,
    availableTags: forumTags,
    threads: {
      create: async (opts) => {
        calls.push(['threadCreate', opts]);
        if (opts.message?.files?.length) throw new Error('FILE_TOO_LARGE');
        return { id: 'post2', type: PUBLIC_THREAD, parent: { type: FORUM, availableTags: forumTags } };
      },
    },
  };
}
const failClient = {
  channels: { fetch: async (id) => (id === 'ch-target' ? failingForum() : { id, type: PUBLIC_THREAD, isTextBased: () => true }) },
  users: { fetch: async () => ({ id: 'u2', tag: 'tester#1', displayAvatarURL: () => '' }) },
};

calls.length = 0;
await handleSupportFormInteraction(formModalInteraction('u2', failClient));
calls.length = 0;
await handleSupportFormInteraction(step2ModalInteraction('u2', failClient));
const failThreads = calls.filter((c) => c[0] === 'threadCreate');
check('รูปสร้างโพสต์ล้มแล้ว retry ใหม่', failThreads.length === 2, String(failThreads.length));
check('retry รอบสองไม่มีไฟล์แนบ', Boolean(failThreads[1]) && !failThreads[1][1]?.message?.files, JSON.stringify(failThreads[1]?.[1]?.message?.files));
check('ยังได้โพสต์หลังรูปล้ม', failThreads[1]?.[1]?.name === 'เปิดไม่ติด', failThreads[1]?.[1]?.name);
check('แจ้งผู้ใช้ว่าแนบรูปไม่สำเร็จ', calls.some((c) => c[0] === 'editReply' && /แนบรูปไม่สำเร็จ/.test(JSON.stringify(c[1]))));

const longPost = buildSupportPostContent({
  user: { id: 'u1' },
  data: { launch: 'termux', channel: 'google-vertex', device: 'ios', model: 'm', jailbreak: 'j', problem: 'ก'.repeat(4000), statusNote: 'ข'.repeat(2000) },
  status: 'pending',
  notifyRoleIds: [],
});
check('โพสต์ยาวจัดไม่เกิน 2000 ตัวอักษร', longPost.length <= 2000, String(longPost.length));
check('โพสต์ยาวจัดยังคงมีส่วนปัญหา', longPost.includes('รายละเอียดปัญหา'), String(longPost.length));
check('โพสต์ยาวจัดยังคงมีส่วนสถานะปิดท้าย', longPost.includes('ขอบคุณสำหรับการแจ้งปัญหา ♡'));

calls.length = 0;
check('ทีมงานกดปุ่มเดียวปิดเคสสำเร็จ', (await handleSupportFormInteraction(staffButtonInteraction('supportForm:close'))) === true);
check('ปิดเคส ล็อกช่องเป็นดูได้อย่างเดียว', calls.some((c) => c[0] === 'setLocked' && c[1] === true));
check('ปิดเคส เปลี่ยนแท็กเป็นแก้ไขแล้ว', calls.some((c) => c[0] === 'setAppliedTags' && c[1].includes('tag-resolved')));
check('ปิดเคส ไม่แตะชื่อเรื่อง (ยึดตามแท็ก)', !calls.some((c) => c[0] === 'setName'));
check('ปิดเคส อัปเดตโพสต์ (ปุ่มถูกปิด)', calls.some((c) => c[0] === 'edit' && JSON.stringify(c[1]).includes('"disabled":true')));
check('ปิดเคส ส่งข้อความแจ้งเตือนเป็นคอมเมนต์', calls.some((c) => c[0] === 'send' && JSON.stringify(c[1]).includes('เคสของท่านได้รับการแก้ไข')));
check('ปิดเคส ตอบยืนยันทีมงาน', calls.some((c) => c[0] === 'editReply' && /ปิดเคสเรียบร้อย/.test(JSON.stringify(c[1]))));

calls.length = 0;
check('คนไม่ใช่ทีมงานกดปิดเคสไม่ได้', (await handleSupportFormInteraction(buttonInteraction('supportForm:close'))) === true);
check('คนไม่ใช่ทีมงานถูกปฏิเสธ', calls.some((c) => c[0] === 'reply' && /เฉพาะทีมงาน/.test(JSON.stringify(c[1]))));

console.log(failed === 0 ? '\nผ่านทั้งหมด ✅' : `\nมี ${failed} รายการที่ไม่ผ่าน ❌`);
process.exit(failed === 0 ? 0 : 1);
