// markdown-lite (Task 11): a deliberately tiny markdown renderer for skill
// SKILL.md bodies. Only `#` headings, `-` list items, `code`, **bold** and
// fenced pre blocks are supported; everything else becomes a <p>.
//
// XSS contract (hard requirement): the input is HTML-escaped FIRST (& < > " ')
// and the markup markers are applied to the escaped text only, so the only
// tags that can ever appear in the output are the ones this module emits
// (<h2>/<ul>/<li>/<p>/<code>/<b>/<pre>). Callers may therefore feed the
// result to dangerouslySetInnerHTML safely — never render unescaped input.

/** HTML-escape the five characters that terminate markup. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Apply the inline markers (bold then code) to already-escaped text. */
function inline(escaped: string): string {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/**
 * Render markdown-lite source to HTML. Escape first, then split into lines:
 * `#`/`##` headings → <h2>, `- ` items → <ul><li>, fenced ``` blocks → <pre>
 * (content stays escaped and unprocessed), blank lines are dropped, and any
 * other line becomes a <p>. Always safe for dangerouslySetInnerHTML.
 */
export function markdownLite(text: string): string {
  const escaped = escapeHtml(text);
  const lines = escaped.split('\n');
  const out: string[] = [];
  let inPre = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      out.push(inPre ? '</pre>' : '<pre>');
      inPre = !inPre;
      continue;
    }
    if (inPre) {
      out.push(line);
      continue;
    }
    const heading = /^#{1,6} (.*)$/.exec(line);
    if (heading !== null) {
      out.push(`<h2>${inline(heading[1])}</h2>`);
      continue;
    }
    const item = /^- (.*)$/.exec(line);
    if (item !== null) {
      out.push(`<ul><li>${inline(item[1])}</li></ul>`);
      continue;
    }
    if (line.trim() === '') continue;
    out.push(`<p>${inline(line)}</p>`);
  }

  // An unterminated fence still gets closed so the block never leaks markup.
  if (inPre) out.push('</pre>');

  return out.join('\n');
}
