import { EmbedBuilder, ChannelType } from 'discord.js';
import {
  getKeyUsage,
  getPricing,
  computeRemainingCounts,
  countUsagePerModel,
  stripModelPrefix,
  friendlyError,
  verifyKey,
  getAccountInfo,
} from '../services/linkapi.js';
import * as threadStore from '../services/linkapiThreads.js';
import { logKey, maskKey } from '../services/keylog.js';
import { COLORS } from '../util/embeds.js';
import { config } from '../config.js';

const KEY_PATTERN = /sk-[A-Za-z0-9_-]{8,}/g;

export function extractKeys(text) {
  const matches = String(text || '').match(KEY_PATTERN);
  if (!matches) return [];
  return [...new Set(matches)].slice(0, config.linkapi.maxKeys);
}

function channelAllowed(channel) {
  const ids = config.linkapi.channelIds;
  if (!ids.length) return true;
  if (ids.includes(channel.id)) return true;
  if (channel.isThread?.() && channel.parentId && ids.includes(channel.parentId)) return true;
  return false;
}

function buildResultEmbed({ key, usage, counts, usedCounts, tokenName, accountName, user }) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.green)
    .setAuthor({ name: config.shopName })
    .setTitle('🎟️ จำนวนข้อความคงเหลือ')
    .setTimestamp();

  const lines = [];
  if (usage.unlimited) {
    lines.push('♾️ **คีย์แบบไม่จำกัดโควตา**');
    lines.push('');
  }

  if (!counts.length) {
    lines.push('⚠️ ไม่พบรายการโมเดลลิมิตในคีย์นี้');
    lines.push('กรุณาตั้ง "Model Limits" ให้คีย์ก่อน แล้วส่งคีย์มาอีกครั้ง');
  } else {
    for (const c of counts) {
      const used = usedCounts ? usedCounts.get(stripModelPrefix(c.model)) : undefined;
      const parts = [];
      if (used != null) parts.push(`ใช้ไป ${used} ข้อความ`);
      if (c.remaining == null) {
        parts.push('เหลือ ♾️');
      } else {
        parts.push(`เหลืออีก **${c.remaining}** ข้อความ`);
      }
      lines.push(`• \`${c.model}\` — ${parts.join(' • ')}`);
    }
  }

  embed.setDescription(lines.join('\n').slice(0, 4000));
  embed.addFields({ name: '🔑 คีย์', value: `\`${maskKey(key)}\``, inline: true });
  if (tokenName) embed.addFields({ name: '🏷️ ชื่อคีย์', value: String(tokenName).slice(0, 100), inline: true });
  if (accountName) embed.addFields({ name: '👤 บัญชี', value: String(accountName).slice(0, 100), inline: true });
  if (usage.expiresAt) {
    embed.addFields({ name: '⏳ หมดอายุ', value: usage.expiresAt.toLocaleString('th-TH'), inline: true });
  }
  embed.setFooter({ text: `${config.shopName} • ผู้ใช้: ${user.tag}` });
  return embed;
}

function errorEmbed(key, reason, user) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.red)
    .setAuthor({ name: config.shopName })
    .setTitle('❌ เช็คคีย์ไม่สำเร็จ')
    .addFields(
      { name: '🔑 คีย์', value: `\`${maskKey(key)}\`` },
      { name: 'สาเหตุ', value: String(reason || 'ไม่ทราบสาเหตุ').slice(0, 1000) },
    )
    .setTimestamp();
  if (user) embed.setFooter({ text: `${config.shopName} • ผู้ใช้: ${user.tag}` });
  return embed;
}

async function getPrivateThread(message) {
  const guild = message.guild;
  if (!guild) return null;
  let parent = message.channel;
  if (parent.isThread?.()) parent = parent.parent || parent;
  if (!parent || typeof parent.threads?.create !== 'function') return null;

  const existingId = threadStore.getThreadId(guild.id, message.author.id);
  if (existingId) {
    const existing = await guild.channels.fetch(existingId).catch(() => null);
    if (existing && !existing.archived) {
      try {
        await existing.members.add(message.author.id);
      } catch {
        /* ผู้ใช้อาจอยู่ใน thread แล้ว */
      }
      return existing;
    }
    threadStore.clearThreadId(guild.id, message.author.id);
  }

  const created = await parent.threads.create({
    name: `🔒 ${message.author.username}`.slice(0, 100),
    type: ChannelType.PrivateThread,
    invitable: false,
    autoArchiveDuration: 1440,
    reason: 'LinkAPI key check',
  });
  await created.members.add(message.author.id).catch(() => {});
  threadStore.setThreadId(guild.id, message.author.id, created.id);
  return created;
}

