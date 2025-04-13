"use client";

import { useState } from "react";

export default function Home() {
  const [jsonata, setJsonata] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [results, setResults] = useState<{
    trueExamples: any[];
    falseExamples: any[];
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/openai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonata,
          output: JSON.parse(output),
          description,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to get response");
      }

      const data = await res.json();
      setResults(data);
    } catch (error) {
      console.error("Error:", error);
      setError("Failed to process request. Please check your inputs.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8">
      <main className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-8">JSONata Validator</h1>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">JSONata Expression</label>
            <textarea
              value={jsonata}
              onChange={(e) => setJsonata(e.target.value)}
              className="w-full p-2 border rounded-md font-mono"
              rows={4}
              placeholder="Enter your JSONata expression"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Example Output</label>
            <textarea
              value={output}
              onChange={(e) => setOutput(e.target.value)}
              className="w-full p-2 border rounded-md font-mono"
              rows={4}
              placeholder="Enter the example output JSON"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description of Intended Output</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2 border rounded-md"
              rows={4}
              placeholder="Describe when the expression should return true or false"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-400"
          >
            {loading ? "Processing..." : "Generate Examples"}
          </button>

          {error && (
            <div className="p-4 bg-red-100 text-red-700 rounded-md">
              {error}
            </div>
          )}

          {results && (
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-semibold mb-4">True Examples</h2>
                <div className="space-y-4">
                  {results.trueExamples.map((example, index) => (
                    <div key={index} className="p-4 bg-green-50 rounded-md">
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(example, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4">False Examples</h2>
                <div className="space-y-4">
                  {results.falseExamples.map((example, index) => (
                    <div key={index} className="p-4 bg-red-50 rounded-md">
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(example, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
