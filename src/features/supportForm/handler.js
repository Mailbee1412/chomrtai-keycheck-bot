import fs from 'node:fs';
import path from 'node:path';
import { ChannelType, PermissionsBitField, AttachmentBuilder, MessageFlags } from 'discord.js';
import { config, DATA_DIR } from '../../config.js';
import { buildSupportFormContent, buildSupportPostContent, buildClosedNotice } from './embeds.js';
import {
  buildOpenButton,
  buildFormModal,
  buildStep2Button,
  buildStep2Modal,
  buildStaffButtons,
  SUPPORT_OPEN_BTN,
  SUPPORT_MODAL,
  SUPPORT_STEP2_BTN,
  SUPPORT_STEP2_MODAL,
  SUPPORT_CLOSE_BTN,
  FIELD_IDS,
} from './ui.js';
import { saveRequest, getRequest } from './store.js';

const STATE_FILE = path.join(DATA_DIR, 'support-form-state.json');

// ข้อมูลสเต็ป 1 ที่รอกรอกรายละเอียดในสเต็ป 2 (เก็บในหน่วยความจำต่อผู้ใช้)
const PENDING_TTL_MS = 15 * 60 * 1000;
const pendingForms = new Map();

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    /* เก็บสถานะไม่ได้ ไม่กระทบการโพสต์ */
  }
}

function hasAllowedRole(member) {
  const allowed = config.supportForm.allowedRoleIds;
  if (!allowed.length) return true;
  if (!member) return false;
  return member.roles.cache.some((r) => allowed.includes(r.id));
}

function hasManagePermission(member) {
  if (!member) return false;
  // discord.js ไม่ขยายสิทธิ์ Administrator ให้ครบทุกบิต ต้องเช็คเอง
  if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;
  if (member.permissions?.has(PermissionsBitField.Flags.ManageMessages)) return true;
  const staff = [...(config.supportForm.staffRoleIds || []), ...(config.supportForm.notifyRoleIds || [])];
  if (staff.length && member.roles.cache.some((r) => staff.includes(r.id))) return true;
  return false;
}

const FORUM_TAG_NAME_BY_STATUS = {
  pending: 'รอแก้ไข',
  'in-progress': 'กำลังแก้ไข',
  resolved: 'แก้ไขแล้ว',
  closed: 'ปิดเคส',
};

function isForumThread(channel) {
  return channel?.type === ChannelType.PublicThread && channel.parent?.type === ChannelType.GuildForum;
}

function pickForumTagId(channel, status) {
  const ids = config.supportForm.forumTagIds;
  const parent = channel?.parent?.type === ChannelType.GuildForum ? channel.parent : channel;
  const tags = parent?.availableTags || [];
  if (!tags.length) return null;
  const wanted = FORUM_TAG_NAME_BY_STATUS[status];
  const byName = wanted ? tags.find((t) => t.name === wanted) : null;
  if (byName) return byName.id;
  if (!ids.length) return null;
  const known = tags.find((t) => ids.includes(t.id));
  return known?.id || ids[0];
}

async function syncForumTag(channel, status) {
  if (!isForumThread(channel)) return;
  const tagId = pickForumTagId(channel, status);
  if (tagId) await channel.setAppliedTags([tagId]).catch(() => {});
}

// ชื่อเรื่องของเคส = หัวข้อปัญหา (ตัดขึ้นบรรทัดใหม่/ช่องว่างซ้ำ ให้เหลือบรรทัดเดียว, ไม่เกิน 100 ตัว)
function buildThreadTitle(data, user) {
  const raw = String(data.title || data.problem || data.model || user?.username || 'แจ้งปัญหา')
    .replace(/\s+/g, ' ')
    .trim();
  return raw.slice(0, 100) || 'แจ้งปัญหา';
}

export async function postSupportForm(client) {
  const channelId = config.supportForm.formChannelId;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.()) return;
  if (channel.isThread?.()) return;
  const content = buildSupportFormContent();
  const components = [buildOpenButton(config.supportForm.buttonLabel)];
  const state = readState();

  if (state.messageId && state.channelId === channelId) {
    const existing = await channel.messages.fetch(state.messageId).catch(() => null);
    if (existing) {
      await existing.edit({ content, components }).catch(() => {});
      return;
    }
  }

  const sent = await channel.send({ content, components }).catch(() => null);
  if (sent) writeState({ channelId, messageId: sent.id });
}

