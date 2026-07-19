import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Split out from Markdown.tsx so `react-syntax-highlighter` (Prism + refractor +
// its language grammars and theme styles — a large slice of the old main bundle)
// is only fetched when a fenced code block actually needs highlighting, instead of
// on chat first paint.
type HighlightedCodeProps = {
  language: string;
  isDarkMode: boolean;
  children: string;
};

export default function HighlightedCode({ language, isDarkMode, children }: HighlightedCodeProps) {
  return (
    <SyntaxHighlighter
      language={language}
      style={isDarkMode ? oneDark : oneLight}
      customStyle={{
        margin: 0,
        borderRadius: '0.75rem',
        fontSize: '0.875rem',
        padding: language && language !== 'text' ? '2rem 1rem 1rem 1rem' : '1rem',
        // ChatGPT-style soft grey block in light mode; keep oneDark's own bg in dark.
        ...(isDarkMode ? {} : { background: 'hsl(var(--muted))' }),
      }}
      codeTagProps={{
        style: {
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          ...(isDarkMode ? {} : { background: 'transparent' }),
        },
      }}
    >
      {children}
    </SyntaxHighlighter>
  );
}
