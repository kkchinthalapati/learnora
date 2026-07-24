import test from 'node:test';
import assert from 'node:assert';

/* Minimal DOM stand-in — just enough for ModalManager. The real fix being
   guarded here is that closing a panel always hides it and always releases
   exactly one scroll lock, however it was opened. */
function makeElement(id) {
  const classes = new Set(['hidden']);
  return {
    id,
    focused: 0,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    querySelectorAll: () => [],
    focus() { this.focused++; },
    addEventListener: () => {},
    removeEventListener: () => {},
    _classes: classes,
  };
}

const elements = new Map();

global.document = {
  getElementById: (id) => elements.get(id) || null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => ({ classList: { add: () => {} }, appendChild: () => {}, setAttribute: () => {} }),
  activeElement: null,
  body: { style: {} },
};

global.window = {
  addEventListener: () => {},
  localStorage: { getItem: () => null, setItem: () => {} },
};

global.requestAnimationFrame = (fn) => fn();

const { ModalManager } = await import('../js/ui.js');

function reset() {
  elements.clear();
  elements.set('panel', makeElement('panel'));
  document.body.style.overflow = '';
  // Drain any state a previous test left behind.
  for (let i = 0; i < 10; i++) ModalManager.closeTop();
  document.body.style.overflow = '';
}

test('open() then close() hides the panel and releases the scroll lock', () => {
  reset();
  const panel = elements.get('panel');

  ModalManager.open('panel');
  assert.strictEqual(panel.classList.contains('hidden'), false, 'panel should be visible');
  assert.strictEqual(document.body.style.overflow, 'hidden', 'scroll should be locked');

  ModalManager.close('panel');
  assert.strictEqual(panel.classList.contains('hidden'), true, 'panel should be hidden');
  assert.strictEqual(document.body.style.overflow, '', 'scroll lock should be released');
});

test('close() hides a panel that was never opened through the manager', () => {
  reset();
  const panel = elements.get('panel');

  // Something showed the panel directly, so it is not on the modal stack.
  panel.classList.remove('hidden');
  assert.strictEqual(panel.classList.contains('hidden'), false);

  ModalManager.close('panel');
  assert.strictEqual(
    panel.classList.contains('hidden'),
    true,
    'a close button must never be a no-op — this is the AI panel ✖ bug',
  );
});

test('repeated open/close cycles do not accumulate scroll locks', () => {
  reset();

  for (let i = 0; i < 5; i++) {
    ModalManager.open('panel');
    ModalManager.close('panel');
  }

  assert.strictEqual(
    document.body.style.overflow,
    '',
    'body scroll must be usable again after cycling the panel',
  );
});

test('isOpen() tracks the stack across a cycle', () => {
  reset();
  assert.strictEqual(ModalManager.isOpen('panel'), false);
  ModalManager.open('panel');
  assert.strictEqual(ModalManager.isOpen('panel'), true);
  ModalManager.close('panel');
  assert.strictEqual(ModalManager.isOpen('panel'), false);
});
