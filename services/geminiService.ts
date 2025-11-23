import { GoogleGenAI } from "@google/genai";
import { WorkSession } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const generateWorkReport = async (sessions: WorkSession[]): Promise<string> => {
  if (!apiKey) return "API Key not configured. Unable to generate report.";
  if (sessions.length === 0) return "No work sessions available to analyze.";

  try {
    // Filter out very old sessions to keep context small if needed, or send all.
    // For this demo, we send the last 50 sessions.
    const recentSessions = sessions.slice(-50).map(s => ({
      staff: s.staffName,
      start: new Date(s.startTime).toLocaleString(),
      end: s.endTime ? new Date(s.endTime).toLocaleString() : 'Ongoing',
      durationMinutes: s.endTime ? Math.round((s.endTime - s.startTime) / 60000) : 'N/A',
      locationStart: `${s.startLocation.lat.toFixed(4)}, ${s.startLocation.lng.toFixed(4)}`
    }));

    const prompt = `
      You are an HR administrative assistant for "Fouad Hammam".
      Analyze the following work session logs:
      ${JSON.stringify(recentSessions, null, 2)}

      Please provide a concise summary report including:
      1. Total hours worked per staff member.
      2. Any attendance anomalies (e.g., very short or very long shifts).
      3. A polite professional summary of the team's recent activity.
      
      Format the output in clean Markdown.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Failed to generate report due to an AI service error.";
  }
};
