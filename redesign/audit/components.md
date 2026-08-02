# Shared components batch — 29 files

Status: TODO — not yet audited. See `_TEMPLATE.md` for the per-view entry structure to follow.
Source: `webapp/src/components/` (excluding chat/, which is its own batch)
Known primitives already in place: Button.tsx, Modal.tsx, EmptyState.tsx, Skeleton.tsx,
InlineFeedback.tsx, ToggleSwitch.tsx, PasswordField.tsx, RichTextEditor.tsx, Icon.tsx/icons.tsx,
components/create/ (CreateModal + 4 panel forms, 711 lines — do not touch internals unless
audit specifically flags card-shell duplication inside them).
