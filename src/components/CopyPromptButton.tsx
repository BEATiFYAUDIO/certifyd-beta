'use client';

import React, { useState } from 'react';

export function CopyPromptButton({ value, label = 'Copy AI Prompt' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="button primary" data-copy-value={value} onClick={async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }}>{copied ? 'Copied' : label}</button>;
}
