// Модель Google Gemini через REST API (есть бесплатный тариф). Включается, если задан GEMINI_API_KEY.
// Подходят два вида ключей Google:
//   • ключ Google AI Studio (AIza…) — Gemini API, generativelanguage.googleapis.com;
//   • ключ Vertex AI в экспресс-режиме (AQ.…) — aiplatform.googleapis.com.
// Формат запросов у них общий и сверен с официальным SDK @google/genai: generateContent, functionDeclarations
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

export const isVertexKey = (key: string) => key.startsWith('AQ.');

/** Модели, которые пробуем по очереди, если DEBTS_GEMINI_MODEL не задан */
export const MODEL_CANDIDATES = ['gemini-flash-latest', 'gemini-3-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash'];

function endpoint(model: string, key: string) {
  return isVertexKey(key)
    ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

async function generate(contents: Content[]): Promise<GeminiResponse> {
  const key = GEMINI_API_KEY();
  let res: Response;
  try {
    res = await fetch(endpoint(GEMINI_MODEL() || (await workingModel()), key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
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

/* ---------- подбор модели и проверка ключа ---------- */
let found = '';

/** Первая модель из списка, которая отвечает с этим ключом (запоминаем до перезапуска функции) */
async function workingModel() {
  if (found) return found;
  const check = await checkGemini(MODEL_CANDIDATES);
  const ok = check.results.find(r => r.status === 200);
  if (!ok) {
    const last = check.results.at(-1);
    throw errorFor(last?.status ?? 500, last?.message ?? 'нет ответа');
  }
  found = ok.model;
  return found;
}

/** Пробный запрос к каждой модели по очереди — для /ai-check и подбора модели. Ключ не раскрывается */
export async function checkGemini(models: string[]) {
  const key = GEMINI_API_KEY();
  const results: { model: string; status: number; message: string }[] = [];
  for (const model of models) {
    let status = 0;
    let message = '';
    try {
      const res = await fetch(endpoint(model, key), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: 'Отвечай одним словом.' }] },
          contents: [{ role: 'user', parts: [{ text: 'Скажи «ок».' }] }],
          tools: [{ functionDeclarations: declarations }],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      status = res.status;
      const body = await res.text();
      if (res.ok) {
        const parsed = JSON.parse(body) as GeminiResponse;
        message = (parsed.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('').slice(0, 40);
      } else {
        const err = parseJson(body)?.error ?? {};
        message = `${err.status ?? ''} ${err.message ?? body}`.slice(0, 300);
      }
    } catch (e) {
      message = String(e).slice(0, 200);
    }
    results.push({ model, status, message });
    if (status === 200) break;
  }
  return { vertex: isVertexKey(key), keyLength: key.length, results };
}
