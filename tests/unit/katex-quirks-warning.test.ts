import { describe, expect, it } from 'vitest';

import { removeKatexQuirksModeWarning } from '../../build/katex-quirks-warning';

describe('removeKatexQuirksModeWarning', () => {
  it('removes the KaTeX import-time warning without changing its quirks-mode render guard', () => {
    const source = `
if (typeof document !== "undefined") {
  if (document.compatMode !== "CSS1Compat") {
    typeof console !== "undefined" && console.warn("Warning: KaTeX doesn't work in quirks mode. Make sure your " + "website has a suitable doctype.");
    render = function render() {
      throw new ParseError("KaTeX doesn't work in quirks mode.");
    };
  }
}`;

    const transformed = removeKatexQuirksModeWarning(source);

    expect(transformed).not.toContain("Warning: KaTeX doesn't work in quirks mode");
    expect(transformed).toContain('render = function render()');
    expect(transformed).toContain('throw new ParseError("KaTeX doesn\'t work in quirks mode.")');
  });
});
