import { CopyButton } from './CopyButton';
import { highlightSql } from './sqlHighlight';

interface Props {
  source: string;
  language: string | null;
}

/** A fenced code block: scrolls sideways, copies, colours SQL. */
export function CodeBlock({ source, language }: Props) {
  // The fence's trailing newline would copy as an empty last line
  const text = source.replace(/\n$/, '');
  const sql = language === 'sql';
  return (
    <div className="code-block">
      <div className="code-block-bar">
        {language !== null && (
          <span className="code-block-lang">{language}</span>
        )}
        <CopyButton text={text} label="Copy code" className="code-copy" />
      </div>
      <pre tabIndex={0}>
        <code
          className={language === null ? undefined : `language-${language}`}
        >
          {sql
            ? highlightSql(text).map((token, index) =>
                token.kind === 'plain' ? (
                  token.text
                ) : (
                  <span key={index} className={`sql-${token.kind}`}>
                    {token.text}
                  </span>
                ),
              )
            : text}
        </code>
      </pre>
    </div>
  );
}
