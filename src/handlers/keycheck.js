import {
  EmbedBuilder,
  ChannelType,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
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

// ธีมเดียวกับร้าน (เส้นคั่น + จุด ◦ + สีทอง)
const DIVIDER = '✧ ───────────── ✧';
const BULLET = '◦ ';
const SHOP_GOLD = 0xefb810;

export const CHECK_KEY_BUTTON = 'keycheck:open';
export const CHECK_KEY_MODAL = 'keycheck:modal';
export const CHECK_KEY_INPUT = 'keycheck:keys';

// ปุ่มเปิดกรอกคีย์ (วางบนข้อความต้อนรับ)
export function buildCheckKeyButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CHECK_KEY_BUTTON).setLabel('ตรวจสอบคีย์').setEmoji('🔑').setStyle(ButtonStyle.Primary),
  );
}

export function buildCheckKeyModal() {
  return new ModalBuilder()
    .setCustomId(CHECK_KEY_MODAL)
    .setTitle('เช็คโควต้าคีย์')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('คีย์ที่ต้องการเช็ค')
        .setDescription('วางคีย์ที่ขึ้นต้นด้วย sk- (ใส่หลายคีย์ได้)')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(CHECK_KEY_INPUT)
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('sk-...')
            .setRequired(true),
        ),
    );
}

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

function formatInt(n) {
  return Number(n || 0).toLocaleString('en-US');
}

// จับชนิดคีย์ลูกค้าจากรายชื่อโมเดล → ชื่อสินค้า (ตามเมนูร้าน)
const KEY_PRODUCT_RULES = [
  { name: 'Cosmo', emoji: '🍷', test: (f) => f.claude && f.gemini },
  { name: 'Angel Shot', emoji: '🍸', test: (f) => f.claude },
  { name: 'Long Island', emoji: '🥃', test: (f) => f.gemini && f.pro && f.flash },
  { name: 'Margarita', emoji: '🍹', test: (f) => f.gemini && f.flash },
  { name: 'Long Island', emoji: '🥃', test: (f) => f.gemini },
];

export function detectKeyProduct(models) {
  const names = (models || []).map((m) => stripModelPrefix(String(m)).toLowerCase());
  if (!names.length) return null;
  const flags = {
    gemini: names.some((n) => n.includes('gemini')),
    claude: names.some((n) => /claude|opus|sonnet|haiku/.test(n)),
    pro: names.some((n) => n.includes('pro')),
    flash: names.some((n) => n.includes('flash')),
  };
  const rule = KEY_PRODUCT_RULES.find((r) => r.test(flags));
  return rule ? { name: rule.name, emoji: rule.emoji } : null;
}

