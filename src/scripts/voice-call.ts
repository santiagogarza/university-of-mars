const MODEL = 'grok-voice-latest';
const SAMPLE_RATE = 24000;

export type CallState = 'idle' | 'connecting' | 'live' | 'ended' | 'denied' | 'error';

export type VoiceField = {
  name: string;
  label: string;
  required: boolean;
  get: () => string;
  set: (value: string) => void;
};

type MountOptions = {
  mode: 'housing' | 'support';
  form: HTMLFormElement;
  launchers: HTMLButtonElement[];
  fields: VoiceField[];
  title: string;
  greeting: string;
};

type ServerEvent = {
  type?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  item_id?: string;
  response_id?: string;
  transcript?: string;
  delta?: string;
  text?: string;
};

export function mountVoiceCall(options: MountOptions) {
  const panel = document.createElement('section');
  panel.className = 'call-panel';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'call-title');
  panel.innerHTML = `
    <p class="eyebrow">${escapeHtml(options.title)}</p>
    <h2 id="call-title">${escapeHtml(options.title)}</h2>
    <p class="call-state" role="status"></p>
    <div class="mic-meter" aria-hidden="true"><span></span></div>
    <h3 class="call-needed-title">Still needed</h3>
    <ul class="call-needed"></ul>
    <div class="transcript" aria-live="polite" aria-relevant="additions text"></div>
    <div class="call-actions">
      <button type="button" class="btn call-hangup">Hang up</button>
      <button type="button" class="btn btn-ghost call-dismiss">Back to the form</button>
    </div>
  `;
  options.form.before(panel);

  const stateEl = panel.querySelector<HTMLElement>('.call-state');
  const neededEl = panel.querySelector<HTMLElement>('.call-needed');
  const transcriptEl = panel.querySelector<HTMLElement>('.transcript');
  const hangup = panel.querySelector<HTMLButtonElement>('.call-hangup');
  const dismiss = panel.querySelector<HTMLButtonElement>('.call-dismiss');
  const meter = panel.querySelector<HTMLElement>('.mic-meter span');
  if (!stateEl || !neededEl || !transcriptEl || !hangup || !dismiss || !meter) return;
  const transcript = transcriptEl;

  let state: CallState = 'idle';
  let socket: WebSocket | null = null;
  let audio: AudioContext | null = null;
  let stream: MediaStream | null = null;
  const playback: { at: number; sources: AudioBufferSourceNode[] } = { at: 0, sources: [] };
  let returnFocus: HTMLElement | null = null;
  let pendingTools: ServerEvent[] = [];
  const lines = new Map<string, HTMLElement>();

  const setState = (next: CallState, message: string) => {
    state = next;
    panel.dataset.callState = next;
    panel.hidden = next === 'idle';
    options.form.closest('.form-card')?.classList.toggle('is-calling', next !== 'idle');
    if (next === 'error' || next === 'denied' || next === 'ended') {
      stateEl.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
    stateEl.textContent = message;
    const inCall = next === 'connecting' || next === 'live';
    hangup.hidden = !inCall;
    dismiss.hidden = next === 'idle' || inCall;
    for (const button of options.launchers) {
      button.hidden = next !== 'idle';
      button.disabled = inCall;
    }
    renderNeeded();
  };

  const renderNeeded = () => {
    neededEl.replaceChildren();
    const missing = options.fields.filter((field) => field.required && !field.get());
    if (missing.length === 0) {
      const item = document.createElement('li');
      item.textContent = 'All required fields are filled. Correct anything, then submit the form.';
      neededEl.append(item);
      return;
    }
    for (const field of missing) {
      const item = document.createElement('li');
      item.textContent = field.label;
      neededEl.append(item);
    }
  };

  const focusForm = () => {
    const missing = options.fields.find((field) => field.required && !field.get());
    const target = missing ? fieldElement(missing) : options.form.querySelector<HTMLElement>('button[type="submit"]');
    (target ?? returnFocus ?? options.form).focus();
  };

  const stopAudio = () => {
    for (const source of playback.sources.splice(0)) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    playback.at = 0;
    if (audio) (audio as AudioContext & { __playAt?: number }).__playAt = 0;
  };

  const hangUp = (next: CallState = 'ended', message = 'Call ended. Check the form, then submit it yourself.') => {
    const current = socket;
    socket = null;
    setState(next, message);
    current?.close();
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    stopAudio();
    void audio?.close();
    audio = null;
    if (meter.parentElement) meter.style.transform = 'scaleX(0.04)';
    setState(next, message);
    if (next === 'ended' || next === 'denied' || next === 'error') dismiss.focus({ preventScroll: true });
  };

  hangup.addEventListener('click', () => hangUp());
  dismiss.addEventListener('click', () => {
    setState('idle', '');
    panel.hidden = true;
    focusForm();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (state !== 'connecting' && state !== 'live') return;
    event.preventDefault();
    hangUp();
  });

  const open = async (launcher: HTMLButtonElement) => {
    if (state === 'connecting' || state === 'live') return;
    returnFocus = launcher;
    lines.clear();
    transcriptEl.replaceChildren();
    pendingTools = [];
    setState('connecting', 'Connecting…');
    panel.hidden = false;
    options.form.closest('.form-card')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    hangup.focus();

    const base = (import.meta.env.PUBLIC_SERVICES_URL ?? '').replace(/\/$/, '');
    if (!base) {
      hangUp('error', 'Voice calls are not connected on this build. Use the form.');
      return;
    }

    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    audio = context;
    void context.resume();
    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        hangUp('denied', 'The microphone is blocked. Allow it in the browser, or use the form.');
      } else {
        hangUp('error', 'The microphone could not be opened. Use the form.');
      }
      return;
    }
    stream = mic;

    let secret: string;
    try {
      const response = await fetch(`${base}/api/voice/session`, { method: 'POST' });
      const payload = (await response.json().catch(() => ({}))) as { value?: string; error?: string };
      if (!response.ok || !payload.value) {
        hangUp('error', payload.error || 'The call could not be started. Use the form.');
        return;
      }
      secret = payload.value;
    } catch {
      hangUp('error', 'The call could not be started. Use the form.');
      return;
    }

    const ws = new WebSocket(`wss://api.x.ai/v1/realtime?model=${MODEL}`, [`xai-client-secret.${secret}`]);
    socket = ws;
    ws.addEventListener('error', () => {
      if (state === 'connecting' || state === 'live') {
        hangUp('error', 'The call was interrupted. Use the form.');
      }
    });
    ws.addEventListener('close', () => {
      if (state === 'connecting' || state === 'live') {
        hangUp('error', 'The call was interrupted. Use the form.');
      }
    });
    ws.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      let message: ServerEvent;
      try {
        message = JSON.parse(event.data) as ServerEvent;
      } catch {
        return;
      }
      onEvent(ws, context, message);
    });
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'session.update', session: sessionConfig(options) }));
    });

    const started = waitFor(ws, 'session.updated');
    started
      .then(async () => {
        if (socket !== ws) return;
        await startMic(context, mic, ws, meter);
        if (socket !== ws) return;
        setState('live', 'Live. The microphone is on.');
        ws.send(
          JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'force_message',
              role: 'assistant',
              interruptible: true,
              content: [{ type: 'output_text', text: options.greeting }],
            },
          }),
        );
      })
      .catch(() => {
        if (state === 'connecting') hangUp('error', 'The call could not be started. Use the form.');
      });
  };

  for (const button of options.launchers) {
    button.addEventListener('click', () => {
      void open(button);
    });
  }

  function onEvent(ws: WebSocket, context: AudioContext, event: ServerEvent) {
    const type = event.type ?? '';
    if (type === 'input_audio_buffer.speech_started') stopAudio();
    if (type === 'response.output_audio.delta' || type === 'response.audio.delta') {
      const delta = event.delta;
      if (delta) playPcm(context, delta, playback);
    }
    if (type.includes('input_audio_transcription')) {
      const id = event.item_id || 'caller';
      const text = event.transcript || event.delta || '';
      if (type.endsWith('.delta') && event.delta) appendLine(id, 'You', event.delta);
      else if (text) replaceLine(id, 'You', text);
    }
    if (type === 'response.output_audio_transcript.delta' || type === 'response.audio_transcript.delta') {
      const id = event.response_id || 'agent';
      appendLine(id, options.title, event.delta || event.transcript || '');
    }
    if (type === 'response.output_audio_transcript.done') {
      const id = event.response_id || 'agent';
      if (event.transcript) replaceLine(id, options.title, event.transcript);
    }
    if (type === 'response.function_call_arguments.done') pendingTools.push(event);
    if (type === 'response.done' && pendingTools.length && socket === ws) {
      const batch = pendingTools.splice(0);
      for (const call of batch) {
        const result = applyTool(call);
        ws.send(
          JSON.stringify({
            type: 'conversation.item.create',
            item: { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) },
          }),
        );
      }
      ws.send(JSON.stringify({ type: 'response.create' }));
    }
    if (type === 'error' && (state === 'live' || state === 'connecting')) {
      hangUp('error', 'The call was interrupted. Use the form.');
    }
  }

  function applyTool(event: ServerEvent) {
    let args: { name?: string; value?: string } = {};
    try {
      args = JSON.parse(event.arguments || '{}') as { name?: string; value?: string };
    } catch {
      args = {};
    }
    const field = options.fields.find((item) => item.name === args.name);
    const value = typeof args.value === 'string' ? args.value.trim() : '';
    if (!field || !value) {
      return { ok: false, error: 'Unknown or empty field.', stillNeeded: missingNames() };
    }
    field.set(value);
    const box = fieldElement(field)?.closest('.field');
    box?.classList.add('is-filled', 'is-just-filled');
    window.setTimeout(() => box?.classList.remove('is-just-filled'), 1600);
    renderNeeded();
    return { ok: true, name: field.name, value: field.get(), stillNeeded: missingNames() };
  }

  function missingNames() {
    return options.fields.filter((field) => field.required && !field.get()).map((field) => field.label);
  }

  function replaceLine(id: string, who: string, text: string) {
    if (!text.trim()) return;
    let line = lines.get(id);
    if (!line) {
      line = document.createElement('p');
      line.className = 'transcript-line';
      const name = document.createElement('span');
      name.className = 'who';
      name.textContent = who;
      const said = document.createElement('span');
      said.className = 'said';
      line.append(name, said);
      transcript.append(line);
      lines.set(id, line);
    }
    const said = line.querySelector('.said');
    if (said) said.textContent = text.trim();
    transcript.scrollTop = transcript.scrollHeight;
  }

  function appendLine(id: string, who: string, delta: string) {
    if (!delta) return;
    let line = lines.get(id);
    if (!line) replaceLine(id, who, delta);
    else {
      const said = line.querySelector('.said');
      if (said) said.textContent = `${said.textContent ?? ''}${delta}`;
      transcript.scrollTop = transcript.scrollHeight;
    }
  }

  renderNeeded();
  options.form.addEventListener('input', renderNeeded);
  options.form.addEventListener('change', renderNeeded);
}

