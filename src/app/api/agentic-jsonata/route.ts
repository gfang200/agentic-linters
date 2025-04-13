import { NextResponse } from "next/server";
import OpenAI from "openai";
import jsonata from "jsonata";
import fs from "fs";
import path from "path";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface TestResult {
  example: any;
  passed: boolean;
  error?: string;
  output?: any;
}

interface Progress {
  passedExamples: any[];
  failedExamples: any[];
  successfulPatterns: string[];
  reasoning?: string;
  documentation?: string[];
}

interface Iteration {
  jsonata: string;
  results: TestResult[];
  documentation: string[];
  progress?: Progress;
}

interface RequestBody {
  jsonata: string;
  trueExamples: any[];
  falseExamples: any[];
  description: string;
}

async function testJsonata(
  jsonataStr: string,
  examples: any[],
  shouldPass: boolean
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const example of examples) {
    try {
      // First try to parse the JSONata expression
      let expression;
      try {
        expression = jsonata(jsonataStr);
      } catch (error) {
        const parseError =
          error instanceof Error
            ? error.message
            : typeof error === "object" && error !== null
            ? JSON.stringify(error)
            : String(error);
        throw new Error(`Invalid JSONata syntax: ${parseError}`);
      }

      // Then try to evaluate it
      let output;
      try {
        output = await expression.evaluate(example);
      } catch (error) {
        const evalError =
          error instanceof Error
            ? error.message
            : typeof error === "object" && error !== null
            ? JSON.stringify(error, Object.getOwnPropertyNames(error))
            : String(error);
        throw new Error(`Evaluation failed: ${evalError}`);
      }

      // Strict boolean check - only true/false values are valid
      const isTrue = output === true;
      const isFalse = output === false;

      if (!isTrue && !isFalse) {
        throw new Error(
          `Expression must return exactly true or false, got: ${JSON.stringify(
            output
          )}`
        );
      }

      const passed = (shouldPass && isTrue) || (!shouldPass && isFalse);

      results.push({
        example,
        passed,
        output,
      });
    } catch (error) {
      results.push({
        example,
        passed: false,
        error:
          error instanceof Error
            ? error.message
            : typeof error === "object" && error !== null
            ? JSON.stringify(error, Object.getOwnPropertyNames(error))
            : String(error),
      });
    }
  }

  return results;
}

async function loadJsonataDocumentation(docName: string): Promise<string> {
  try {
    const docPath = path.join(
      process.cwd(),
      "public",
      "jsonata_documentation",
      `${docName}.md`
    );
    if (!fs.existsSync(docPath)) {
      console.warn(`Documentation file not found: ${docName}.md`);
      return "";
    }
    const content = await fs.promises.readFile(docPath, "utf-8");
    if (!content) {
      console.warn(`Documentation file is empty: ${docName}.md`);
      return "";
    }
    return content;
  } catch (error) {
    console.error(`Failed to load documentation for ${docName}:`, error);
    return "";
  }
}

