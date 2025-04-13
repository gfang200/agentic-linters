import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { jsonata, output, description } = await request.json();

    const prompt = `Given the following JSONata expression and its output:
    
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

Focus on generating meaningful, real-world data that tests both common scenarios and edge cases.`;

    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a JSONata expert and software testing specialist. Your task is to generate exactly 3 realistic test examples and edge cases for each case (true and false) that would make a given JSONata expression return true or false based on a description. Focus on generating meaningful, real-world data that tests both common scenarios and edge cases.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "gpt-4-turbo-preview",
      response_format: { type: "json_object" },
    });

    const response = JSON.parse(completion.choices[0].message.content || "{}");
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
} 