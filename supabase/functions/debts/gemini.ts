// Модель Google Gemini через REST API (есть бесплатный тариф). Включается, если задан GEMINI_API_KEY.
// Формат запросов сверен с официальным SDK @google/genai: generateContent, functionDeclarations
// с parametersJsonSchema, ответы инструментов — functionResponse {id, name, response: {output|error}}.
import { AiError, type RunArgs, runTool, SYSTEM, TOOLS } from './assistant.ts';
import { GEMINI_API_KEY, GEMINI_MODEL } from './config.ts';

type Part = Record<string, unknown> & {
  text?: string;
  thought?: boolean;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
};
interface Content { role: 'user' | 'model'; parts: Part[] }
interface GeminiResponse {
  candidates?: { content?: Content; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

const declarations = TOOLS.map(t => ({
  name: t.name,
  description: t.description,
  parametersJsonSchema: { type: 'object', properties: t.properties, required: t.required },
}));

const BLOCKED = 'Google не пропустил этот запрос или ответ. Попробуйте переформулировать или прислать документ без паспортных данных.';

function errorFor(status: number, body: string): AiError {
  if (status === 429) return new AiError('rate', body);
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid/i.test(body)) return new AiError('auth', body);
  if (/location is not supported/i.test(body)) return new AiError('region', body);
  if (status >= 500) return new AiError('down', body);
  return new AiError('bad', body);
}

async function generate(contents: Content[]): Promise<GeminiResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL()}:generateContent`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY() },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents,
        tools: [{ functionDeclarations: declarations }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        generationConfig: { maxOutputTokens: 16384 },
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    throw new AiError('down', String(e));
  }
  if (!res.ok) throw errorFor(res.status, await res.text());
  return await res.json();
}

const parseJson = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

export async function runGemini({ history, context, attachments, userText, ctx }: RunArgs): Promise<string> {
  const contents: Content[] = history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] }));
  contents.push({
    role: 'user',
    parts: [
      { text: context },
      ...attachments.map((a): Part =>
        a.text !== undefined ? { text: `Файл «${a.file.name}»:\n${a.text}` } : { inlineData: { mimeType: a.mime, data: a.base64 } }
      ),
      { text: userText },
    ],
  });

  let malformed = 0;
  for (let turn = 0; turn < 10; turn++) {
    const res = await generate(contents);
    const cand = res.candidates?.[0];
    const parts = cand?.content?.parts ?? [];
    // Модель иногда ошибается в формате вызова инструмента — просим ещё раз
    if (cand?.finishReason === 'MALFORMED_FUNCTION_CALL' && malformed++ < 2) continue;
    if (!parts.length) return (res.promptFeedback?.blockReason || cand?.finishReason !== 'STOP') ? BLOCKED : '';

    const calls = parts.filter(p => p.functionCall);
    const said = parts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('').trim();
    if (!calls.length) return said;

    // Ответ модели кладём в историю как есть: в нём подписи размышлений, без них следующий запрос не примут
    contents.push(cand!.content!);
    const responses: Part[] = [];
    for (const p of calls) {
      const call = p.functionCall!;
      const r = await runTool(call.name, call.args ?? {}, ctx);
      responses.push({
        functionResponse: {
          ...(call.id ? { id: call.id } : {}),
          name: call.name,
          response: r.isError ? { error: r.content } : { output: parseJson(r.content) },
        },
      });
    }
    contents.push({ role: 'user', parts: responses });
  }
  return '';
}
