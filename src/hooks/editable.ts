// True when keyboard focus is in a field that takes text or a choice, so shortcuts must not fire.
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || EDITABLE_TAGS.has(target.tagName))

// Enter is left alone on buttons, links and selects so a focused toolbar button still activates with Enter.
// Text fields are excluded earlier by isEditable.
const ACTIVATABLE_TAGS = new Set(['BUTTON', 'A', 'SELECT'])
export const isActivatable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && ACTIVATABLE_TAGS.has(target.tagName)
