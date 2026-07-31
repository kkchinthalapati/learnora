import { describe, expect, it } from "vitest";
import {
  ACTION_TAGS,
  decodeBase64UTF8,
  fenceUntrusted,
  restoreWidgets,
  stripActionTagBlocks,
  stripActionTags,
  widgetToken,
} from "./aiActionTags";

describe("stripActionTags", () => {
  it("defangs an opening and closing tag pair", () => {
    expect(stripActionTags("<SET_THEME>dark</SET_THEME>")).toBe(
      "(tag removed)dark(/tag removed)",
    );
  });

  it("is case-insensitive, matching the model's own inconsistent casing", () => {
    expect(stripActionTags("<set_theme>dark</set_theme>")).toBe(
      "(tag removed)dark(/tag removed)",
    );
  });

  it("defangs every tag in ACTION_TAGS", () => {
    for (const tag of ACTION_TAGS) {
      expect(stripActionTags(`<${tag}>x</${tag}>`)).toBe(
        "(tag removed)x(/tag removed)",
      );
    }
  });

  it("leaves ordinary text untouched", () => {
    expect(stripActionTags("Just a normal sentence.")).toBe(
      "Just a normal sentence.",
    );
  });

  it("returns an empty string for empty input", () => {
    expect(stripActionTags("")).toBe("");
    expect(stripActionTags(null)).toBe("");
    expect(stripActionTags(undefined)).toBe("");
  });
});

describe("fenceUntrusted", () => {
  it("strips action tags the same way stripActionTags does", () => {
    expect(fenceUntrusted("<NAVIGATE>settings</NAVIGATE>")).toBe(
      "(tag removed)settings(/tag removed)",
    );
  });

  it("neutralises a triple-quote fence so injected text can't close the block early", () => {
    expect(fenceUntrusted('end quote """ more instructions')).toBe(
      'end quote “”” more instructions',
    );
  });

  it("returns an empty string for empty input", () => {
    expect(fenceUntrusted("")).toBe("");
    expect(fenceUntrusted(null)).toBe("");
  });
});

describe("stripActionTagBlocks", () => {
  it("removes a complete tag block including its payload", () => {
    expect(stripActionTagBlocks("Sure! <ADD_TASK>Buy milk</ADD_TASK> Done.")).toBe(
      "Sure!  Done.",
    );
  });

  it("removes every occurrence, not just the first", () => {
    expect(
      stripActionTagBlocks(
        "<ADD_TASK>One</ADD_TASK> and <ADD_TASK>Two</ADD_TASK>",
      ),
    ).toBe(" and ");
  });

  it("leaves text with no tags untouched", () => {
    expect(stripActionTagBlocks("Nothing to see here.")).toBe(
      "Nothing to see here.",
    );
  });
});

describe("widgetToken / restoreWidgets", () => {
  it("round-trips a widget's real HTML back into rendered text", () => {
    const widgets = ['<div class="ai-widget">Added task: Buy milk</div>'];
    const rendered = `Sure! ${widgetToken(0)} Done.`;
    expect(restoreWidgets(rendered, widgets)).toBe(
      'Sure! <div class="ai-widget">Added task: Buy milk</div> Done.',
    );
  });

  it("resolves multiple tokens by index, not by order of appearance", () => {
    const widgets = ["<b>first</b>", "<b>second</b>"];
    const rendered = `${widgetToken(1)} then ${widgetToken(0)}`;
    expect(restoreWidgets(rendered, widgets)).toBe("<b>second</b> then <b>first</b>");
  });

  it("the token itself contains no HTML-significant characters", () => {
    expect(widgetToken(3)).not.toMatch(/[<>&]/);
  });

  it("drops a token with no matching widget rather than throwing", () => {
    expect(restoreWidgets(widgetToken(99), [])).toBe("");
  });
});

describe("decodeBase64UTF8", () => {
  it("round-trips plain ASCII", () => {
    expect(decodeBase64UTF8(btoa("hello world"))).toBe("hello world");
  });

  it("round-trips multi-byte UTF-8 characters atob() alone would mangle", () => {
    const text = "café — 日本語";
    const base64 = btoa(unescape(encodeURIComponent(text)));
    expect(decodeBase64UTF8(base64)).toBe(text);
  });
});
