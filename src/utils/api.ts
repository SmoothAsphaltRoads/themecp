import { ApiSettings, LogEntry } from '@/types';
import { AI_PROVIDER_CONFIGS } from '@/types';

export async function callAiApi(
  settings: ApiSettings,
  fen: string,
  legalMoves: string[],
  addLog: (entry: Omit<LogEntry, 'timestamp'>) => void
): Promise<{ move: string | null; rawResponse: string; latencyMs: number; tokenUsage?: { prompt: number; completion: number; total: number }; error?: string }> {
  const startTime = performance.now();
  
  const prompt = `You are playing a competitive chess game.

Current FEN:
${fen}

Legal moves in UCI notation:
${legalMoves.join(', ')}

Return ONLY one legal move in UCI notation.

Examples:
e2e4
g1f3
e7e8q

Do not explain.
Do not use markdown.
Do not include punctuation.
Do not output anything except the move.`;

  try {
    let response: Response;
    let responseData: unknown;

    if (settings.provider === 'anthropic') {
      response = await fetch(`${settings.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: settings.modelName,
          max_tokens: settings.maxTokens,
          temperature: settings.temperature,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
      }

      responseData = await response.json();
      const rawResponse = responseData.content?.[0]?.text || '';
      const latencyMs = Math.round(performance.now() - startTime);
      
      const tokenUsage = responseData.usage ? {
        prompt: responseData.usage.input_tokens || 0,
        completion: responseData.usage.output_tokens || 0,
        total: (responseData.usage.input_tokens || 0) + (responseData.usage.output_tokens || 0),
      } : undefined;

      return {
        move: parseMoveFromResponse(rawResponse, legalMoves),
        rawResponse,
        latencyMs,
        tokenUsage,
      };
    } else if (settings.provider === 'gemini') {
      const url = `${settings.baseUrl}/models/${settings.modelName}:generateContent?key=${settings.apiKey}`;
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: settings.temperature,
            maxOutputTokens: settings.maxTokens,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      responseData = await response.json();
      const rawResponse = responseData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const latencyMs = Math.round(performance.now() - startTime);
      
      const tokenUsage = responseData.usageMetadata ? {
        prompt: responseData.usageMetadata.promptTokenCount || 0,
        completion: responseData.usageMetadata.candidatesTokenCount || 0,
        total: responseData.usageMetadata.totalTokenCount || 0,
      } : undefined;

      return {
        move: parseMoveFromResponse(rawResponse, legalMoves),
        rawResponse,
        latencyMs,
        tokenUsage,
      };
    } else {
      // OpenAI-compatible (OpenAI, OpenRouter, Custom)
      response = await fetch(`${settings.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.modelName,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: settings.temperature,
          max_tokens: settings.maxTokens,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      responseData = await response.json();
      const rawResponse = responseData.choices?.[0]?.message?.content || '';
      const latencyMs = Math.round(performance.now() - startTime);
      
      const tokenUsage = responseData.usage ? {
        prompt: responseData.usage.prompt_tokens || 0,
        completion: responseData.usage.completion_tokens || 0,
        total: responseData.usage.total_tokens || 0,
      } : undefined;

      return {
        move: parseMoveFromResponse(rawResponse, legalMoves),
        rawResponse,
        latencyMs,
        tokenUsage,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addLog({
      type: 'error',
      source: 'ai',
      message: 'AI API call failed',
      data: { error: errorMessage },
    });
    
    return {
      move: null,
      rawResponse: '',
      latencyMs: Math.round(performance.now() - startTime),
      error: errorMessage,
    };
  }
}

function parseMoveFromResponse(response: string, legalMoves: string[]): string | null {
  // Clean up the response
  let cleaned = response.trim();
  
  // Remove markdown code blocks
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');
  
  // Remove any non-alphanumeric characters except for the move itself
  cleaned = cleaned.replace(/[^a-h1-8qrbnk]/gi, '');
  
  // Try to find a valid move
  const moveMatch = cleaned.match(/[a-h][1-8][a-h][1-8][qrbnk]?/i);
  
  if (moveMatch) {
    const potentialMove = moveMatch[0].toLowerCase();
    if (legalMoves.includes(potentialMove)) {
      return potentialMove;
    }
  }
  
  // If no direct match, try each legal move as a substring
  for (const move of legalMoves) {
    if (cleaned.toLowerCase().includes(move)) {
      return move;
    }
  }
  
  return null;
}

export function getDefaultApiSettings(provider: ApiSettings['provider']): ApiSettings {
  const config = AI_PROVIDER_CONFIGS[provider];
  return {
    provider,
    apiKey: '',
    baseUrl: config.defaultBaseUrl,
    modelName: config.defaultModel,
    temperature: 0.7,
    maxTokens: 50,
  };
}
