'use client';

import { useState } from 'react';

export default function CopyButton({ text, label = 'Copy changelog' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; the text is still visible in the release notes below.
    }
  }

  return (
    <button type="button" className="btn" onClick={copy}>
      {copied ? 'Copied' : label}
    </button>
  );
}
