/* =====================================================================
   JARVIS-server — serveert web/ en de endpoints die de interface gebruikt:
   /api/chat (zinnen streamen), /api/speak (stem), /api/stop, /api/reset,
   /api/settings. Brein: Claude via de Anthropic API. Stem: ElevenLabs als
   er een sleutel is, anders de stemmen van macOS (`say`).
   ===================================================================== */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');
const DATA = path.join(ROOT, 'data');

/* ---- .env inlezen (sleutels staan nooit in de repo) ---- */
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const PORT = +process.env.PORT || 8765;
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY || '';
const HAS_KEY = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

// Claude Code op deze Mac gebruikt je Claude-abonnement (Pro/Max): dan is geen betaalde API-sleutel nodig
const CLAUDE_BIN = [process.env.CLAUDE_BIN, path.join(os.homedir(), '.local/bin/claude'), path.join(os.homedir(), '.claude/local/claude'),
  '/opt/homebrew/bin/claude', '/usr/local/bin/claude'].find(p => p && fs.existsSync(p));
// voorkeur: het abonnement; JARVIS_BRAIN=api in .env kiest de betaalde sleutel
const BRAIN = process.env.JARVIS_BRAIN === 'api' && HAS_KEY ? 'api' : CLAUDE_BIN ? 'abonnement' : HAS_KEY ? 'api' : null;
const HAS_CLAUDE = !!BRAIN;

/* ---- instellingen, bewaard in data/settings.json ---- */
const DEFAULTS = { voice: 'Daniel', rate: 185, quality: 'flash', model: 'sonnet', name: 'JARVIS', user: 'sir',
  wake: true, web: true, gmail: true, wake_word: 'jarvis', lang: 'nl-NL' };
const SETTINGS_FILE = path.join(DATA, 'settings.json');
let S = { ...DEFAULTS };
try { S = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }; } catch (e) {}
function saveSettings() { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(SETTINGS_FILE, JSON.stringify(S, null, 2)); }

const MODELS = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' };
const PROMPT_FILE = path.join(ROOT, 'server', 'prompts', 'jarvis.md');

/* =====================================================================
   STEMMEN — ElevenLabs (Brits, natuurlijk) of macOS `say` (gratis)
   ===================================================================== */
let voiceCache = null;
async function listVoices() {
  if (voiceCache) return voiceCache;
  const voices = [];
  if (ELEVEN_KEY) {
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': ELEVEN_KEY } });
      const j = await r.json();
      for (const v of j.voices || []) voices.push({ name: `ElevenLabs: ${v.name}`, lang: v.labels?.accent || 'ElevenLabs', id: v.voice_id, engine: 'eleven' });
    } catch (e) { console.error('ElevenLabs-stemmen ophalen mislukt:', e.message); }
  }
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await run('say', ['-v', '?']);
      for (const line of stdout.split('\n')) {
        const m = line.match(/^(.+?)\s+([a-z]{2}_[A-Z]{2})\s/);
        if (m && /^(en_GB|en_US|en_IE|en_AU|nl_NL|nl_BE)$/.test(m[2])) voices.push({ name: m[1].trim(), lang: m[2], engine: 'say' });
      }
    } catch (e) {}
  }
  return (voiceCache = voices);
}

async function speak(text) {
  const voices = await listVoices();
  const v = voices.find(x => x.name === S.voice) || voices.find(x => x.engine === 'eleven') || voices.find(x => x.name === 'Daniel') || voices[0];
  if (v?.engine === 'eleven') {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${v.id}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': ELEVEN_KEY, 'content-type': 'application/json' },
      // flash: sneller en half zoveel credits; rijk: de volste klank
      body: JSON.stringify({ text, model_id: S.quality === 'rijk' ? 'eleven_multilingual_v2' : 'eleven_flash_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: Math.min(1.2, Math.max(0.7, S.rate / 185)) } }),
    });
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return { type: 'audio/mpeg', body: Buffer.from(await r.arrayBuffer()) };
  }
  if (process.platform !== 'darwin') throw new Error('Geen stem beschikbaar: zet ELEVENLABS_API_KEY in .env.');
  const file = path.join(os.tmpdir(), `jarvis-${process.pid}-${Date.now()}.wav`);
  try {
    await run('say', ['-v', v?.name || 'Daniel', '-r', String(S.rate), '--file-format=WAVE', '--data-format=LEI16@22050', '-o', file, text]);
    return { type: 'audio/wav', body: fs.readFileSync(file) };
  } finally { fs.rm(file, () => {}); }
}

