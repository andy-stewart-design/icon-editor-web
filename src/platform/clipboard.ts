// Rejects when the Clipboard API is missing (for example in a non-secure context) or the write is refused.
// The caller decides what to show; nothing is swallowed here.
export async function writeClipboardText(text: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    throw new Error('Clipboard API is unavailable')
  }
  await navigator.clipboard.writeText(text)
}