function fieldElement(field: VoiceField): HTMLElement | null {
  const probe = field as VoiceField & { element?: HTMLElement };
  return probe.element ?? null;
}

function sessionConfig(options: MountOptions) {
  const names = options.fields.map((field) => field.name);
  const office = options.mode === 'housing' ? 'Housing and Residential Life' : 'the Help Center';
  return {
    voice: 'eve',
    instructions: [
      `You are a staff member in ${office} at the University of Mars. Speak in short, warm sentences.`,
      'Never mention software vendors, models, or that you are automated.',
      'Reply in the language the caller is using right now. If they switch languages, switch with them for those sentences, then follow them back.',
      'Write every form field in English. Translate before you save a field.',
      'Record only what the caller actually said. Never guess a name, ID, room, email, time, category, or urgency. Leave unknown fields empty.',
      'Never infer urgency. Do not announce it, and do not call set_field for urgency or priority, until the caller states how urgent it is. If they have not said, ask.',
      'As soon as you know one field, call set_field for that field. Do not wait until the end.',
      'Description is cumulative. Whenever the caller adds a detail about the problem, in any language, call set_field for description again with the full English description so far, keeping every earlier detail.',
      `Fields: ${options.fields.map((field) => field.label).join(', ')}.`,
      'When the required fields are filled, read them back briefly and ask the caller to press Submit. You cannot submit the form.',
      options.mode === 'housing'
        ? 'Halls: Olympus Mons Hall, Isidis Hall, Syrtis Court, Elysium Hall. Issue categories: Plumbing, Electrical, Heat or cooling, Furniture or fixture, Pest, Other repair. Urgency is Low, Normal, or Urgent.'
        : [
            'Categories and their subcategories: Financial aid (Award offer, Document status, Scholarship, Disbursement, Work-study); Financial aid hold (Verification, Missing document, Satisfactory academic progress, Other hold); Housing & residential life (Room assignment, Room change, Dining, Roommate); Housing repair (Plumbing, Electrical, Heat or cooling, Furniture or fixture, Pest, Other repair); Registration & records (Add or drop, Transcript, Enrollment verification, Grade); IT & accounts (Password or sign-in, Email, Wi-Fi, Software); Billing (Charge question, Payment, Refund, Payment plan); Accessibility (Accommodation, Exam adjustment, Barrier on campus, Housing accommodation); Something else (General question).',
            'When the problem the caller describes clearly belongs to one category, for example a leak or a broken heater in their residence hall is Housing repair, set category and the matching subcategory. Only ask which office it belongs to when it is unclear.',
            'Set subject to a short English summary of the request in the caller\'s own terms, for example "Leak under the bathroom sink in Isidis Hall 214".',
            'Priority is Low, Normal, or Urgent.',
          ].join(' '),
    ].join(' '),
    turn_detection: { type: 'server_vad' },
    audio: {
      input: {
        format: { type: 'audio/pcm', rate: SAMPLE_RATE },
        transcription: {
          model: 'grok-transcribe',
          keyterms: ['University of Mars', 'MyUM', 'Jezero', 'Olympus Mons Hall', 'Isidis Hall', 'Syrtis Court', 'Elysium Hall', 'umars.edu'],
        },
      },
      output: { format: { type: 'audio/pcm', rate: SAMPLE_RATE } },
    },
    tools: [
      {
        type: 'function',
        name: 'set_field',
        description: 'Save one English form field the caller has actually provided.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', enum: names },
            value: {
              type: 'string',
              description:
                'English text. Do not send a guess. For urgency or priority, send a value only after the caller has stated it. For description, send the complete updated description, not only the newest detail.',
            },
          },
          required: ['name', 'value'],
        },
      },
    ],
  };
}