/* =====================================================================
   BREIN — Claude, met geheugen per gesprek en zinnen die meteen gestreamd worden
   ===================================================================== */
const claude = BRAIN === 'api' ? new Anthropic() : null;
let history = [];
let current = null;   // lopende stream, zodat /api/stop hem kan afbreken

function systemPrompt() {
  const base = fs.readFileSync(PROMPT_FILE, 'utf8').replaceAll('{{name}}', S.name).replaceAll('{{user}}', S.user);
  const now = new Date().toLocaleString('en-GB', { timeZone: 'Europe/Amsterdam', dateStyle: 'full', timeStyle: 'short' });
  return `${base}\nIt is now ${now} (Amsterdam time).`;
}

// spreektekst: markdown en links eruit, zodat de stem niets raars voorleest
const clean = t => t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/https?:\/\/\S+/g, '').replace(/[*_#`>]+/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/\s+/g, ' ').trim();

// stuurt elke afgeronde zin direct door, zodat Jarvis al praat terwijl Claude nog schrijft
function sentenceStream(send) {
  let pending = '';
  const flush = (all) => {
    const re = all ? /^[\s\S]+$/ : /^[\s\S]*?[.!?…](?=\s)/;
    let m;
    while ((m = pending.match(re))) {
      const s = clean(m[0]); pending = pending.slice(m[0].length);
      if (s) send({ type: 'sentence', text: s });
      if (all) break;
    }
  };
  return {
    add(t) { pending += t; flush(false); },
    gap() { if (pending && !/\s$/.test(pending)) pending += ' '; },
    drop() { pending = ''; },
    end() { flush(true); },
  };
}

/* ---- via de Anthropic API (betaalde sleutel) ---- */
async function chatApi(userMsg, send) {
  history.push(userMsg);
  const model = MODELS[S.model] || MODELS.opus;
  const tools = S.web ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }] : undefined;
  const out = sentenceStream(send);

  for (let round = 0; round < 4; round++) {
    const params = {
      model, max_tokens: 4000, system: systemPrompt(), messages: history,
      output_config: { effort: 'low' }, ...(tools && { tools }),
    };
    // bij Opus en Sonnet: als het model weigert, neemt een ander model het over
    const stream = current = model === MODELS.haiku
      ? claude.messages.stream(params)
      : claude.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    for await (const ev of stream) {
      if (ev.type === 'content_block_start' && ev.content_block.type === 'server_tool_use') send({ type: 'status', status: 'SEARCHING' });
      if (ev.type === 'content_block_start' && ev.content_block.type === 'text') out.gap();
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') out.add(ev.delta.text);
    }
    const msg = await stream.finalMessage();
    history.push({ role: 'assistant', content: msg.content });
    if (msg.stop_reason === 'refusal') { out.drop(); send({ type: 'sentence', text: "I'm afraid I can't help with that one, sir." }); break; }
    if (msg.stop_reason !== 'pause_turn') break;   // web search wil nog een ronde
  }
  out.end();
}

