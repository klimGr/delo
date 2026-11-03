// Сквозной тест разговора с Gemini без сети: подменяем REST API Google и PostgREST Supabase.
// deno test --allow-env supabase/functions/debts/gemini_test.ts
import { assert, geminiRequests, geminiScript, type Row, tables } from './test_mocks.ts';

const { chat, AiError } = await import('./assistant.ts');
const me = { id: '42', name: 'Клим' };

const reply = (parts: Row[], finishReason = 'STOP') => ({ candidates: [{ content: { role: 'model', parts }, finishReason }] });

Deno.test('Gemini: договор → add_debt → ответ; платёж текстом; ошибки', async () => {
  Deno.env.set('GEMINI_API_KEY', 'gemini-test-key');
  Deno.env.delete('DEBTS_AI');

  // 1. Договор: Gemini вызывает add_debt (с подписью размышлений), потом отвечает текстом
  geminiScript.push(
    reply([{ functionCall: { id: 'call_1', name: 'add_debt', args: { name: 'Альфа «100 дней»', kind: 'card', owner: '42', balance: 41250, limit: 80000, rate: 39.9, min_payment: 2500, pay_day: 8 } }, thoughtSignature: 'SIG-1' }]),
    reply([{ text: 'Добавил карту **Альфа «100 дней»**: долг 41 250 ₽.' }]),
  );
  const r1 = await chat({ chatId: 42, me, text: '', attachments: [{ file: { id: 'F1', name: 'alfa.pdf', type: 'document' }, mime: 'application/pdf', base64: 'JVBERi0=' }] });
  assert(r1.changed && r1.reply.includes('Альфа'), 'ответ: ' + JSON.stringify(r1));
  const d = tables.debts?.[0];
  assert(d && Number(d.balance) === 41250 && d.pay_day === 8 && JSON.stringify(d.files).includes('F1'), 'долг: ' + JSON.stringify(d));

  const first = geminiRequests[0];
  assert(first.url.endsWith('/models/gemini-flash-latest:generateContent'), 'модель: ' + first.url);
  assert(first.headers.get('x-goog-api-key') === 'gemini-test-key', 'ключ в заголовке');
  const decl = (first.body.tools as Row[])[0].functionDeclarations as Row[];
  assert(decl.length === 6 && 'parametersJsonSchema' in decl[0], 'инструменты');
  assert(String(((first.body.systemInstruction as Row).parts as Row[])[0].text).includes('помощник'), 'системная подсказка');
  const userParts = ((first.body.contents as Row[]).at(-1)!.parts as Row[]);
  assert(String(userParts[0].text).startsWith('Контекст') && 'inlineData' in userParts[1], 'контекст, затем PDF');

  // Второй запрос: ответ модели повторён с подписью, результат инструмента — functionResponse с id
  const second = geminiRequests[1].body.contents as Row[];
  const echoed = second.at(-2)!;
  const answer = (second.at(-1)!.parts as Row[])[0].functionResponse as Row;
  assert(echoed.role === 'model' && JSON.stringify(echoed).includes('SIG-1'), 'подпись размышлений потеряна');
  assert(answer.id === 'call_1' && answer.name === 'add_debt' && 'output' in (answer.response as Row), 'functionResponse: ' + JSON.stringify(answer));

  // 2. Платёж текстом, история прошлого разговора уходит в запрос
  geminiScript.push(
    reply([{ functionCall: { name: 'record_payment', args: { debt_id: String(d.id), amount: 2500 } } }]),
    reply([{ text: 'Записал 2 500 ₽, осталось 38 750 ₽.' }]),
  );
  const r2 = await chat({ chatId: 42, me, text: 'заплатил 2500 по альфе', attachments: [] });
  assert(r2.changed && Number(tables.debts[0].balance) === 38750, 'платёж: ' + tables.debts[0].balance);
  const hist = geminiRequests[2].body.contents as Row[];
  assert(hist[0].role === 'user' && JSON.stringify(hist[0]).includes('alfa.pdf') && hist[1].role === 'model', 'история');

  // 3. Неверный ввод инструмента — ошибка уходит модели, база не меняется
  geminiScript.push(
    reply([{ functionCall: { name: 'record_payment', args: { debt_id: String(d.id), amount: 'много' } } }]),
    reply([{ text: 'Уточните сумму.' }]),
  );
  await chat({ chatId: 42, me, text: 'заплатил много', attachments: [] });
  const last = geminiRequests.at(-1)!.body.contents as Row[];
  const err = ((last.at(-1)!.parts as Row[])[0].functionResponse as Row).response as Row;
  assert('error' in err && Number(tables.debts[0].balance) === 38750, 'ошибка инструмента: ' + JSON.stringify(err));

  // 4. Лимит бесплатного тарифа → понятная ошибка
  geminiScript.push({ status: 429, body: '{"error":{"status":"RESOURCE_EXHAUSTED"}}' });
  const limited = await chat({ chatId: 42, me, text: 'привет', attachments: [] }).catch(e => e);
  assert(limited instanceof AiError && limited.kind === 'rate', 'лимит: ' + limited);

  // 5. Ни одного ключа → бот говорит, что ИИ не подключён
  Deno.env.delete('GEMINI_API_KEY');
  Deno.env.delete('ANTHROPIC_API_KEY');
  const none = await chat({ chatId: 42, me, text: 'привет', attachments: [] }).catch(e => e);
  assert(none instanceof AiError && none.kind === 'none', 'без ключа: ' + none);
  assert(geminiScript.length === 0, 'не все ответы использованы');
});
