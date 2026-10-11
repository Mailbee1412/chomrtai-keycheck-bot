if (!process.env.SHOP_DATA_DIR) {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  process.env.SHOP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'welcome-test-'));
}

const { config } = await import('../src/config.js');
const { buildWelcomeEmbed } = await import('../src/util/welcomeView.js');
const { postWelcome } = await import('../src/handlers/welcome.js');

let failed = 0;
function check(name, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}

const embed = buildWelcomeEmbed().toJSON();
check('ยินดีต้อนรับมีชื่อบอท', embed.author?.name === config.shopName);
check('มีอาการแมว', embed.title.includes('🐱'));
check('บอกวิธีแปะคีย์', embed.description.includes('sk-...'));
check('บอกผลส่งใน thread ส่วนตัว', embed.description.includes('private thread'));
check('มี field วิธีเช็ค', embed.fields?.some((f) => f.name.includes('วิธีเช็ค')));

config.linkapi.welcomeChannelId = '';
check('ไม่ตั้งช่อง = ไม่โพสต์', (await postWelcome({ channels: { fetch: () => { throw new Error('should not fetch'); } } })) === undefined);

let sendCalled = 0;
const fakeClient = {
  channels: {
    fetch: async () => ({
      send: async () => {
        sendCalled++;
        return { id: 'mid_1' };
      },
      messages: { fetch: async () => null },
    }),
  },
};
config.linkapi.welcomeChannelId = '1234567890';
await postWelcome(fakeClient);
check('โพสต์ข้อความต้อนรับครั้งแรก', sendCalled === 1);

if (failed) {
  console.log(`\nมี ${failed} รายการที่ไม่ผ่าน ❌`);
  process.exit(1);
}
console.log('\nผ่านทั้งหมด ✅');
