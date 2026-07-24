import test from 'node:test';
import assert from 'node:assert';

// Mock global document and window objects for ui.js
global.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => ({ classList: { add: () => {} }, appendChild: () => {}, setAttribute: () => {} }),
};

global.window = {
  addEventListener: () => {},
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  }
};

const { esc } = await import('../js/ui.js');

test('esc() security utility tests', async (t) => {
  await t.test('handles null and undefined', () => {
    assert.strictEqual(esc(null), '');
    assert.strictEqual(esc(undefined), '');
  });

  await t.test('returns normal strings unmodified', () => {
    assert.strictEqual(esc('hello world'), 'hello world');
    assert.strictEqual(esc('12345'), '12345');
    assert.strictEqual(esc('no special chars'), 'no special chars');
  });

  await t.test('escapes individual HTML characters', () => {
    assert.strictEqual(esc('&'), '&amp;');
    assert.strictEqual(esc('<'), '&lt;');
    assert.strictEqual(esc('>'), '&gt;');
    assert.strictEqual(esc('"'), '&quot;');
    assert.strictEqual(esc("'"), '&#39;');
  });

  await t.test('escapes complex HTML payloads', () => {
    assert.strictEqual(esc('<script>alert("XSS")</script>'), '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    assert.strictEqual(esc('<img src="x" onerror=\'alert(1)\'>'), '&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;');
    assert.strictEqual(esc('Tom & Jerry > The Rest'), 'Tom &amp; Jerry &gt; The Rest');
  });

  await t.test('handles non-string inputs', () => {
    assert.strictEqual(esc(123), '123');
    assert.strictEqual(esc(true), 'true');
    assert.strictEqual(esc(false), 'false');
    assert.strictEqual(esc({}), '[object Object]');
    assert.strictEqual(esc([1, 2, 3]), '1,2,3');
  });

  await t.test('escapes multiple occurrences of special characters', () => {
    assert.strictEqual(esc('&&&&'), '&amp;&amp;&amp;&amp;');
    assert.strictEqual(esc('<<<<'), '&lt;&lt;&lt;&lt;');
    assert.strictEqual(esc('""""'), '&quot;&quot;&quot;&quot;');
    assert.strictEqual(esc("''''"), '&#39;&#39;&#39;&#39;');
  });
});
