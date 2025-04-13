"use client";

import { useState } from "react";

interface Iteration {
  jsonata: string;
  results: Array<{
    example: any;
    passed: boolean;
    error?: string;
    output?: any;
  }>;
  documentation: string[];
}

export default function Home() {
  const [jsonata, setJsonata] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [shouldFireDescription, setShouldFireDescription] = useState<string>("");
  const [results, setResults] = useState<{
    trueExamples: any[];
    falseExamples: any[];
  } | null>(null);
  const [editableTrueExamples, setEditableTrueExamples] = useState<string[]>([]);
  const [editableFalseExamples, setEditableFalseExamples] = useState<string[]>([]);
  const [isEditingTrueExamples, setIsEditingTrueExamples] = useState<boolean[]>([]);
  const [isEditingFalseExamples, setIsEditingFalseExamples] = useState<boolean[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true);
  const [agenticIterations, setAgenticIterations] = useState<{
    iterations: Array<{
      jsonata: string;
      results: Array<{
        example: any;
        passed: boolean;
        error?: string;
        output?: any;
      }>;
      documentation: string[];
    }>;
  } | null>(null);
  const [showErrorsMap, setShowErrorsMap] = useState<{[key: string]: boolean}>({});
  const [isAgenticLoading, setIsAgenticLoading] = useState<boolean>(false);
  const [agenticController, setAgenticController] = useState<AbortController | null>(null);
  const [expandedIterations, setExpandedIterations] = useState<{[key: number]: boolean}>({});

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    // Clear existing tests and iterations
    setResults(null);
    setAgenticIterations(null);
    setEditableTrueExamples([]);
    setEditableFalseExamples([]);
    setIsEditingTrueExamples([]);
    setIsEditingFalseExamples([]);
    setExpandedIterations({});
    try {
      const res = await fetch("/api/openai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonata,
          output: JSON.parse(output),
          description: `The final JSONata should return true if ${shouldFireDescription}, otherwise it should return false`,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to get response");
      }

      const data = await res.json();
      setResults(data);
      // Initialize editable examples with stringified JSON
      setEditableTrueExamples(data.trueExamples.map((example: any) => JSON.stringify(example, null, 2)));
      setEditableFalseExamples(data.falseExamples.map((example: any) => JSON.stringify(example, null, 2)));
      // Initialize edit mode states
      setIsEditingTrueExamples(new Array(data.trueExamples.length).fill(false));
      setIsEditingFalseExamples(new Array(data.falseExamples.length).fill(false));
    } catch (error) {
      console.error("Error:", error);
      setError("Failed to process request. Please check your inputs.");
    } finally {
      setLoading(false);
    }
  };

  const handleAgenticSolve = async () => {
    if (!results) return;
    
    setIsAgenticLoading(true);
    setError("");
    setAgenticIterations({ iterations: [] });
    setShowErrorsMap({}); // Reset error visibility states
    
    const controller = new AbortController();
    setAgenticController(controller);
    
    try {
      const res = await fetch("/api/agentic-jsonata", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonata,
          trueExamples: results.trueExamples,
          falseExamples: results.falseExamples,
          description: `The final JSONata should return true if ${shouldFireDescription}, otherwise it should return false`,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error("Failed to get response");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader available");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const data = JSON.parse(chunk);
        
        setAgenticIterations(prev => ({
          iterations: [...(prev?.iterations || []), data.iteration]
        }));
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Agentic solving cancelled');
      } else {
        console.error("Error:", error);
        setError("Failed to process request. Please check your inputs.");
      }
    } finally {
      setIsAgenticLoading(false);
      setAgenticController(null);
    }
  };

  const handleCancelAgentic = () => {
    if (agenticController) {
      agenticController.abort();
    }
  };

  const toggleIteration = (index: number) => {
    setExpandedIterations(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const getIterationStats = (iteration: any) => {
    const totalTests = iteration.results.length;
    const passedTests = iteration.results.filter((r: any) => r.passed).length;
    const failedTests = totalTests - passedTests;
    const isSuccessful = failedTests === 0;
    return { totalTests, passedTests, failedTests, isSuccessful };
  };

  return (
    <div className="min-h-screen bg-[#faf9f5] dark:bg-[#1A1A1A] p-8">
      <main className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <span className="text-[#FF8A3C] text-2xl">{ }</span>
          <h1 className="text-2xl font-bold text-[#1A1A1A] dark:text-white">Archie Linter</h1>
        </div>
        
        <div className={`flex gap-8 ${agenticIterations ? 'grid grid-cols-2' : ''}`}>
          {/* Left Section - Inputs and Tests */}
          <div className="flex-1 space-y-8">
            <div className="bg-white dark:bg-[#2A2A2A] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">JSONata Expression</label>
                <textarea
                  value={jsonata}
                  onChange={(e) => setJsonata(e.target.value)}
                  className="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-xl font-mono bg-white dark:bg-[#2A2A2A] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#FF8A3C] focus:border-transparent transition-all outline-none"
                  rows={4}
                  placeholder={`Example: (
 $rubric_criteria := response.context.annotations.endpoint_GoldfishStrategy_2.annotations.rubric_items.response.criterias;
)`}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Output of the JSONata Expression</label>
                <textarea
                  value={output}
                  onChange={(e) => setOutput(e.target.value)}
                  className="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-xl font-mono bg-white dark:bg-[#2A2A2A] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#FF8A3C] focus:border-transparent transition-all outline-none"
                  rows={4}
                  placeholder={`Example: [{"criteria":"dfasdfasdfeee","category":"Objective","attributes":{"Category2":"Explicit","Label":"Aesthetics"}},{"criteria":"asdfasfeasfe","category":"Objective","attributes":{"Category2":"Implicit","Label":"Functionality"}}]`}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">The linter should fire if</label>
                <textarea
                  value={shouldFireDescription}
                  onChange={(e) => setShouldFireDescription(e.target.value)}
                  className="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-[#2A2A2A] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#FF8A3C] focus:border-transparent transition-all outline-none"
                  rows={2}
                  placeholder="Example: Any of the criteria are under 30 characters"
                />
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-[#1A1A1A] dark:bg-white text-white dark:text-[#1A1A1A] rounded-xl hover:bg-[#2A2A2A] dark:hover:bg-gray-100 disabled:bg-gray-300 dark:disabled:bg-gray-600 transition-all font-semibold cursor-pointer hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 disabled:cursor-not-allowed"
                >
                  {loading ? "Processing..." : "Generate Tests"}
                </button>

                <button
                  onClick={handleAgenticSolve}
                  disabled={isAgenticLoading || !results}
                  className="flex-1 px-6 py-3 bg-[#1A1A1A] dark:bg-white text-white dark:text-[#1A1A1A] rounded-xl hover:bg-[#2A2A2A] dark:hover:bg-gray-100 disabled:bg-gray-300 dark:disabled:bg-gray-600 transition-all font-semibold cursor-pointer hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 disabled:cursor-not-allowed"
                >
                  {isAgenticLoading ? "Solving..." : "Run Archie Linter"}
                </button>

                {isAgenticLoading && (
                  <button
                    onClick={handleCancelAgentic}
                    className="px-6 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all font-semibold cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-800">
                  {error}
                </div>
              )}
            </div>

            {results && (
              <div className="space-y-8">
                <button
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="w-full px-6 py-3 bg-white dark:bg-[#2A2A2A] text-gray-900 dark:text-white rounded-xl hover:bg-gray-50 dark:hover:bg-[#3A3A3A] border border-gray-200 dark:border-gray-700 transition-all font-semibold cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isCollapsed ? "Show Tests" : "Hide Tests"}
                </button>
                
                {!isCollapsed && (
                  <div className="bg-white dark:bg-[#2A2A2A] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 space-y-8">
                    <div>
                      <h2 className="text-xl font-medium mb-4 text-gray-900 dark:text-white">The Linter Should Fire When</h2>
                      <div className="space-y-4">
                        {editableTrueExamples.map((example, index) => (
                          <div key={index} className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                            <div className="flex justify-between items-start mb-2">
                              <h3 className="font-medium text-gray-900 dark:text-white">Test {index + 1}</h3>
                              <button
                                onClick={() => {
                                  const newEditingStates = [...isEditingTrueExamples];
                                  newEditingStates[index] = !newEditingStates[index];
                                  setIsEditingTrueExamples(newEditingStates);
                                }}
                                className="px-3 py-1 bg-[#F9F7F6] dark:bg-[#3A3A3A] text-gray-900 dark:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-[#4A4A4A] transition-all text-sm font-medium cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                              >
                                {isEditingTrueExamples[index] ? "View" : "Edit"}
                              </button>
                            </div>
                            {isEditingTrueExamples[index] ? (
                              <textarea
                                value={example}
                                onChange={(e) => {
                                  const newExamples = [...editableTrueExamples];
                                  newExamples[index] = e.target.value;
                                  setEditableTrueExamples(newExamples);
                                }}
                                className="w-full p-4 bg-transparent border-none focus:ring-0 font-mono text-gray-900 dark:text-gray-100 resize-y min-h-[100px]"
                              />
                            ) : (
                              <pre className="whitespace-pre-wrap text-gray-900 dark:text-gray-100 font-mono">
                                {example}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h2 className="text-xl font-medium mb-4 text-gray-900 dark:text-white">The Linter Should Not Fire When</h2>
                      <div className="space-y-4">
                        {editableFalseExamples.map((example, index) => (
                          <div key={index} className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                            <div className="flex justify-between items-start mb-2">
                              <h3 className="font-medium text-gray-900 dark:text-white">Test {index + 1}</h3>
                              <button
                                onClick={() => {
                                  const newEditingStates = [...isEditingFalseExamples];
                                  newEditingStates[index] = !newEditingStates[index];
                                  setIsEditingFalseExamples(newEditingStates);
                                }}
                                className="px-3 py-1 bg-[#F9F7F6] dark:bg-[#3A3A3A] text-gray-900 dark:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-[#4A4A4A] transition-all text-sm font-medium cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                              >
                                {isEditingFalseExamples[index] ? "View" : "Edit"}
                              </button>
                            </div>
                            {isEditingFalseExamples[index] ? (
                              <textarea
                                value={example}
                                onChange={(e) => {
                                  const newExamples = [...editableFalseExamples];
                                  newExamples[index] = e.target.value;
                                  setEditableFalseExamples(newExamples);
                                }}
                                className="w-full p-4 bg-transparent border-none focus:ring-0 font-mono text-gray-900 dark:text-gray-100 resize-y min-h-[100px]"
                              />
                            ) : (
                              <pre className="whitespace-pre-wrap text-gray-900 dark:text-gray-100 font-mono">
                                {example}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Section - Agentic Iterations */}
          {agenticIterations && (
            <div>
              <div className="bg-white dark:bg-[#2A2A2A] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-medium text-gray-900 dark:text-white">Agentic Iterations</h2>
                </div>
                {agenticIterations.iterations.map((iteration, index) => {
                  const stats = getIterationStats(iteration);
                  return (
                    <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <h3 className="font-medium text-gray-900 dark:text-white">Iteration {index + 1}</h3>
                          <span className={`px-2 py-1 rounded text-sm font-medium ${
                            stats.isSuccessful 
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" 
                              : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                          }`}>
                            {stats.passedTests}/{stats.totalTests} Tests Passed
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {stats.isSuccessful && (
                            <button
                              onClick={() => {
                                // Create a temporary textarea to copy to clipboard
                                const textarea = document.createElement('textarea');
                                textarea.value = iteration.jsonata;
                                document.body.appendChild(textarea);
                                textarea.select();
                                document.execCommand('copy');
                                document.body.removeChild(textarea);
                              }}
                              className="px-3 py-1 bg-[#F9F7F6] dark:bg-[#3A3A3A] text-gray-900 dark:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-[#4A4A4A] transition-all text-sm font-medium flex items-center gap-1 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Copy JSONata
                            </button>
                          )}
                          <button
                            onClick={() => toggleIteration(index)}
                            className="px-3 py-1 bg-[#F9F7F6] dark:bg-[#3A3A3A] text-gray-900 dark:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-[#4A4A4A] transition-all text-sm font-medium cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                          >
                            {expandedIterations[index] ? "Collapse" : "Expand"}
                          </button>
                        </div>
                      </div>
                      
                      {expandedIterations[index] && (
                        <div className="space-y-4">
                          <div className="p-4 bg-gray-50 dark:bg-gray-900/20 rounded-xl border border-gray-200 dark:border-gray-700">
                            <div className="flex justify-between items-center mb-2">
                              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Starting JSONata Expression</h4>
                            </div>
                            <pre className="overflow-x-auto p-2 bg-white dark:bg-[#2A2A2A] rounded-lg border border-gray-100 dark:border-gray-800 text-gray-900 dark:text-gray-100 font-mono text-sm">
                              {iteration.jsonata.trim()}
                            </pre>
                          </div>

                          {iteration.documentation.length > 0 && (
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                              <div className="flex justify-between items-center mb-2">
                                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Documentation Used</h4>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {iteration.documentation.map((doc, docIndex) => (
                                  <span
                                    key={docIndex}
                                    className="px-2 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 rounded-md text-xs font-medium"
                                  >
                                    {doc}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {iteration.results.map((result, resultIndex) => (
                            <div
                              key={resultIndex}
                              className={`p-4 rounded-xl border ${
                                result.passed 
                                  ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" 
                                  : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <span className={`font-medium ${
                                  result.passed 
                                    ? "text-green-700 dark:text-green-400" 
                                    : "text-red-700 dark:text-red-400"
                                }`}>
                                  {result.passed ? "✓ Passed" : "✗ Failed"}
                                </span>
                              </div>
                              {result.passed ? (
                                <div className="mt-2 space-y-2">
                                  <div>
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Input:</span>
                                    <pre className="text-sm whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                                      {JSON.stringify(result.example, null, 2)}
                                    </pre>
                                  </div>
                                  <div>
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Expected Output:</span>
                                    <pre className="text-sm whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                                      {result.passed ? "true" : "false"}
                                    </pre>
                                  </div>
                                  <div>
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Actual Output:</span>
                                    <pre className="text-sm whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                                      {JSON.stringify(result.output, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-2 space-y-2">
                                  <div>
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Input:</span>
                                    <pre className="text-sm whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                                      {JSON.stringify(result.example, null, 2)}
                                    </pre>
                                  </div>
                                  <div>
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Expected Output:</span>
                                    <pre className="text-sm whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                                      {result.passed ? "true" : "false"}
                                    </pre>
                                  </div>
                                  <div>
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Actual Output:</span>
                                    <pre className="text-sm whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                                      {JSON.stringify(result.output, null, 2)}
                                    </pre>
                                  </div>
                                  {result.error && (
                                    <div>
                                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Error:</span>
                                      <pre className="text-sm whitespace-pre-wrap break-words overflow-x-auto text-red-600 dark:text-red-400 font-mono max-w-full">
                                        {typeof result.error === 'string' 
                                          ? result.error
                                          : JSON.stringify(result.error, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {isAgenticLoading && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#FF8A3C] border-t-transparent"></div>
                      <span className="text-gray-700 dark:text-gray-300">Generating next iteration...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
