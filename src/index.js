import { Client, GatewayIntentBits, Partials, Events } from 'discord.js';
import { config, missingConfig } from './config.js';
import { handleKeys } from './handlers/keycheck.js';

const missing = missingConfig();
if (missing.length > 0) {
  console.error(`\n❌ ขาดค่าใน .env: ${missing.join(', ')}`);
  console.error('   คัดลอก .env.example ไปเป็น .env แล้วกรอกค่าให้ครบก่อน\n');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ บอทเช็คยอดข้อความในคีย์พร้อมใช้งาน: ${c.user.tag}`);
  console.log(`   LinkAPI: ${config.linkapi.base} | โหมดตอบกลับ: ${config.linkapi.privateMode}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  await handleKeys(message, client);
});

client.login(config.token).catch((err) => {
  console.error('❌ เข้าสู่ระบบไม่สำเร็จ:', err.message);
  process.exit(1);
});
