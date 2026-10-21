import fs from 'node:fs';
import path from 'node:path';
import { Client, GatewayIntentBits, Partials, Events, REST, Routes } from 'discord.js';
import { config, missingConfig } from './config.js';
import { handleKeys, handleCheckKeyInteraction } from './handlers/keycheck.js';
import { postWelcome } from './handlers/welcome.js';
import { postSupportForm, handleSupportFormInteraction } from './features/supportForm/handler.js';
import { postShopPanel, handleShopInteraction, scheduleDailySummary } from './features/shop/handler.js';
import { PRICE_COMMAND_NAME, priceCommandJSON, handlePriceCommand } from './features/shop/priceCommand.js';

const DEBUG_LOG = path.join(process.cwd(), 'data', 'debug.log');
function dlog(...args) {
  const line = `[${new Date().toISOString()}] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`;
  console.log(line);
  try {
    fs.mkdirSync(path.dirname(DEBUG_LOG), { recursive: true });
    fs.appendFileSync(DEBUG_LOG, line + '\n');
  } catch {
    /* ignore */
  }
}

const missing = missingConfig();
if (missing.length > 0) {
  console.error(`\n❌ ขาดค่าใน .env: ${missing.join(', ')}`);
  console.error('   คัดลอก .env.example ไปเป็น .env แล้วกรอกค่าให้ครบก่อน\n');
  process.exit(1);
}

// กันการรันซ้อน: ถ้ามีอินสแตนซ์เดิมยังทำงานอยู่ ให้หยุดตัวใหม่ (กันบอทตอบซ้ำ/สร้างห้องเบิ้ล)
const LOCK_FILE = path.join(process.cwd(), 'data', 'bot.lock');
function acquireLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const pid = Number(fs.readFileSync(LOCK_FILE, 'utf8').trim());
      let alive = false;
      if (pid && pid !== process.pid) {
        try {
          process.kill(pid, 0);
          alive = true;
        } catch {
          alive = false;
        }
      }
      if (alive) {
        console.error(`\n⚠️  บอทกำลังทำงานอยู่แล้ว (PID ${pid}) — หยุดโปรเซสนี้เพื่อกันบอทซ้ำ\n`);
        process.exit(1);
      }
    }
    fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
    fs.writeFileSync(LOCK_FILE, String(process.pid));
    const release = () => {
      try {
        if (Number(fs.readFileSync(LOCK_FILE, 'utf8').trim()) === process.pid) fs.unlinkSync(LOCK_FILE);
      } catch {
        /* ignore */
      }
    };
    process.on('exit', release);
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      process.on(sig, () => {
        release();
        process.exit(0);
      });
    }
  } catch {
    /* ignore lock errors */
  }
}
acquireLock();

async function registerCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(config.token);
    const body = [priceCommandJSON()];
    if (config.guildId) {
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
      console.log(`[commands] ลงทะเบียนคำสั่งในกิลด์ ${config.guildId} แล้ว`);
    } else {
      await rest.put(Routes.applicationCommands(config.clientId), { body });
      console.log('[commands] ลงทะเบียนคำสั่งแบบ global แล้ว (อาจใช้เวลาถึง 1 ชม.)');
    }
  } catch (err) {
    console.warn(`[commands] ลงทะเบียนคำสั่งไม่สำเร็จ: ${err.message}`);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.on(Events.Error, (err) => dlog('client error', err.message));

client.once(Events.ClientReady, async (c) => {
  dlog('ready', c.user.tag);
  console.log(`✅ บอทเช็คยอดข้อความในคีย์พร้อมใช้งาน: ${c.user.tag}`);
  console.log(`   LinkAPI: ${config.linkapi.base} | โหมดตอบกลับ: ${config.linkapi.privateMode}`);
  await registerCommands();
  await postWelcome(c).catch((err) => console.warn(`[welcome] ${err.message}`));
  await postSupportForm(c).catch((err) => console.warn(`[supportForm] ${err.message}`));
  await postShopPanel(c).catch((err) => console.warn(`[shop] ${err.message}`));
  scheduleDailySummary(c);
});

client.on(Events.MessageCreate, async (message) => {
  if (!config.linkapi.messageCheck) return;
  if (message.author.bot || !message.guild) return;
  await handleKeys(message, client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  dlog('interaction', interaction.type, interaction.customId || '(none)', 'user', interaction.user?.id);
  try {
    const keyHandled = await handleCheckKeyInteraction(interaction);
    if (keyHandled) {
      dlog('checkkey handled =', true);
      return;
    }
    if (interaction.isChatInputCommand?.() && interaction.commandName === PRICE_COMMAND_NAME) {
      const priceHandled = await handlePriceCommand(interaction);
      dlog('price handled =', priceHandled);
      return;
    }
    const handled = await handleSupportFormInteraction(interaction);
    dlog('interaction handled =', handled);
    if (handled) return;
    const shopHandled = await handleShopInteraction(interaction);
    dlog('shop handled =', shopHandled);
  } catch (err) {
    dlog('interaction ERROR', err.message, err.stack);
  }
});

client.login(config.token).catch((err) => {
  console.error('❌ เข้าสู่ระบบไม่สำเร็จ:', err.message);
  process.exit(1);
});
