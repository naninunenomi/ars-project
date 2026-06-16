'use client';
import { useEffect } from 'react';

export default function MermaidInit() {
  useEffect(() => {
    // Dynamically load mermaid to avoid SSR issues
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js';
    script.async = true;
    script.onload = () => {
      // @ts-ignore
      if (window.mermaid) {
        // @ts-ignore
        window.mermaid.initialize({ startOnLoad: false });
        // @ts-ignore
        window.mermaid.init(undefined, document.querySelectorAll('.mermaid'));
      }
    };
    document.body.appendChild(script);
    
    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  return null;
}
