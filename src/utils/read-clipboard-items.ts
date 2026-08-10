// Reads text/plain from every clipboard item. Paste events only expose the first
// item, while navigator.clipboard.read() returns all of them (e.g. iOS WeChat
// multi-select copy). Only available in secure contexts; returns null otherwise.
export async function readClipboardItemTexts(): Promise<string[] | null> {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const clipboard = navigator.clipboard as Clipboard & {
    read?: () => Promise<ClipboardItem[]>;
  };
  if (!clipboard || typeof clipboard.read !== 'function') {
    return null;
  }

  const items = await clipboard.read();
  const texts: string[] = [];
  for (const item of items) {
    if (!item.types.includes('text/plain')) {
      continue;
    }
    const blob = await item.getType('text/plain');
    texts.push(await blob.text());
  }
  return texts;
}