async function startMic(context: AudioContext, stream: MediaStream, ws: WebSocket, meter: HTMLElement) {
  const source = context.createMediaStreamSource(stream);
  const worklet = `
    class MicProcessor extends AudioWorkletProcessor {
      process(inputs) {
        const channel = inputs[0] && inputs[0][0];
        if (channel) this.port.postMessage(channel.slice(0));
        return true;
      }
    }
    registerProcessor('mic-processor', MicProcessor);
  `;
  const url = URL.createObjectURL(new Blob([worklet], { type: 'application/javascript' }));
  await context.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const node = new AudioWorkletNode(context, 'mic-processor');
  const pending: number[] = [];
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const samples = resample(event.data, context.sampleRate, SAMPLE_RATE);
    let sum = 0;
    for (const sample of samples) {
      pending.push(sample);
      sum += sample * sample;
    }
    const rms = samples.length ? Math.sqrt(sum / samples.length) : 0;
    meter.style.transform = `scaleX(${Math.max(0.04, Math.min(1, rms * 5))})`;
    while (pending.length >= SAMPLE_RATE / 10) {
      const frame = new Float32Array(pending.splice(0, SAMPLE_RATE / 10));
      ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: floatToBase64Pcm16(frame) }));
    }
  };
  source.connect(node);
}

