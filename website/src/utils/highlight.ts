import { createHighlighter, type Highlighter } from 'shiki';

let highlighter: Highlighter | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ['github-dark-dimmed'],
      langs: ['markdown', 'json', 'shellscript', 'clojure'],
    });
  }
  return highlighter;
}

const extToLang: Record<string, string> = {
  '.md': 'markdown',
  '.json': 'json',
  '.sh': 'shellscript',
  '.clj': 'clojure',
  '.cljc': 'clojure',
};

/** Highlight source code, returning an HTML string. */
export async function highlightCode(code: string, filename: string): Promise<string> {
  const ext = filename.slice(filename.lastIndexOf('.'));
  const lang = extToLang[ext] ?? 'markdown';
  const hl = await getHighlighter();

  return hl.codeToHtml(code, {
    lang,
    theme: 'github-dark-dimmed',
  });
}
