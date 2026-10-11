import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, config } from '../config.js';
import { buildWelcomeEmbed } from '../util/welcomeView.js';

const FILE = path.join(DATA_DIR, 'linkapi-welcome.json');

function readState() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state));
  } catch {
    /* เก็บสถานะไม่ได้ ไม่กระทบการโพสต์ */
  }
}

export async function postWelcome(client) {
  const channelId = config.linkapi.welcomeChannelId;
  if (!channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || typeof channel.send !== 'function') {
    console.warn(`[welcome] หาช่อง ${channelId} ไม่เจอ หรือส่งข้อความไม่ได้`);
    return;
  }

  const embed = buildWelcomeEmbed();
  const state = readState();

  if (state.messageId) {
    const existing = await channel.messages.fetch(state.messageId).catch(() => null);
    if (existing) {
      await existing.edit({ embeds: [embed] }).catch(() => {});
      return;
    }
  }

  const sent = await channel.send({ embeds: [embed] }).catch((err) => {
    console.warn(`[welcome] โพสต์ไม่สำเร็จ: ${err.message}`);
    return null;
  });
  if (sent) writeState({ messageId: sent.id });
}