function playPcm(context: AudioContext, base64: string, playback: { at: number; sources: AudioBufferSourceNode[] }) {
  const floats = base64ToFloat32(base64);
  if (!floats.length) return;
  const buffer = context.createBuffer(1, floats.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(floats);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  const now = context.currentTime;
  if (playback.at < now) playback.at = now;
  source.start(playback.at);
  playback.at += buffer.duration;
  playback.sources.push(source);
  source.onended = () => {
    const index = playback.sources.indexOf(source);
    if (index >= 0) playback.sources.splice(index, 1);
  };
}

function waitFor(ws: WebSocket, type: string) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('timeout'));
    }, 8000);
    const onMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const message = JSON.parse(event.data) as { type?: string };
        if (message.type === type) {
          cleanup();
          resolve();
        }
      } catch {
        /* ignore */
      }
    };
    const onClose = () => {
      cleanup();
      reject(new Error('closed'));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      ws.removeEventListener('close', onClose);
    };
    ws.addEventListener('message', onMessage);
    ws.addEventListener('close', onClose);
  });
}

function resample(input: Float32Array, from: number, to: number) {
  if (from === to) return input;
  const ratio = from / to;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, input.length - 1);
    const mix = pos - left;
    output[i] = input[left] * (1 - mix) + input[right] * mix;
  }
  return output;
}

function floatToBase64Pcm16(input: Float32Array) {
  const pcm = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToFloat32(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const output = new Float32Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < output.length; i += 1) output[i] = view.getInt16(i * 2, true) / 32768;
  return output;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] ?? char));
}

export function inputField(name: string, label: string, input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, required = true): VoiceField & { element: HTMLElement } {
  return {
    name,
    label,
    required,
    element: input,
    get: () => input.value.trim(),
    set: (value) => {
      if (input instanceof HTMLSelectElement) {
        const match = [...input.options].find((option) => option.value.toLowerCase() === value.toLowerCase() || option.textContent?.trim().toLowerCase() === value.toLowerCase());
        if (match) input.value = match.value;
        else input.value = value;
      } else {
        input.value = value;
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
  };
}

export function radioField(name: string, label: string, form: HTMLFormElement, radioName: string): VoiceField & { element: HTMLElement } {
  const selected = () => form.querySelector<HTMLInputElement>(`input[name="${radioName}"]:checked`);
  const box = (form.querySelector(`input[name="${radioName}"]`)?.closest('.field') ?? form) as HTMLElement;
  return {
    name,
    label,
    required: true,
    element: box,
    get: () => selected()?.value ?? '',
    set: (value) => {
      const radios = [...form.querySelectorAll<HTMLInputElement>(`input[name="${radioName}"]`)];
      const match = radios.find((radio) => radio.value.toLowerCase() === value.toLowerCase());
      if (!match) return;
      for (const radio of radios) radio.checked = false;
      match.checked = true;
      match.dispatchEvent(new Event('change', { bubbles: true }));
    },
  };
}