async function createPost({ client, user, data, files = [], sourceChannelId }) {
  const targetId = config.supportForm.targetChannelId || sourceChannelId;
  const target = await client.channels.fetch(targetId).catch(() => null);
  if (!target) return { message: null, channel: null, attemptedFiles: files.length > 0, filesAttached: false };

  const content = buildSupportPostContent({
    user,
    data,
    status: 'pending',
    notifyRoleIds: config.supportForm.notifyRoleIds,
  });
  const components = [buildStaffButtons('pending')];
  const name = buildThreadTitle(data, user);
  const base = { content, components };
  const withFiles = files.length ? { ...base, files } : base;

  const sendForum = async (payload) => {
    const tagId = pickForumTagId(target, 'pending');
    const thread = await target.threads.create({
      name,
      message: payload,
      appliedTags: tagId ? [tagId] : [],
    });
    return { message: { id: thread.id, channel: thread }, channel: thread };
  };

  const sendPrivate = async (payload) => {
    const thread = await target.threads
      .create({
        name,
        type: ChannelType.PrivateThread,
        invitable: false,
        autoArchiveDuration: 1440,
        reason: 'Support request',
      })
      .catch(() => null);
    if (thread) {
      await thread.members.add(user.id).catch(() => {});
      const msg = await thread.send(payload).catch(() => null);
      if (msg) return { message: msg, channel: thread };
    }
    const msg = await target.send(payload).catch(() => null);
    return { message: msg, channel: target };
  };

  const send = target.type === ChannelType.GuildForum ? sendForum : sendPrivate;

  try {
    // 1) ลองสร้างพร้อมรูป (ถ้ามี)
    if (files.length) {
      const res = await send(withFiles).catch((err) => {
        console.warn(`[supportForm] create with files failed: ${err.message}`);
        return null;
      });
      if (res?.message) return { ...res, attemptedFiles: true, filesAttached: true };
      // 2) รูปล้มเหลว -> สร้างใหม่แบบไม่มีรูป เพื่อไม่ให้เสียเคสทั้งเคส
      const fallback = await send(base).catch(() => null);
      return {
        message: fallback?.message || null,
        channel: fallback?.channel || null,
        attemptedFiles: true,
        filesAttached: false,
      };
    }

    const res = await send(base).catch(() => null);
    return { message: res?.message || null, channel: res?.channel || null, attemptedFiles: false, filesAttached: false };
  } catch (err) {
    console.warn(`[supportForm] createPost failed: ${err.message}`);
  }
  return { message: null, channel: null, attemptedFiles: files.length > 0, filesAttached: false };
}