async function loadRelevantDocumentation(
  description: string,
  currentJsonata: string,
  trueExamples: any[],
  falseExamples: any[],
  existingDocs?: string[]
): Promise<{ documentation: string[]; relevantDocs: string }> {
  let documentation: string[] = [];
  let relevantDocs = "";

  if (!existingDocs) {
    const docRequestPrompt = `Which documentation files would help with: ${description}?

Available documentation files:
- using-nodejs.md
- using-browser.md
- string-functions.md
- sorting-grouping.md
- simple.md
- regex.md
- programming.md
- processing.md
- predicate.md
- path-operators.md
- overview.md
- other-operators.md
- object-functions.md
- numeric-operators.md
- numeric-functions.md
- higher-order-functions.md
- expressions.md
- embedding-extending.md
- date-time.md
- date-time-functions.md
- construction.md
- composition.md
- comparison-operators.md
- boolean-functions.md
- array-functions.md
- aggregation-functions.md
- boolean-operators.md

Current JSONata expression: ${currentJsonata}
Input examples:
True: ${JSON.stringify(trueExamples, null, 2)}
False: ${JSON.stringify(falseExamples, null, 2)}

IMPORTANT: Return your response as a JSON array of documentation file names (without the .md extension). For example: ["string-functions", "numeric-functions"]`;

    console.log(docRequestPrompt);

    const docRequest = await openai.chat.completions.create({
      messages: [{ role: "user", content: docRequestPrompt }],
      model: "o3-mini",
    });
    console.log("Doc request:", docRequest.choices[0].message.content);
    try {
      const requestedDocs = JSON.parse(
        docRequest.choices[0].message.content || "[]"
      );
      console.log("Requested docs:", requestedDocs);
      // Filter out any invalid documentation files
      documentation = requestedDocs.filter((docName: string) => {
        const docPath = path.join(
          process.cwd(),
          "public",
          "jsonata_documentation",
          `${docName}.md`
        );
        return fs.existsSync(docPath);
      });

      console.log("Loading documentation files:", documentation);
    } catch (error) {
      console.error("Error loading documentation:", error);
    }
  } else {
    documentation = existingDocs;
  }

  // Load documentation content
  for (const docName of documentation) {
    const docContent = await loadJsonataDocumentation(docName);
    if (docContent) {
      relevantDocs += `\n\n=== ${docName} Documentation ===\n${docContent}`;
    }
  }

  return { documentation, relevantDocs };
}

async function generateNextJsonata(
  currentJsonata: string,
  trueExamples: any[],
  falseExamples: any[],
  description: string,
  previousResults: TestResult[],
  progress?: Progress
): Promise<{ jsonata: string; documentation: string[] }> {
  console.log("Generating next JSONata expression...");


  const { documentation, relevantDocs } = await loadRelevantDocumentation(
    description,
    currentJsonata,
    trueExamples,
    falseExamples,
    progress?.documentation
  );

  // Build the messages array for the conversation
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are a JSONata expert. Write a JSONata expression that:
1. Satisfies: ${description}
2. Returns true/false for the given examples
3. Uses dot notation (.) for property access
4. Uses square brackets [] only for array indexing/predicates
5. Uses backticks (\`) for special property names

Input examples:
True: ${JSON.stringify(trueExamples, null, 2)}
False: ${JSON.stringify(falseExamples, null, 2)}`,
    },
  ];

  messages.push({
    role: "assistant",
    content: `Starting expression: ${currentJsonata}`,
  });

  messages.push({
    role: "user",
    content: `Previous results: ${JSON.stringify(previousResults, null, 2)}
${
  progress
    ? `
Progress:
- Passed: ${JSON.stringify(progress.passedExamples, null, 2)}
- Failed: ${JSON.stringify(progress.failedExamples, null, 2)}
- Patterns: ${progress.successfulPatterns.join(", ")}
${progress.reasoning ? `\nAnalysis: ${progress.reasoning}` : ""}
`
    : ""
}

${relevantDocs}

Write a new JSONata expression that:
1. Builds on the starting expression
2. Fixes failed examples
3. Maintains working patterns
4. Returns ONLY the expression`,
  });

  const completion = await openai.chat.completions.create({
    messages,
    model: "o3-mini",
  });

  const newJsonata = completion.choices[0].message.content?.trim() || "";

  return { jsonata: newJsonata, documentation };
}

async function generateReasoning(
  currentJsonata: string,
  allResults: TestResult[],
  progress: Progress,
  description: string
): Promise<string> {
  const { relevantDocs } = await loadRelevantDocumentation(
    description,
    currentJsonata,
    [], // No need for examples in reasoning
    [],
    progress.documentation
  );

  const prompt = `You are a JSONata expert. Analyze this JSONata expression and its results, focusing STRONGLY on using documented functions and methods:

Expression: ${currentJsonata}
Task: ${description}

Results:
${JSON.stringify(allResults, null, 2)}

Progress:
- Passed: ${JSON.stringify(progress.passedExamples, null, 2)}
- Failed: ${JSON.stringify(progress.failedExamples, null, 2)}
- Patterns: ${progress.successfulPatterns.join(", ")}

Available Documentation:
${relevantDocs}

Provide analysis that:
1. Identifies working parts and why they work
2. Explains failure reasons in detail
3. Suggests improvements by:
   - STRONGLY preferring documented functions and methods
   - Referencing specific documented functions that could help
   - Explaining how documented functions would solve the issues
4. Proposes next steps using documented approaches

IMPORTANT: Your suggestions MUST prioritize using documented functions and methods. If a documented function exists that could solve a problem, you MUST suggest it over any custom solution.`;

  const completion = await openai.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "o3-mini",
  });

  return completion.choices[0].message.content?.trim() || "";
}

