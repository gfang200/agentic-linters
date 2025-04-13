import { NextResponse } from "next/server";
import OpenAI from "openai";
import jsonata from "jsonata";
import fs from 'fs';
import path from 'path';

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
  documentation: string[];
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

async function testJsonata(jsonataStr: string, examples: any[], shouldPass: boolean): Promise<TestResult[]> {
  console.log('\n=== Starting testJsonata ===');
  console.log('JSONata expression:', jsonataStr);
  console.log('Should pass:', shouldPass);
  console.log('Number of examples:', examples.length);
  
  const results: TestResult[] = [];
  
  for (const example of examples) {
    console.log('\n--- Testing example ---');
    console.log('Example:', JSON.stringify(example, null, 2));
    
    try {
      // First try to parse the JSONata expression
      let expression;
      try {
        console.log('Parsing JSONata expression...');
        expression = jsonata(jsonataStr);
        console.log('Successfully parsed JSONata');
      } catch (error) {
        console.error('Failed to parse JSONata:', error);
        const parseError = error instanceof Error ? error.message : 
          typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error);
        throw new Error(`Invalid JSONata syntax: ${parseError}`);
      }
      
      // Then try to evaluate it
      let output;
      try {
        console.log('Evaluating expression...');
        output = await expression.evaluate(example);
        console.log('Evaluation result:', output);
      } catch (error) {
        console.error('Failed to evaluate expression:', error);
        const evalError = error instanceof Error ? error.message : 
          typeof error === 'object' && error !== null ? 
            JSON.stringify(error, Object.getOwnPropertyNames(error)) : 
            String(error);
        throw new Error(`Evaluation failed: ${evalError}`);
      }
      
      // Strict boolean check - only true/false values are valid
      const isTrue = output === true;
      const isFalse = output === false;
      
      if (!isTrue && !isFalse) {
        throw new Error(`Expression must return exactly true or false, got: ${JSON.stringify(output)}`);
      }
      
      const passed = (shouldPass && isTrue) || (!shouldPass && isFalse);
      console.log('Test passed:', passed);
      
      results.push({
        example,
        passed,
        output,
      });
    } catch (error) {
      console.error('Test failed with error:', {
        expression: jsonataStr,
        example,
        error: error instanceof Error ? error.message : String(error)
      });
      
      results.push({
        example,
        passed: false,
        error: error instanceof Error ? error.message : 
          typeof error === 'object' && error !== null ? 
            JSON.stringify(error, Object.getOwnPropertyNames(error)) : 
            String(error),
      });
    }
  }
  
  console.log('\n=== testJsonata Results ===');
  console.log('Number of passes:', results.filter(r => r.passed).length);
  console.log('Number of failures:', results.filter(r => !r.passed).length);
  
  return results;
}

async function loadJsonataDocumentation(docName: string): Promise<string> {
  try {
    const docPath = path.join(process.cwd(), 'public', 'jsonata_documentation', `${docName}.md`);
    return fs.promises.readFile(docPath, 'utf-8');
  } catch (error) {
    console.error(`Failed to load documentation for ${docName}:`, error);
    return '';
  }
}

