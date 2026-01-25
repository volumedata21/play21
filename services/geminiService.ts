import { GoogleGenAI, Type } from "@google/genai";
import { AIMetadata } from '../types';

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const generateVideoMetadata = async (fileName: string, folderName: string): Promise<AIMetadata | null> => {
  const ai = getAiClient();
  if (!ai) {
    console.warn("No API Key found for Gemini.");
    return null;
  }

  const prompt = `
    I have a video file named "${fileName}" stored in a folder named "${folderName}".
    Please generate a creative YouTube-style metadata package for this video.
    1. A catchy description (approx 2-3 sentences).
    2. 5 relevant hashtags.
    3. 3 fake user comments that look realistic (mix of praise, questions, or funny remarks).
  `;

  const schema = {
    type: Type.OBJECT,
    properties: {
      description: { type: Type.STRING },
      tags: { 
        type: Type.ARRAY, 
        items: { type: Type.STRING } 
      },
      comments: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            user: { type: Type.STRING },
            text: { type: Type.STRING },
            likes: { type: Type.INTEGER }
          },
          required: ["user", "text", "likes"]
        }
      }
    },
    required: ["description", "tags", "comments"]
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      }
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(text) as AIMetadata;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
};