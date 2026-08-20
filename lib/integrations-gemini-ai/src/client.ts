import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY ?? process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
const integrationBaseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY must be configured.");
}

export const ai = new GoogleGenAI({
  apiKey,
  ...(integrationBaseUrl
    ? {
        httpOptions: {
          apiVersion: "",
          baseUrl: integrationBaseUrl,
        },
      }
    : {}),
});