function buildResultEmbed({ key, usage, counts, usedCounts, tokenName, accountName, user }) {
  const models = [...new Set([...(usage.modelLimits || []), ...(counts || []).map((c) => c.model)])];
  const product = detectKeyProduct(models);
  const embed = new EmbedBuilder()
    .setColor(SHOP_GOLD)
    .setAuthor({ name: config.shopName })
    .setTitle(`${product ? product.emoji : '🎟️'} เช็คโควต้าคีย์ · ${product ? product.name : 'LINKAPI'}`)
    .setTimestamp();

  const lines = [DIVIDER, ''];
  if (usage.unlimited) lines.push(`${BULLET}โควตา : ♾️ ไม่จำกัด`);
  lines.push(`${BULLET}จำนวนโมเดล : ${counts.length} โมเดล`);

  lines.push('');
  if (!counts.length) {
    lines.push(`${BULLET}⚠️ ยังไม่ได้ตั้ง Model Limits ให้คีย์นี้`);
    lines.push(`${BULLET}ตั้ง "Model Limits" ให้คีย์ก่อน แล้วเช็คอีกครั้ง`);
  } else {
    for (const c of counts) {
      const used = usedCounts ? usedCounts.get(stripModelPrefix(c.model)) : undefined;
      const display = stripModelPrefix(c.model) || c.model;
      const remain = c.remaining == null ? '♾️' : `**${formatInt(c.remaining)}** ข้อความ`;
      const extra = used != null ? ` (ใช้ไป ${formatInt(used)})` : '';
      const warn = c.remaining != null && c.remaining <= 20 ? ' ⚠️' : '';
      lines.push(`${BULLET}\`${display}\` — ${remain}${extra}${warn}`);
    }
  }
  lines.push('', DIVIDER);

  embed.setDescription(lines.join('\n').slice(0, 4096));
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
    .setDescription(
      [
        DIVIDER,
        '',
        `✦ สาเหตุ`,
        `${BULLET}${String(reason || 'ไม่ทราบสาเหตุ').slice(0, 900)}`,
        '',
        `${BULLET}ตรวจสอบว่าคีย์ถูกต้อง ยังไม่หมดอายุ แล้วลองเช็คอีกครั้ง`,
        '',
        DIVIDER,
      ].join('\n'),
    )
    .addFields({ name: '🔑 คีย์', value: `\`${maskKey(key)}\`` })
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
  if (mode === 'dm') return { type: 'dm' };
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
      const res = await checkKey(key, message.author, pricing);
      await sendResult(dest, message, res.embed, message.author);
      if (res.log) {
        try {
          logKey({ key, user: message.author, usage: res.usage, counts: res.counts, tokenName: res.tokenName });
        } catch {
          /* บันทึก Excel ไม่สำเร็จ ไม่กระทบการตอบ */
        }
      }
    } catch (err) {
      await sendResult(dest, message, errorEmbed(key, friendlyError(err), message.author), message.author);
    }
  }
  return true;
}

async function checkKey(key, user, pricing) {
  const verdict = await verifyKey(key).catch(() => null);
  if (verdict && verdict.status === 'foreign') {
    return { embed: errorEmbed(key, '⛔ คีย์นี้ไม่ได้รับการอนุญาต (ไม่ใช่คีย์ของบัญชีร้าน)', user) };
  }
  if (verdict && verdict.status === 'unable') {
    return { embed: errorEmbed(key, `ยืนยันเจ้าของคีย์ไม่ได้: ${verdict.reason || ''}`, user) };
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
  const tokenName = usage.name || verdict?.token?.name;
  const embed = buildResultEmbed({
    key,
    usage,
    counts,
    usedCounts: used?.perModel,
    tokenName,
    accountName: account?.displayName,
    user,
  });
  return { embed, usage, counts, tokenName, log: true };
}

export async function handleCheckKeyInteraction(interaction) {
  if (interaction.isButton?.() && interaction.customId === CHECK_KEY_BUTTON) {
    await interaction.showModal(buildCheckKeyModal());
    return true;
  }

  if (interaction.isModalSubmit?.() && interaction.customId === CHECK_KEY_MODAL) {
    const raw = interaction.fields?.getTextInputValue(CHECK_KEY_INPUT) || '';
    await runChecks(interaction, extractKeys(raw), interaction.user);
    return true;
  }

  return false;
}

async function runChecks(interaction, keys, user) {
  if (!keys.length) {
    await interaction
      .reply({ content: '❌ ไม่พบคีย์ (ต้องขึ้นต้นด้วย `sk-`)', flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

  let pricing = null;
  try {
    pricing = await getPricing();
  } catch (err) {
    console.warn(`[linkapi] โหลดราคาโมเดลไม่สำเร็จ: ${err.message}`);
  }

  let first = true;
  for (const key of keys) {
    let res;
    try {
      res = await checkKey(key, user, pricing);
    } catch (err) {
      res = { embed: errorEmbed(key, friendlyError(err), user) };
    }
    if (first) {
      await interaction.editReply({ embeds: [res.embed] }).catch(() => {});
      first = false;
    } else {
      await interaction.followUp({ embeds: [res.embed], flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    if (res.log) {
      try {
        logKey({ key, user, usage: res.usage, counts: res.counts, tokenName: res.tokenName });
      } catch {
        /* บันทึก Excel ไม่สำเร็จ ไม่กระทบการตอบ */
      }
    }
  }
}