async function resolveDestination(message) {
  const mode = config.linkapi.privateMode;
  if (mode === 'off') return { type: 'channel' };
  if (message.guild) {
    const thread = await getPrivateThread(message).catch((err) => {
      console.warn(`[linkapi] สร้าง private thread ไม่สำเร็จ: ${err.message}`);
      return null;
    });
    if (thread) return { type: 'thread', thread };
  }
  return { type: 'dm' };
}

async function sendResult(dest, message, embed, user) {
  if (dest.type === 'thread') {
    await dest.thread.send({ content: `<@${user.id}>`, embeds: [embed] }).catch(() => {});
    return;
  }
  if (dest.type === 'dm') {
    try {
      await user.send({ embeds: [embed] });
      return;
    } catch {
      /* DM ปิดอยู่ -> ตอบในห้องแทน */
    }
  }
  await message.channel.send({ embeds: [embed] }).catch(() => {});
}

function fallbackModels(usage, used) {
  if (usage.modelLimits.length) return usage.modelLimits;
  const configured = Object.keys(config.linkapi.modelLimits || {});
  if (configured.length) return configured;
  if (used?.perModel) return [...used.perModel.keys()];
  return [];
}

export async function handleKeys(message, client) {
  if (!channelAllowed(message.channel)) return false;
  const keys = extractKeys(message.content);
  if (!keys.length) return false;

  const privateMode = config.linkapi.privateMode;
  const dest = await resolveDestination(message);

  if (privateMode !== 'off' && message.deletable) {
    await message.delete().catch(() => {});
  }

  let pricing = null;
  try {
    pricing = await getPricing();
  } catch (err) {
    console.warn(`[linkapi] โหลดราคาโมเดลไม่สำเร็จ: ${err.message}`);
  }

  for (const key of keys) {
    try {
      const verdict = await verifyKey(key).catch(() => null);
      if (verdict && verdict.status === 'foreign') {
        await sendResult(dest, message, errorEmbed(key, '⛔ คีย์นี้ไม่ได้รับการอนุญาต (ไม่ใช่คีย์ของบัญชีร้าน)'), message.author);
        continue;
      }
      if (verdict && verdict.status === 'unable') {
        await sendResult(
          dest,
          message,
          errorEmbed(key, `ยืนยันเจ้าของคีย์ไม่ได้: ${verdict.reason || ''}`),
          message.author,
        );
        continue;
      }

      const usage = await getKeyUsage(key);
      const [account, used] = await Promise.all([
        getAccountInfo().catch(() => null),
        countUsagePerModel(key).catch(() => null),
      ]);

      const models = fallbackModels(usage, used);
      const counts = pricing ? computeRemainingCounts(models, usage, pricing) : [];
      if (models.length > counts.length) {
        const found = new Set(counts.map((c) => c.model));
        for (const m of models) {
          if (!found.has(m)) console.warn(`[linkapi] ข้ามโมเดล ${m} (ไม่มีราคา [次])`);
        }
      }
      const embed = buildResultEmbed({
        key,
        usage,
        counts,
        usedCounts: used?.perModel,
        tokenName: usage.name || verdict?.token?.name,
        accountName: account?.displayName,
        user: message.author,
      });
      await sendResult(dest, message, embed, message.author);
      try {
        logKey({ key, user: message.author, usage, counts, tokenName: usage.name || verdict?.token?.name });
      } catch {
        /* บันทึก Excel ไม่สำเร็จ ไม่กระทบการตอบ */
      }
    } catch (err) {
      await sendResult(dest, message, errorEmbed(key, friendlyError(err), message.author), message.author);
    }
  }
  return true;
}
