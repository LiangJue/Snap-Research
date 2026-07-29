const KATEX_QUIRKS_WARNING =
  /typeof console !== "undefined" && console\.warn\("Warning: KaTeX doesn't work in quirks mode\. Make sure your " \+ "website has a suitable doctype\."\);/;

export function removeKatexQuirksModeWarning(source: string): string {
  return source.replace(KATEX_QUIRKS_WARNING, 'void 0;');
}
