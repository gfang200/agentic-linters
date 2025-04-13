import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import jsonata from 'jsonata';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function validateTestExample(example: any, jsonataExpr: string, expectedOutput: any): Promise<{ isValid: boolean; output: any }> {
  console.log('Validating test example:', { example, jsonataExpr, expectedOutput });
  try {
    const expression = jsonata(jsonataExpr);
    const result = await expression.evaluate(example);
    
    console.log('Validation result:', result);
    
    // Check that the result is not undefined, null, empty object, or empty array
    if (result === undefined || result === null) {
      console.log('Validation failed: result is undefined or null');
      return { isValid: false, output: result };
    }
    
    // Check for empty object or array
    if (typeof result === 'object') {
      if (Array.isArray(result) && result.length === 0) {
        console.log('Validation failed: result is empty array');
        return { isValid: false, output: result };
      }
      if (Object.keys(result).length === 0) {
        console.log('Validation failed: result is empty object');
        return { isValid: false, output: result };
      }
    }
    
    console.log('Validation successful');
    return { isValid: true, output: result };
  } catch (error) {
    console.error('Error validating test example:', error);
    return { isValid: false, output: null };
  }
}

export async function POST(request: Request) {
  console.log('Received POST request to /api/openai');
  try {
    const { jsonata, output, description } = await request.json();
    console.log('Request payload:', { jsonata, output, description });

    let promptText = `Given the following JSONata expression and its output:
    
JSONata:
${jsonata}

Output:
${JSON.stringify(output, null, 2)}

And the following description of the intended output:
${description}

Please generate test examples that would make the JSONata expression return true or false. Format your response as a JSON object with two arrays: "trueExamples" and "falseExamples". For each array, generate exactly 3 examples that:

1. Include realistic examples that is representative of the provided output data
2. Include some edge cases that test the boundaries of the expression without being overly convoluted
3. Ensure each example is a complete JSON object that would be valid input for the JSONata expression
4. Ensure that when the JSONata expression is applied to the trueExamples, it produces output similar to the provided example output

Focus on generating meaningful, real-world data that tests both common scenarios and edge cases.`;

    let validResponse = false;
    let attempts = 0;
    const maxAttempts = 3;
    let response;

    while (!validResponse && attempts < maxAttempts) {
      console.log(`Attempt ${attempts + 1} of ${maxAttempts}`);
      const completion = await openai.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are a JSONata expert and software testing specialist. Your task is to generate exactly 3 realistic test examples and edge cases for each case (true and false) that would make a given JSONata expression return true or false based on a description. Focus on generating meaningful, real-world data that tests both common scenarios and edge cases.",
          },
          {
            role: "user",
            content: promptText,
          },
        ],
        model: "o3-mini",
        response_format: { type: "json_object" },
      });

      response = JSON.parse(completion.choices[0].message.content || "{}");
      console.log('OpenAI response:', response);
      
      // Validate true examples
      const validationPromises = response.trueExamples.map((example: any) => 
        validateTestExample(example, jsonata, output)
      );
      
      const validationResults = await Promise.all(validationPromises);
      console.log('Validation results:', validationResults);
      validResponse = validationResults.every(result => result.isValid);
      
      if (!validResponse) {
        attempts++;
        if (attempts < maxAttempts) {
          console.log('Validation failed, retrying with updated prompt');
          // Add feedback to the prompt for the next attempt
          promptText += `\n\nPrevious attempt failed validation. Please ensure the trueExamples produce output similar to: ${JSON.stringify(output, null, 2)}`;
        }
      } else {
        // Add the outputs to the response
        response.trueExampleOutputs = validationResults.map(result => result.output);
        
        // Validate false examples
        const falseValidationPromises = response.falseExamples.map((example: any) => 
          validateTestExample(example, jsonata, output)
        );
        
        const falseValidationResults = await Promise.all(falseValidationPromises);
        response.falseExampleOutputs = falseValidationResults.map(result => result.output);
      }
    }

    if (!validResponse) {
      console.error('Failed to generate valid test examples after maximum attempts');
      return NextResponse.json(
        { error: 'Failed to generate valid test examples after multiple attempts' },
        { status: 500 }
      );
    }

    console.log('Successfully generated and validated test examples');
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
} 