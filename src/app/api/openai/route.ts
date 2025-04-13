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

Please generate 3 examples where the final JSONata would return true, and 3 examples where it would return false. Format your response as a JSON object with two arrays: "trueExamples" and "falseExamples". Each example should be a complete JSON object that would be valid input for the JSONata expression.`;

    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a JSONata expert. Your task is to generate examples that would make a given JSONata expression return true or false based on a description.",
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