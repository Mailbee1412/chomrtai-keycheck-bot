import { getOptionLabel, buildMentionString, SUPPORT_NOTE, SUPPORT_CLOSED_NOTE } from './constants.js';

const DIVIDER = '✧ ───────────── ✧';
const BULLET = '◦ ';

// ข้อความแผงหน้า (โพสต์ที่มีปุ่มแจ้งปัญหา) — เป็นข้อความธรรมดา ไม่ใช้ embed
export function buildSupportFormContent() {
  return [
    '✦ แจ้งปัญหาการใช้งาน ✦',
    'BUG REPORT · SUPPORT CENTER',
    '',
    DIVIDER,
    '',
    '✦ วิธีใช้งาน',
    `${BULLET}กดปุ่มด้านล่างเพื่อกรอกฟอร์มแจ้งปัญหาได้เลย`,
    `${BULLET}กรอกข้อมูลครบถ้วนจะช่วยให้ติดตามและช่วยเหลือได้เร็วขึ้น`,
    `${BULLET}กรอกจบในหน้าเดียว พร้อมแนบรูปได้ทันทีหลังส่ง`,
    '',
    DIVIDER,
    '',
    '✦ หมายเหตุ',
    SUPPORT_NOTE,
    '',
    DIVIDER,
    '',
    'ขอบคุณสำหรับการแจ้งปัญหา ♡',
  ].join('\n');
}

// ข้อความแจ้งเตือนที่ส่งเป็นคอมเมนต์ในโพสต์เมื่อปิดเคส
export function buildClosedNotice() {
  return SUPPORT_CLOSED_NOTE;
}

const STATUS_TEXT = {
  pending: 'รอตรวจสอบ',
  'in-progress': 'กำลังดำเนินการ',
  resolved: 'แก้ไขแล้ว',
  closed: 'ปิดเคส',
};

const CONTENT_LIMIT = 2000;

// ข้อความโพสต์เคส — เทมเพลต SUPPORT CENTER (ตัดความยาวรวมไม่ให้เกิน 2000 ตัวอักษรของ Discord)
export function buildSupportPostContent({ user, data = {}, status = 'pending', notifyRoleIds = [] }) {
  const problem = data.problem?.trim() || '';
  const note = data.statusNote?.trim() || '';

  const build = (pText, nText) => {
    const lines = [];
    const mentions = buildMentionString(notifyRoleIds);
    if (mentions) lines.push(mentions, '');

    lines.push('✦ แจ้งปัญหาการใช้งาน ✦', 'BUG REPORT · SUPPORT CENTER', '', DIVIDER, '');
    lines.push('✦ ข้อมูลผู้แจ้ง');
    lines.push(`${BULLET}ผู้แจ้ง : <@${user?.id}>`);
    lines.push(`${BULLET}ช่องทางการใช้งาน : ` + (getOptionLabel('channel', data.channel) || '—'));
    lines.push(`${BULLET}วิธีเปิด : ` + (getOptionLabel('launch', data.launch) || '—'));
    lines.push(`${BULLET}อุปกรณ์ : ` + (getOptionLabel('device', data.device) || '—'));
    lines.push('');
    lines.push('✦ ข้อมูลระบบ');
    lines.push(`${BULLET}โมเดล : ` + (data.model || '—'));
    lines.push(`${BULLET}Jailbreak : ` + (data.jailbreak || '—'));

    if (pText) lines.push('', '✦ รายละเอียดปัญหา', `${BULLET}${pText}`);
    if (nText) lines.push('', '✦ หมายเหตุทีมงาน', `${BULLET}${nText}`);

    lines.push('', '✦ หมายเหตุ', SUPPORT_NOTE);

    lines.push('', DIVIDER, '');
    lines.push(`✦ สถานะ : 「 ${STATUS_TEXT[status] || STATUS_TEXT.pending} 」`, '');
    lines.push('ขอบคุณสำหรับการแจ้งปัญหา ♡');
    return lines.join('\n');
  };

  let pText = problem;
  let nText = note;

  if (build(pText, nText).length > CONTENT_LIMIT) {
    let budget = CONTENT_LIMIT - build('', '').length;
    const P_OVERHEAD = ('\n\n✦ รายละเอียดปัญหา\n' + BULLET).length;
    const N_OVERHEAD = ('\n\n✦ หมายเหตุทีมงาน\n' + BULLET).length;

    if (problem) {
      pText = problem.slice(0, Math.max(0, budget - P_OVERHEAD));
      budget -= P_OVERHEAD + pText.length;
    }
    if (note) {
      nText = note.slice(0, Math.max(0, budget - N_OVERHEAD));
    }
  }

  return build(pText, nText);
}
