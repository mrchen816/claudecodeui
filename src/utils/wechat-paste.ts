// Preprocesses WeChat "multi-select copy" clipboard items.
//
// On iOS, copying multiple WeChat messages puts each message in its own
// clipboard item:
//   sender\n2026年07月16日 17:08\nbody\n\n
// navigator.clipboard.read() returns all items (paste events only expose the first).

export const DIVIDER_DASH = '—————';

const DATETIME_RE = /^(\d{4})年(\d{2})月(\d{2})日\s+(\d{1,2}):(\d{2})$/;

export type WeChatMessage = {
  sender: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: string;
  content: string;
};

export function parseWeChatItem(text: string): WeChatMessage | null {
  if (typeof text !== 'string') return null;
  const lines = text.split('\n');
  if (lines.length < 3) return null;
  const sender = lines[0].trim();
  const match = DATETIME_RE.exec(lines[1].trim());
  if (!sender || !match) return null;
  const content = lines.slice(2).join('\n').replace(/\s+$/, '');
  if (!content) return null;
  return {
    sender,
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: match[5],
    content,
  };
}

export function to12Hour(hour: number, minute: string): string {
  const period = hour < 12 ? '上午' : '下午';
  let hour12 = hour % 12;
  if (hour12 === 0) hour12 = 12;
  return `${period}${hour12}:${minute}`;
}

function joinNames(names: string[]): string {
  const quoted = names.map((name) => `"${name}"`);
  if (quoted.length <= 1) return quoted.join('');
  return `${quoted.slice(0, -1).join('、')}和${quoted[quoted.length - 1]}`;
}

export function formatWeChatTranscript(messages: WeChatMessage[]): string {
  const senders: string[] = [];
  for (const message of messages) {
    if (!senders.includes(message.sender)) {
      senders.push(message.sender);
    }
  }
  const header = `${joinNames(senders)}的聊天记录如下:`;

  const blocks: string[] = [];
  let currentDate: string | null = null;
  let imageCount = 0;
  for (const message of messages) {
    const dateKey = `${message.year}-${message.month}-${message.day}`;
    if (dateKey !== currentDate) {
      currentDate = dateKey;
      blocks.push(`${DIVIDER_DASH}  ${message.year}-${message.month}-${message.day}  ${DIVIDER_DASH}`);
    }
    let content = message.content;
    if (/^\[图片\]/.test(content)) {
      imageCount += 1;
      content = `图片${imageCount}（可在附件中查看）`;
    }
    blocks.push(`${message.sender} ${to12Hour(message.hour, message.minute)}\n${content}`);
  }

  return `${header}\n\n\n${blocks.join('\n\n')}`;
}

export function buildWeChatPaste(itemTexts: string[]): string | null {
  if (!Array.isArray(itemTexts)) return null;
  const nonEmpty = itemTexts.filter((text) => typeof text === 'string' && text.trim());
  const messages = nonEmpty.map(parseWeChatItem).filter((message): message is WeChatMessage => message !== null);
  if (messages.length < 2) return null;
  if (messages.length < nonEmpty.length * 0.6) return null;
  return formatWeChatTranscript(messages);
}