async function generateNextJsonata(
  currentJsonata: string,
  trueExamples: any[],
  falseExamples: any[],
  description: string,
  previousResults: TestResult[],
  progress?: Progress
): Promise<{ jsonata: string; documentation: string[] }> {
  console.log('\n=== Starting generateNextJsonata ===');
  console.log('Current JSONata:', currentJsonata);
  console.log('Description:', description);
  console.log('Previous results:', JSON.stringify(previousResults, null, 2));
  console.log('Progress:', JSON.stringify(progress, null, 2));

  // Load documentation only once per task
  let documentation: string[] = [];
  let relevantDocs = '';
  if (!progress?.documentation) {
    const docRequestPrompt = `Which documentation files would help with: ${description}?`;
    const docRequest = await openai.chat.completions.create({
      messages: [{ role: "user", content: docRequestPrompt }],
      model: "o3-mini",
    });

    try {
      documentation = JSON.parse(docRequest.choices[0].message.content || '[]');
      for (const docName of documentation) {
        const docContent = await loadJsonataDocumentation(docName);
        if (docContent) {
          relevantDocs += `\n\n=== ${docName} Documentation ===\n${docContent}`;
        }
      }
    } catch (error) {
      console.error('Error loading documentation:', error);
    }
  } else {
    documentation = progress.documentation;
  }

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
False: ${JSON.stringify(falseExamples, null, 2)}`
    }
  ];

  messages.push({
    role: "assistant",
    content: `Starting expression: ${currentJsonata}`
  });

  messages.push({
    role: "user",
    content: `Previous results: ${JSON.stringify(previousResults, null, 2)}
${progress ? `
Progress:
- Passed: ${JSON.stringify(progress.passedExamples, null, 2)}
- Failed: ${JSON.stringify(progress.failedExamples, null, 2)}
- Patterns: ${progress.successfulPatterns.join(', ')}
${progress.reasoning ? `\nAnalysis: ${progress.reasoning}` : ''}
` : ''}

${relevantDocs}

Write a new JSONata expression that:
1. Builds on the starting expression
2. Fixes failed examples
3. Maintains working patterns
4. Returns ONLY the expression`
  });

  console.log('Sending messages to model...');
  const completion = await openai.chat.completions.create({
    messages,
    model: "o3-mini",
  });

  const newJsonata = completion.choices[0].message.content?.trim() || "";
  console.log('Received new JSONata:', newJsonata);
  
  return { jsonata: newJsonata, documentation };
}

async function generateReasoning(
  currentJsonata: string,
  allResults: TestResult[],
  progress: Progress,
  description: string
): Promise<string> {
  console.log('\n=== Starting generateReasoning ===');
  
  const prompt = `Analyze this JSONata expression and its results:

Expression: ${currentJsonata}
Task: ${description}

Results:
${JSON.stringify(allResults, null, 2)}

Progress:
- Passed: ${JSON.stringify(progress.passedExamples, null, 2)}
- Failed: ${JSON.stringify(progress.failedExamples, null, 2)}
- Patterns: ${progress.successfulPatterns.join(', ')}

Provide analysis of:
1. Working parts
2. Failure reasons
3. Improvement suggestions
4. Next steps`;

  const completion = await openai.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "o3-mini",
  });

  const reasoning = completion.choices[0].message.content?.trim() || "";
  console.log('Generated reasoning:', reasoning);
  
  return reasoning;
}

export async function POST(request: Request) {
  try {
    const body: RequestBody = await request.json();
    const { jsonata: initialJsonata, trueExamples, falseExamples, description } = body;

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
          documentation: []
        };

        // First iteration with the provided JSONata
        const { jsonata: firstJsonata, documentation } = await generateNextJsonata(
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
          const trueResults = await testJsonata(currentJsonata, trueExamples, true);
          const falseResults = await testJsonata(currentJsonata, falseExamples, false);
          const allResults = [...trueResults, ...falseResults];
          
          // Update progress tracking
          progress.passedExamples = allResults
            .filter(r => r.passed)
            .map(r => r.example);
          progress.failedExamples = allResults
            .filter(r => !r.passed)
            .map(r => r.example);
          
          // Extract successful patterns from passed examples
          if (progress.passedExamples.length > 0) {
            const successfulPatterns = new Set<string>();
            for (const result of allResults) {
              if (result.passed) {
                const pattern = extractPatternFromJsonata(currentJsonata, result.example);
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
            progress
          };
          
          // Send the iteration to the client
          await writer.write(encoder.encode(JSON.stringify({ iteration }) + '\n'));
          
          allTestsPassed = allResults.every(result => result.passed);
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
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
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
function extractPatternFromJsonata(jsonata: string, example: any): string | null {
  // This is a simple implementation - you might want to enhance it
  // to extract more meaningful patterns based on your needs
  try {
    // Look for common patterns like path navigation, function calls, etc.
    const pathPattern = jsonata.match(/[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+/);
    if (pathPattern) return pathPattern[0];
    
    const functionPattern = jsonata.match(/\$[a-zA-Z0-9_]+\(/);
    if (functionPattern) return functionPattern[0].slice(0, -1);
    
    return null;
  } catch (error) {
    console.error('Error extracting pattern:', error);
    return null;
  }
} 