export async function POST(request: Request) {
  try {
    const body: RequestBody = await request.json();
    const {
      jsonata: initialJsonata,
      trueExamples,
      falseExamples,
      description,
    } = body;

    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Start the agentic process in the background
    (async () => {
      try {
        let currentJsonata = initialJsonata;
        let allTestsPassed = false;
        let progress: Progress = {
          passedExamples: [],
          failedExamples: [],
          successfulPatterns: [],
          documentation: undefined,
        };

        // First iteration with the provided JSONata
        const { jsonata: firstJsonata, documentation } =
          await generateNextJsonata(
            initialJsonata,
            trueExamples,
            falseExamples,
            description,
            [],
            progress
          );
        currentJsonata = firstJsonata;
        progress.documentation = documentation;

        while (!allTestsPassed) {
          const trueResults = await testJsonata(
            currentJsonata,
            trueExamples,
            true
          );
          const falseResults = await testJsonata(
            currentJsonata,
            falseExamples,
            false
          );
          const allResults = [...trueResults, ...falseResults];

          // Update progress tracking
          progress.passedExamples = allResults
            .filter((r) => r.passed)
            .map((r) => r.example);
          progress.failedExamples = allResults
            .filter((r) => !r.passed)
            .map((r) => r.example);

          // Extract successful patterns from passed examples
          if (progress.passedExamples.length > 0) {
            const successfulPatterns = new Set<string>();
            for (const result of allResults) {
              if (result.passed) {
                const pattern = extractPatternFromJsonata(
                  currentJsonata,
                  result.example
                );
                if (pattern) {
                  successfulPatterns.add(pattern);
                }
              }
            }
            progress.successfulPatterns = Array.from(successfulPatterns);
          }

          // Only generate reasoning if there are failed tests
          if (progress.failedExamples.length > 0) {
            progress.reasoning = await generateReasoning(
              currentJsonata,
              allResults,
              progress,
              description
            );
          }

          const iteration: Iteration = {
            jsonata: currentJsonata,
            results: allResults,
            documentation: progress.documentation,
            progress,
          };

          // Send the iteration to the client
          await writer.write(
            encoder.encode(JSON.stringify({ iteration }) + "\n")
          );

          allTestsPassed = allResults.every((result) => result.passed);
          if (allTestsPassed) break;

          const { jsonata: nextJsonata } = await generateNextJsonata(
            currentJsonata,
            trueExamples,
            falseExamples,
            description,
            allResults,
            progress
          );
          currentJsonata = nextJsonata;
        }

        // Signal completion
        await writer.close();
      } catch (error) {
        console.error("Error in agentic process:", error);
        await writer.abort(error);
      }
    })();

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error in agentic JSONata:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : JSON.stringify(error) },
      { status: 500 }
    );
  }
}

// Helper function to extract patterns from successful JSONata expressions
function extractPatternFromJsonata(
  jsonata: string,
  example: any
): string | null {
  try {
    // Look for common patterns like path navigation, function calls, etc.
    const pathPattern = jsonata.match(/[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+/);
    if (pathPattern) return pathPattern[0];

    const functionPattern = jsonata.match(/\$[a-zA-Z0-9_]+\(/);
    if (functionPattern) return functionPattern[0].slice(0, -1);

    return null;
  } catch (error) {
    console.error("Error extracting pattern:", error);
    return null;
  }
}
