import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWeChatItem,
  to12Hour,
  formatWeChatTranscript,
  buildWeChatPaste,
} from './wechat-paste.js';

const REAL_ITEMS = [
  '章攸\n2026年07月16日 17:08\n不想出去 整个人都脏乎乎的 在家吃\n\n',
  '章攸\n2026年07月16日 17:08\n这两天都没洗澡\n\n',
  '章攸\n2026年07月17日 00:43\n[语音通话]\n\n',
  '章攸\n2026年07月17日 00:54\n一直都好喜欢这张\n\n',
  '章攸\n2026年07月17日 00:54\n[图片] 微信图片_20260718050802_102425.jpg',
];

test('to12Hour covers morning/afternoon and midnight edge cases', () => {
  assert.equal(to12Hour(17, '08'), '下午5:08');
  assert.equal(to12Hour(0, '43'), '上午12:43');
  assert.equal(to12Hour(12, '00'), '下午12:00');
  assert.equal(to12Hour(9, '05'), '上午9:05');
});

test('parseWeChatItem parses sender/date/time/content', () => {
  const message = parseWeChatItem(REAL_ITEMS[0]);
  assert.deepEqual(message, {
    sender: '章攸',
    year: 2026,
    month: 7,
    day: 16,
    hour: 17,
    minute: '08',
    content: '不想出去 整个人都脏乎乎的 在家吃',
  });
});

test('parseWeChatItem rejects non-WeChat formats', () => {
  assert.equal(parseWeChatItem('随便一段文字'), null);
  assert.equal(parseWeChatItem('章攸\n没有日期行\n内容'), null);
});

test('buildWeChatPaste formats real multi-select samples', () => {
  const expected = [
    '"章攸"的聊天记录如下:',
    '',
    '',
    '—————  2026-7-16  —————',
    '',
    '章攸 下午5:08',
    '不想出去 整个人都脏乎乎的 在家吃',
    '',
    '章攸 下午5:08',
    '这两天都没洗澡',
    '',
    '—————  2026-7-17  —————',
    '',
    '章攸 上午12:43',
    '[语音通话]',
    '',
    '章攸 上午12:54',
    '一直都好喜欢这张',
    '',
    '章攸 上午12:54',
    '图片1（可在附件中查看）',
  ].join('\n');
  assert.equal(buildWeChatPaste(REAL_ITEMS), expected);
});

test('formatWeChatTranscript joins multiple senders with 和', () => {
  const items = [
    '章攸\n2026年07月15日 20:14\n就北京这边\n\n',
    'jimmy@Liftoff\n2026年07月15日 20:15\n没在北京报\n\n',
  ];
  const output = formatWeChatTranscript(items.map((item) => parseWeChatItem(item)!));
  assert.ok(output.startsWith('"章攸"和"jimmy@Liftoff"的聊天记录如下:'));
});

test('buildWeChatPaste returns null for ordinary clipboard text', () => {
  assert.equal(buildWeChatPaste(['就是一段普通文字']), null);
  assert.equal(buildWeChatPaste([]), null);
});