/* ---- via Claude Code op de Mac (je Claude-abonnement) ---- */
// Claude Code laadt zelf de koppelingen van je Claude-account (claude.ai/customize/connectors).
// Lezen mag altijd; versturen, verwijderen en delen blijft dicht.
const ACCOUNTS = ['Gmail', 'Google_Calendar', 'Google_Drive', 'Rylee', 'Jortt', 'Shopify', 'ClickUp', 'Canva'].map(n => `mcp__claude_ai_${n}`);
const BLOCKED = [
  'mcp__claude_ai_Gmail__send_message', 'mcp__claude_ai_Gmail__forward', 'mcp__claude_ai_Gmail__reply',
  'mcp__claude_ai_Gmail__trash_message', 'mcp__claude_ai_Gmail__trash_thread', 'mcp__claude_ai_Gmail__delete_draft', 'mcp__claude_ai_Gmail__delete_label',
  'mcp__claude_ai_Google_Calendar__delete_event', 'mcp__claude_ai_Google_Drive__trash_file', 'mcp__claude_ai_Google_Drive__share_file',
  'mcp__claude_ai_Shopify__graphql_mutation',
  // ClickUp: niets verwijderen, samenvoegen of namens hem in chats posten
  ...['delete_task', 'delete_comment', 'merge_tasks', 'remove_task_from_list', 'send_chat_message', 'update_chat_message'].map(t => `mcp__claude_ai_ClickUp__clickup_${t}`),
  // Jortt: niets verwijderen of naar klanten versturen
  ...['Delete_Estimate', 'Delete_Invoice_by_ID', 'Delete_Project', 'Delete_Project_Line_item', 'Delete_a_Customer', 'Delete_a_Loonjournaalpost',
    'Delete_an_Expense', 'Deregister_Payment', 'Send_Estimate', 'Send_Invoice', 'Send_direct_debit_authorization_to_a_Customer',
    'Create_and_optionally_send_an_Invoice', 'Create_and_optionally_send_an_Estimate', 'Creates_and_optionally_sends_a_credit_Invoice'].map(t => `mcp__claude_ai_Jortt__${t}`),
];
let ccSession = null;   // gesprek dat Claude Code onthoudt tussen vragen
function chatCode(userMsg, send) {
  return new Promise((resolve, reject) => {
    const first = !ccSession;
    if (first) ccSession = randomUUID();
    // korte herinnering per vraag: kleine modellen schieten anders mee in het Nederlands
    const args = ['-p', `${userMsg.content}\n\n(Reply in British English.)`, '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--model', MODELS[S.model] ? S.model : 'sonnet', '--system-prompt', systemPrompt(), '--system-prompt-snapshot', 'off',
      '--tools', S.web ? 'WebSearch' : '',
      '--allowedTools', [...(S.web ? ['WebSearch'] : []), ...(S.gmail ? ACCOUNTS : [])].join(','),
      '--disallowedTools', BLOCKED.join(','),
      ...(S.gmail ? [] : ['--strict-mcp-config']),
      ...(first ? ['--session-id', ccSession] : ['--resume', ccSession])];
    // zonder API-sleutel in de omgeving, anders rekent Claude Code alsnog via de sleutel af
    const env = { ...process.env }; delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    // wacht tot de claude.ai-koppelingen verbonden zijn, anders antwoordt -p zonder agenda- en mailtools
    env.MCP_CONNECTION_NONBLOCKING = 'false';
    fs.mkdirSync(DATA, { recursive: true });
    const child = spawn(CLAUDE_BIN, args, { cwd: DATA, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let aborted = false, errText = '', buf = '', resultError = null;
    current = { abort() { aborted = true; child.kill(); } };
    const out = sentenceStream(send);
    child.stdout.on('data', d => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        let o; try { o = JSON.parse(line); } catch (e) { continue; }
        const ev = o.type === 'stream_event' && o.event;
        if (ev && ev.type === 'content_block_start' && ev.content_block.type === 'tool_use')
          send({ type: 'status', status: ev.content_block.name.startsWith('mcp__') ? 'MAIL' : 'SEARCHING' });
        if (ev && ev.type === 'content_block_start' && ev.content_block.type === 'text') out.gap();
        if (ev && ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') out.add(ev.delta.text);
        // welke koppelingen en tools Claude Code geladen heeft, voor als er iets ontbreekt
        if (o.type === 'system' && o.subtype === 'init') fs.writeFile(path.join(DATA, 'laatste-start.json'),
          JSON.stringify({ tijd: new Date().toISOString(), model: o.model, mcp_servers: o.mcp_servers, tools: o.tools, args: args.filter(a => a.length < 300) }, null, 2), () => {});
        if (o.type === 'result' && o.is_error) resultError = o.result || o.subtype || 'onbekende fout';
      }
    });
    child.stderr.on('data', d => { errText += d; fs.appendFile(path.join(DATA, 'claude-fouten.log'), d, () => {}); });
    child.on('error', reject);
    child.on('close', code => {
      if (aborted && first) ccSession = null;
      if (aborted) return reject(Object.assign(new Error('aborted'), { name: 'APIUserAbortError' }));
      out.end();
      if (code !== 0 || resultError) {
        if (first) ccSession = null;
        const msg = String(resultError || errText || `Claude Code stopte (code ${code})`).trim();
        return reject(new Error(/log ?in|auth|login/i.test(msg) ? 'Claude Code is niet ingelogd. Open Terminal, typ claude en log in met je Claude-account.' : msg.slice(0, 300)));
      }
      resolve();
    });
  });
}

const chat = (userMsg, send) => BRAIN === 'abonnement' ? chatCode(userMsg, send) : chatApi(userMsg, send);

/* =====================================================================
   HTTP
   ===================================================================== */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary' };
const readBody = req => new Promise(res => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { res(JSON.parse(b || '{}')); } catch (e) { res({}); } }); });
const json = (res, obj, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/settings' && req.method === 'GET') {
      return json(res, { settings: S, voices: (await listVoices()).map(({ name, lang }) => ({ name, lang })), claude: HAS_CLAUDE });
    }
    if (url.pathname === '/api/settings' && req.method === 'POST') {
      const b = await readBody(req);
      for (const k of Object.keys(DEFAULTS)) if (k in b) S[k] = b[k];
      S.rate = Math.min(240, Math.max(140, +S.rate || DEFAULTS.rate));
      saveSettings();
      return json(res, { settings: S });
    }
    if (url.pathname === '/api/speak' && req.method === 'POST') {
      const { text } = await readBody(req);
      if (!text) return json(res, { error: 'geen tekst' }, 400);
      const a = await speak(String(text).slice(0, 1000));
      res.writeHead(200, { 'content-type': a.type });
      return res.end(a.body);
    }
    if (url.pathname === '/api/chat' && req.method === 'POST') {
      const { text } = await readBody(req);
      res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache' });
      const send = obj => res.write(JSON.stringify(obj) + '\n');
      if (!BRAIN) { send({ type: 'error', text: 'Claude is niet gevonden. Installeer Claude Code (zie README) of zet een ANTHROPIC_API_KEY in .env.' }); return res.end(); }
      if (current) current.abort();
      const userMsg = { role: 'user', content: String(text || '') };
      try { await chat(userMsg, send); }
      catch (e) {
        if (e.name !== 'APIUserAbortError' && !/abort/i.test(e.message)) { console.error(e); send({ type: 'error', text: 'Claude gaf een fout: ' + e.message }); }
        // laat de geschiedenis niet eindigen op een onbeantwoorde vraag
        if (history.at(-1) === userMsg) history.pop();
      }
      return res.end();
    }
    if (url.pathname === '/api/stop' && req.method === 'POST') { if (current) current.abort(); return json(res, { ok: true }); }
    if (url.pathname === '/api/reset' && req.method === 'POST') { if (current) current.abort(); history = []; ccSession = null; return json(res, { ok: true }); }

    // statische bestanden uit web/
    const file = path.normalize(path.join(WEB, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(WEB) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Niet gevonden'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, { error: e.message }, 500); else res.end();
  }
});

// alleen bereikbaar vanaf deze computer
server.listen(PORT, '127.0.0.1', () => {
  console.log(`JARVIS draait op http://localhost:${PORT}`);
  console.log(BRAIN === 'abonnement' ? 'Brein: Claude Code met je Claude-abonnement.' : BRAIN === 'api' ? 'Brein: Anthropic API-sleutel.' : 'Let op: geen Claude gevonden, Jarvis kan nog niet nadenken.');
  if (!ELEVEN_KEY) console.log('Tip: zet ELEVENLABS_API_KEY in .env voor de Britse butlerstem.');
});
