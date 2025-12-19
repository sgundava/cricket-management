import { useState } from 'react';
import { useGameStore } from '../store/gameStore';

export const DebugButton = () => {
  const [copied, setCopied] = useState(false);
  const { exportForBugReport } = useGameStore();

  const handleCopy = async () => {
    try {
      const data = exportForBugReport();
      await navigator.clipboard.writeText(data);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback: create a temporary textarea and copy
      const textarea = document.createElement('textarea');
      textarea.value = exportForBugReport();
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`fixed bottom-20 right-4 z-50 w-10 h-10 rounded-full shadow-lg
        flex items-center justify-center transition-all duration-200
        ${copied
          ? 'bg-green-600 scale-110'
          : 'bg-gray-700 hover:bg-gray-600'
        }`}
      title="Copy game state for bug report"
    >
      {copied ? (
        <span className="text-white text-sm">OK</span>
      ) : (
        <span className="text-lg">📋</span>
      )}
    </button>
  );
};
