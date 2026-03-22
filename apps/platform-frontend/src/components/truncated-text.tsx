import { useState } from 'react';

interface TruncatedTextProps {
  text: string;
  maxLength?: number;
  className?: string;
}

export function TruncatedText({ text, maxLength = 300, className = '' }: TruncatedTextProps) {
  const [expanded, setExpanded] = useState(false);
  
  if (!text || text.length <= maxLength) {
    return <span className={className}>{text}</span>;
  }
  
  const truncatedText = expanded ? text : text.slice(0, maxLength) + '...';
  
  return (
    <span className={className}>
      <span className="whitespace-pre-wrap inline">
        {truncatedText}
      </span>
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="ml-1 text-sm text-[var(--accent-9)] hover:text-[var(--accent-10)] hover:underline cursor-pointer"
          type="button"
        >
          Show more
        </button>
      )}
      {expanded && (
        <button
          onClick={() => setExpanded(false)}
          className="ml-1 text-sm text-[var(--accent-9)] hover:text-[var(--accent-10)] hover:underline cursor-pointer"
          type="button"
        >
          Show less
        </button>
      )}
    </span>
  );
}