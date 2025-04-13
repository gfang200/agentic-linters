import { NextResponse } from "next/server";
import OpenAI from "openai";
import jsonata from "jsonata";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface TestResult {
  example: any;
  passed: boolean;
  error?: string;
  output?: any;
}

interface Iteration {
  jsonata: string;
  results: TestResult[];
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
        const evalError = error instanceof Error ? error.message : String(error);
        throw new Error(`Evaluation failed: ${evalError}`);
      }
      
      // Strict boolean check - only true/false values are valid
      const isTrue = output === true;
      const isFalse = output === false;
      
      if (!isTrue && !isFalse) {
        throw new Error(`Expression must return exactly true or false, got: ${JSON.stringify(output)}`);
      }
      
      const passed = shouldPass ? isTrue : isFalse;
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
          typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error),
      });
    }
  }
  
  console.log('\n=== testJsonata Results ===');
  console.log('Number of passes:', results.filter(r => r.passed).length);
  console.log('Number of failures:', results.filter(r => !r.passed).length);
  
  return results;
}

async function generateNextJsonata(
  currentJsonata: string,
  trueExamples: any[],
  falseExamples: any[],
  description: string,
  previousResults: TestResult[]
): Promise<string> {
  console.log('\n=== Starting generateNextJsonata ===');
  console.log('Current JSONata:', currentJsonata);
  console.log('Description:', description);
  console.log('Previous results:', JSON.stringify(previousResults, null, 2));

  const prompt = `You are a JSONata expert. Your task is to write a JSONata expression that satisfies this requirement:
${description}

The input will be a JSON object that contains data nested under response.context.annotations.endpoint_GoldfishStrategy_2.annotations.rubric_items.response.criterias

Here are some example inputs and their expected outputs:

True Examples (should return true):
${JSON.stringify(trueExamples, null, 2)}

False Examples (should return false):
${JSON.stringify(falseExamples, null, 2)}

Current JSONata expression that isn't working:
${currentJsonata}

Previous test results showing what failed:
${JSON.stringify(previousResults, null, 2)}

Write a new JSONata expression that will correctly handle these cases. The expression should:
1. Navigate to the correct data path
2. Use appropriate JSONata functions to implement the logic
3. Return true/false based on the description above

Return ONLY the JSONata expression, nothing else. Do not include any explanations or comments.`;

  console.log('Sending prompt to model...');
  const completion = await openai.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "o3-mini",
  });

  const newJsonata = completion.choices[0].message.content?.trim() || "";
  console.log('Received new JSONata:', newJsonata);
  
  return newJsonata;
}

export async function POST(request: Request) {
  try {
    const body: RequestBody = await request.json();
    const { trueExamples, falseExamples, description } = body;

    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Start the agentic process in the background
    (async () => {
      try {
        // Generate initial JSONata expression using GPT
        let currentJsonata = await generateNextJsonata(
          "",
          trueExamples,
          falseExamples,
          description,
          []
        );
        let allTestsPassed = false;

        while (!allTestsPassed) {
          const trueResults = await testJsonata(currentJsonata, trueExamples, true);
          const falseResults = await testJsonata(currentJsonata, falseExamples, false);
          
          const allResults = [...trueResults, ...falseResults];
          const iteration: Iteration = {
            jsonata: currentJsonata,
            results: allResults,
          };
          
          // Send the iteration to the client
          await writer.write(encoder.encode(JSON.stringify({ iteration }) + '\n'));
          
          allTestsPassed = allResults.every(result => result.passed);
          if (allTestsPassed) break;
          
          currentJsonata = await generateNextJsonata(
            currentJsonata,
            trueExamples,
            falseExamples,
            description,
            allResults
          );
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
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
} 