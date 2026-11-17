// True when keyboard focus is in a field that takes text or a choice, so shortcuts must not fire.
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || EDITABLE_TAGS.has(target.tagName))
