import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { runBatchSimulation, generateReport } from '../engine/matchSimulator';

// Expose simulation functions globally for console access
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).runSimulation = (count = 100) => {
    console.log(`\nRunning ${count} match simulation...\n`);
    const results = runBatchSimulation(count);
    console.log(generateReport(results));
    return results;
  };
  (window as unknown as Record<string, unknown>).quickTest = () => {
    console.log('\nRunning quick 50-match test...\n');
    const results = runBatchSimulation(50);
    console.log(generateReport(results));
    return results;
  };
}

export const DebugButton = () => {
  const [copied, setCopied] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simResults, setSimResults] = useState<string | null>(null);
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

  const runSimulation = async (matchCount: number) => {
    setSimulating(true);
    setSimResults(null);

    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(() => {
      try {
        const results = runBatchSimulation(matchCount);
        const report = generateReport(results);
        setSimResults(report);
      } catch (err) {
        setSimResults(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setSimulating(false);
      }
    }, 50);
  };

  return (
    <>
      {/* Main debug button */}
      <button
        onClick={handleCopy}
        onContextMenu={(e) => {
          e.preventDefault();
          setShowPanel(true);
        }}
        className={`fixed bottom-20 right-4 z-50 w-10 h-10 rounded-full shadow-lg
          flex items-center justify-center transition-all duration-200
          ${copied
            ? 'bg-green-600 scale-110'
            : 'bg-gray-700 hover:bg-gray-600'
          }`}
        title="Click to copy state | Right-click for simulation"
      >
        {copied ? (
          <span className="text-white text-sm">OK</span>
        ) : (
          <span className="text-lg">📋</span>
        )}
      </button>

      {/* Simulation panel */}
      {showPanel && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
          <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-lg font-bold text-white">Match Engine Simulator</h2>
              <button
                onClick={() => setShowPanel(false)}
                className="text-gray-400 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-4 flex-1 overflow-auto">
              {!simResults ? (
                <div className="space-y-4">
                  <p className="text-gray-300 text-sm">
                    Run batch simulations to validate the match engine produces realistic T20 statistics.
                  </p>

                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => runSimulation(50)}
                      disabled={simulating}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg font-medium"
                    >
                      Quick (50)
                    </button>
                    <button
                      onClick={() => runSimulation(200)}
                      disabled={simulating}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg font-medium"
                    >
                      Standard (200)
                    </button>
                    <button
                      onClick={() => runSimulation(500)}
                      disabled={simulating}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg font-medium"
                    >
                      Full (500)
                    </button>
                  </div>

                  {simulating && (
                    <div className="text-center py-8">
                      <div className="text-4xl animate-bounce">🏏</div>
                      <p className="text-gray-400 mt-2">Simulating matches...</p>
                    </div>
                  )}

                  <div className="bg-gray-700/50 rounded p-3 text-xs text-gray-400">
                    <p className="font-medium text-gray-300 mb-1">Console Access:</p>
                    <code className="text-green-400">runSimulation(100)</code> - Run N matches<br />
                    <code className="text-green-400">quickTest()</code> - Quick 50-match test
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <pre className="bg-gray-900 p-4 rounded text-xs text-gray-300 overflow-auto max-h-96 font-mono whitespace-pre">
                    {simResults}
                  </pre>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setSimResults(null)}
                      className="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-2 px-4 rounded-lg"
                    >
                      Run Again
                    </button>
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(simResults);
                      }}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg"
                    >
                      Copy Report
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