async function handleClose(interaction) {
  if (!hasManagePermission(interaction.member)) {
    await interaction
      .reply({ content: '❌ เฉพาะทีมงานเท่านั้นที่ปิดเคสได้', flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return true;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

  const message = interaction.message;
  const req = getRequest(message.id) || {};
  const updated = {
    ...req,
    status: 'resolved',
    statusUpdatedBy: interaction.user.id,
    statusUpdatedAt: new Date().toISOString(),
  };
  saveRequest(message.id, updated);

  const user = await interaction.client.users.fetch(req.userId).catch(() => null);
  const content = buildSupportPostContent({
    user: user || { id: req.userId },
    data: updated,
    status: 'resolved',
    notifyRoleIds: [],
  });
  await message.edit({ content, components: [buildStaffButtons('resolved')] }).catch(() => {});

  const channel = interaction.channel;
  await channel?.send?.({ content: buildClosedNotice() }).catch(() => {});
  await channel?.setLocked?.(true).catch(() => {});
  await syncForumTag(channel, 'resolved');

  await interaction.editReply({ content: '✅ ปิดเคสเรียบร้อย เคสนี้ถูกล็อกเป็นดูได้อย่างเดียวแล้ว' }).catch(() => {});
  return true;
}

function textField(interaction, id) {
  try {
    return interaction.fields.getTextInputValue(id) || '';
  } catch {
    return '';
  }
}

function pickField(interaction, id) {
  try {
    return interaction.fields.getStringSelectValues(id)?.[0] || '';
  } catch {
    return '';
  }
}

function readUploads(interaction) {
  try {
    const collection = interaction.fields.getUploadedFiles(FIELD_IDS.image);
    if (!collection) return [];
    if (typeof collection.values === 'function') return [...collection.values()];
    if (Array.isArray(collection)) return collection;
  } catch {
    /* ไม่มีไฟล์แนบ */
  }
  return [];
}

function getPending(userId) {
  const pending = pendingForms.get(userId);
  if (!pending) return null;
  if (Date.now() - pending.ts > PENDING_TTL_MS) {
    pendingForms.delete(userId);
    return null;
  }
  return pending;
}

async function handleStep1Submit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  const user = interaction.user;
  const channel = interaction.channel;
  const data = {
    title: textField(interaction, FIELD_IDS.title).trim(),
    channel: pickField(interaction, FIELD_IDS.channel),
    launch: pickField(interaction, FIELD_IDS.launch),
    device: pickField(interaction, FIELD_IDS.device),
    model: textField(interaction, FIELD_IDS.model).trim(),
  };
  if (!data.title) data.title = data.model || user.username;

  pendingForms.set(user.id, {
    data,
    sourceChannelInfo: channel ? { id: channel.id, name: channel.name } : null,
    ts: Date.now(),
  });

  await interaction
    .editReply({
      content: '✅ รับข้อมูลแล้ว (1/2)\nกดปุ่มด้านล่างเพื่อกรอกรายละเอียดปัญหาและแนบรูปครับ',
      components: [buildStep2Button()],
    })
    .catch(() => {});
  return true;
}

async function handleStep2Button(interaction) {
  const pending = getPending(interaction.user.id);
  if (!pending) {
    await interaction
      .reply({ content: '⌛ หมดเวลาหรือยังไม่ได้เริ่มฟอร์ม กรุณากดปุ่มแจ้งปัญหาเริ่มใหม่', flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return true;
  }
  try {
    await interaction.showModal(buildStep2Modal());
  } catch (err) {
    console.warn(`[supportForm] showModal(step2) failed: ${err.message}`);
    await interaction
      .reply({ content: '❌ เปิดหน้าต่างสเต็ป 2 ไม่สำเร็จ กรุณาลองใหม่', flags: MessageFlags.Ephemeral })
      .catch(() => {});
  }
  return true;
}

async function handleStep2Submit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  const pending = getPending(interaction.user.id);
  if (!pending) {
    await interaction.editReply({ content: '⌛ หมดเวลา กรุณาเริ่มกรอกฟอร์มใหม่' }).catch(() => {});
    return true;
  }
  pendingForms.delete(interaction.user.id);

  const user = interaction.user;
  const data = {
    ...pending.data,
    jailbreak: textField(interaction, FIELD_IDS.jailbreak).trim(),
    problem: textField(interaction, FIELD_IDS.problem).trim(),
  };
  const uploads = readUploads(interaction);
  const files = uploads.map((a) => new AttachmentBuilder(a.url, { name: a.name || 'image.png' }));

  const { message: postMsg, attemptedFiles, filesAttached } = await createPost({
    client: interaction.client,
    user,
    data,
    files,
    sourceChannelId: interaction.channelId,
  });

  const reqId = postMsg?.id || `${user.id}-${Date.now()}`;
  saveRequest(reqId, {
    ...data,
    userId: user.id,
    postId: postMsg?.id,
    status: 'pending',
    attachments: filesAttached ? uploads.map((a) => a.url) : [],
    sourceChannel: pending.sourceChannelInfo,
  });

  if (postMsg && attemptedFiles && !filesAttached) {
    await interaction
      .editReply({ content: '✅ ส่งข้อมูลแจ้งปัญหาแล้ว แต่แนบรูปไม่สำเร็จ (ไฟล์อาจใหญ่เกิน) ทีมงานจะรีบเข้าดูให้ครับ' })
      .catch(() => {});
  } else if (postMsg) {
    await interaction.editReply({ content: '✅ ส่งข้อมูลแจ้งปัญหาครบแล้ว ทีมงานจะรีบเข้าดูให้ครับ' }).catch(() => {});
  } else {
    await interaction.editReply({ content: '❌ สร้างโพสต์ไม่สำเร็จ กรุณาแจ้งทีมงาน' }).catch(() => {});
  }
  return true;
}

export async function handleSupportFormInteraction(interaction) {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === SUPPORT_OPEN_BTN) {
        if (!hasAllowedRole(interaction.member)) {
          await interaction
            .reply({ content: '❌ คุณไม่มีสิทธิ์ใช้ฟอร์มนี้', flags: MessageFlags.Ephemeral })
            .catch(() => {});
          return true;
        }
        try {
          await interaction.showModal(buildFormModal());
        } catch (err) {
          console.warn(`[supportForm] showModal failed: ${err.message}`);
          await interaction
            .reply({ content: '❌ เปิดฟอร์มไม่สำเร็จ กรุณากดปุ่มอีกครั้ง', flags: MessageFlags.Ephemeral })
            .catch(() => {});
        }
        return true;
      }

      if (interaction.customId === SUPPORT_STEP2_BTN) {
        return handleStep2Button(interaction);
      }

      if (interaction.customId === SUPPORT_CLOSE_BTN) {
        return handleClose(interaction);
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === SUPPORT_MODAL) {
      return handleStep1Submit(interaction);
    }

    if (interaction.isModalSubmit() && interaction.customId === SUPPORT_STEP2_MODAL) {
      return handleStep2Submit(interaction);
    }
  } catch (err) {
    console.warn(`[supportForm] interaction error: ${err.message}`);
    if (process.env.SUPPORT_FORM_DEBUG === 'true') console.warn(err.stack);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่' }).catch(() => {});
      } else if (interaction.isRepliable?.()) {
        await interaction
          .reply({ content: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่', flags: MessageFlags.Ephemeral })
          .catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }
  return false;
}
