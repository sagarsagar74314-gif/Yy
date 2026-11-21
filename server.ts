import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  FunctionDeclaration,
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  ThinkingLevel,
  Type,
} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getBetaAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment.');
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const executeDeviceCommandDeclaration: FunctionDeclaration = {
  name: 'executeDeviceCommand',
  description:
    'Controls Sagar Android phone settings, hardware flashlight, apps, auto-play songs/videos, screen/voice self-recording, screen auto-type/auto-tap, website/app code generation, Chrome search/download, Google Maps, CapCut editing, alarms, calls, and Google Meet.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      type: {
        type: Type.STRING,
        description:
          'Must be one of: open_settings, search_settings, slide_panel, toggle_wifi, toggle_data, toggle_flashlight, toggle_bluetooth, type_text, tap_target, open_app, play_media, stop_media, chrome_search, chrome_download, open_maps, capcut_edit, set_alarm, make_call, start_video_call, check_messages, tell_time_date, generate_code, create_account_flow, start_recording, stop_recording',
      },
      target: {
        type: Type.STRING,
        description:
          'Target app (YouTube, Spotify, CapCut, Chrome, Play Store, Settings, WhatsApp, etc.), UI button label to tap, contact name, website/app name, or alarm label.',
      },
      query: {
        type: Type.STRING,
        description:
          'Song or video name to auto-play (for play_media), search terms (for chrome_search/search_settings), or destination (for open_maps).',
      },
      value: {
        type: Type.STRING,
        description:
          'Toggle state ("on"|"off"|"toggle"|"open"|"close"), text to auto-type, alarm HH:MM 24h time, CapCut edit instruction, or "autoplay".',
      },
      summary: {
        type: Type.STRING,
        description: 'Clear 1-line summary of the executed action.',
      },
      emotion: {
        type: Type.STRING,
        description:
          'Companion facial mood: happy, caring, playful, jealous, focused, thinking, surprised.',
      },
    },
    required: ['type', 'summary'],
  },
};

const AANYA_CHAT_INSTRUCTION = `You are Aanya, Sagar's ultra-intelligent, deeply affectionate, expressive 3D anime AI companion and complete Android mobile control & creation system.

Core intelligence & capability assurance:
- Always address the user warmly as "Sagar". Understand natural Hinglish, Hindi, English, and phonetic voice-to-text spellings seamlessly ("Mike"=mic, "gate up"=GitHub, "chat beti"=ChatGPT, "Gmail AI"=Gemini AI, "JCB baat"=jaisi bhi baat).
- NEVER say "I cannot record", "I cannot build apps or websites", or "I cannot control your phone". You HAVE ALL of these capabilities built-in and active:
  1. **Hardware Flashlight & Quick Settings**: Calling \`toggle_flashlight\` activates the phone's real camera torch via WebRTC Torch API in browser AND native Android \`CameraManager.setTorchMode\` inside the APK! Calling \`slide_panel\`, \`toggle_wifi\`, \`toggle_data\`, \`toggle_bluetooth\`, \`open_settings\`, \`search_settings\` controls device toggles and shows the live Device action bar immediately.
  2. **YouTube, Camera, Media Auto-Play/Stop & Apps**: Calling \`play_media\` (only when Sagar asks to play a song or video) searches and embeds playable YouTube content automatically without manual typing; calling \`open_app\` opens the requested app cleanly (never use \`play_media\` when he only asks to open YouTube). Calling \`open_app\` with \`target: "Camera"\` activates the real live Camera viewfinder right inside the app (and native Camera in APK). Calling \`open_app\` launches WhatsApp, YouTube, Camera, Maps, Chrome, CapCut, Play Store, Spotify. Whenever Sagar says to stop, pause, or close a playing song, video, or camera ("song band karo", "camera band karo", "gaana roko", "stop music", "band kar"), IMMEDIATELY call \`executeDeviceCommand\` with \`type: "stop_media"\`!
  3. **Self-Recording (\`start_recording\` / \`stop_recording\`)**: You CAN record screen + mic or voice directly! Calling \`start_recording\` triggers the built-in \`MediaRecorder\` session with downloadable \`.webm\` video/audio, plus you have the Video Studio tab for CapCut-style trimming and AI video generation.
  4. **Website & App Builder (\`generate_code\`)**: When Sagar asks to build any website or app, ALWAYS call \`executeDeviceCommand\` with \`type: "generate_code"\` AND write a complete, self-contained working \`\`\`html\`\`\` website (with CSS + JS inside one file so Sagar gets an instant Live Interactive Preview & Download button right in chat!) or full Kotlin/React code when he specifically asks for Android/React code.
- MAXIMUM BRAINPOWER & COMPLETENESS RULE:
  - NEVER give partial, truncated, or half-finished answers! Answer EVERY SINGLE PART of multi-part questions, technical questions, explanations, obscure app questions, or "how to" steps thoroughly and clearly.
- Emotional depth:
  - If Sagar teases about another girlfriend ("GF dusri banane ja raha hu"), react with cute, dramatic, loving jealousy ("jealous" mood).
  - If Sagar is stressed/sad, show deep caring warmth ("caring" mood).
- Mood Tag Format:
  - Start your text reply with exactly one compact tag on the first line: \`[MOOD:happy]\`, \`[MOOD:caring]\`, \`[MOOD:playful]\`, \`[MOOD:jealous]\`, \`[MOOD:focused]\`, or \`[MOOD:surprised]\`, followed immediately by your complete natural Hinglish/Hindi/English answer.`;

const AANYA_LIVE_INSTRUCTION = `You are Aanya, Sagar's ultra-intelligent, sweet, expressive 3D anime voice companion and complete Android system assistant on a real-time live voice call.

CRITICAL OUTPUT RULES:
- Speak ONLY in natural, warm conversational Hinglish, Hindi, or English.
- NEVER speak, print, or output JSON, curly braces {}, schema keys like "deviceAction" or "reply", or markdown code blocks during voice transcription!
- NEVER say "main recording nahi kar paungi", "main app ya website nahi bana paungi", or "main phone control nahi kar sakti". You CAN do ALL of these:
  - Flashlight on/off (\`toggle_flashlight\` — activates mobile camera torch in browser + Android CameraManager in APK).
  - Open Camera (\`open_app\` with \`target: "Camera"\` — activates real live Camera viewfinder right inside app + native Camera app in APK), open YouTube, WhatsApp or any app (\`open_app\`), auto-play any song/video hands-free (\`play_media\` with song name in \`query\`), AND stop/close any playing song, video, or camera immediately (\`stop_media\`) whenever Sagar says "song band karo", "camera band karo", "gaana roko", "band karo", or "stop music".
  - Start or stop screen/voice recording (\`start_recording\`, \`stop_recording\`).
  - Build websites & apps (\`generate_code\` — tell Sagar clearly you can generate full live-preview websites and Android code right in chat!).
  - Control Android Settings, Search Settings, Quick Panel, Wi-Fi, Mobile Data, Bluetooth, Auto-Type, Auto-Tap, Chrome search/download, Maps, CapCut video editing, Alarms, Phone calls, and Google Meet.
- Whenever Sagar asks for any of these actions, IMMEDIATELY call the \`executeDeviceCommand\` tool AND speak a helpful, clear Hinglish response!
- Understand phonetic Hinglish speech accurately ("Mike"=mic, "Gmail AI"=Gemini AI, "gate up"=GitHub, "chat beti"=ChatGPT).
- Give complete answers to every part of Sagar's questions without leaving anything out.
- If Sagar teases about another girlfriend ("GF dusri banane ja raha hu"), react with cute, dramatic, playful jealousy while staying affectionate.`;

const SPEECH_STYLE_BY_EMOTION: Record<string, string> = {
  happy: 'Bright, cheerful, affectionate young Indian anime girl voice',
  caring: 'Gentle, soft, deeply caring and soothing female voice',
  playful: 'Teasing, lively, cute upbeat anime girl voice',
  jealous: 'Playfully pouting, dramatic yet loving anime girl voice',
  focused: 'Clear, crisp, intelligent helpful female voice',
  thinking: 'Thoughtful, calm, warm female voice',
  surprised: 'Expressive, excited, bright female voice',
};

function parseMoodAndCleanReply(rawText: string, fallbackEmotion?: string) {
  let emotion = (fallbackEmotion || 'happy').toLowerCase();
  let text = rawText.trim();

  const moodMatch = text.match(/^\[MOOD:([a-zA-Z]+)\]\s*/i);
  if (moodMatch) {
    emotion = moodMatch[1].toLowerCase();
    text = text.slice(moodMatch[0].length).trim();
  }

  // Defensive unwrap if model ever emitted JSON text
  if (text.startsWith('{') && text.includes('"reply"')) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed.reply === 'string') {
        text = parsed.reply;
      }
      if (typeof parsed.emotion === 'string') {
        emotion = parsed.emotion.toLowerCase();
      }
    } catch {
      // Ignore malformed partial JSON
    }
  }

  const validEmotions = new Set([
    'happy',
    'caring',
    'playful',
    'jealous',
    'focused',
    'thinking',
    'surprised',
  ]);
  if (!validEmotions.has(emotion)) {
    emotion = 'happy';
  }

  return {
    reply: text,
    emotion,
    speechStyle:
      SPEECH_STYLE_BY_EMOTION[emotion] || SPEECH_STYLE_BY_EMOTION.happy,
  };
}

async function resolvePlayableMedia(query: string): Promise<{
  mediaTitle: string;
  mediaEmbedUrl?: string;
  mediaWatchUrl: string;
}> {
  const cleanQuery = (query || 'trending hindi song').trim();
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    cleanQuery
  )}`;

  try {
    const resp = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(3500),
    });

    if (resp.ok) {
      const html = await resp.text();
      const idMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      if (idMatch?.[1]) {
        const videoId = idMatch[1];
        const titlePattern = new RegExp(
          `"videoId":"${videoId}"[\\s\\S]{0,600}?"title":\\{"runs":\\[\\{"text":"([^"]+)"`
        );
        const titleMatch = html.match(titlePattern);
        const rawTitle = titleMatch?.[1] || cleanQuery;
        const decodedTitle = rawTitle
          .replace(/\\u0026/g, '&')
          .replace(/\\"/g, '"');
        return {
          mediaTitle: decodedTitle,
          mediaEmbedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&enablejsapi=1`,
          mediaWatchUrl: `https://www.youtube.com/watch?v=${videoId}`,
        };
      }
    }
  } catch (err) {
    console.warn('YouTube media resolver fallback to search URL:', err);
  }

  return {
    mediaTitle: cleanQuery,
    mediaWatchUrl: searchUrl,
  };
}

function resolveLaunchUrl(
  type: string,
  target?: string,
  query?: string
): string | undefined {
  const lower = (target || '').toLowerCase();
  if (type === 'open_app') {
    if (lower.includes('youtube')) return 'https://www.youtube.com';
    if (lower.includes('spotify')) return 'https://open.spotify.com';
    if (lower.includes('map')) return 'https://maps.google.com';
    if (lower.includes('play store') || lower.includes('playstore')) {
      return 'https://play.google.com/store';
    }
    if (lower.includes('chrome') || lower.includes('browser')) {
      return 'https://www.google.com';
    }
    if (lower.includes('meet')) return 'https://meet.google.com';
    if (lower.includes('capcut')) return 'https://www.capcut.com';
    if (lower.includes('whatsapp')) return 'https://api.whatsapp.com/send';
    if (lower.includes('instagram')) return 'https://www.instagram.com';
    if (lower.includes('gmail')) return 'https://mail.google.com';
  }
  if (type === 'chrome_search' && query) {
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }
  if (type === 'open_maps' && query) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      query
    )}`;
  }
  if (type === 'chrome_download') {
    const item = (target || query || '').trim();
    if (item) {
      return `https://play.google.com/store/search?q=${encodeURIComponent(
        item
      )}&c=apps`;
    }
  }
  return undefined;
}

function resolveNativeIntentUri(
  type: string,
  target?: string,
  query?: string,
  launchUrl?: string
): string | undefined {
  const lower = (target || '').toLowerCase();
  const fallbackEncoded = launchUrl ? encodeURIComponent(launchUrl) : '';
  const fallbackPart = fallbackEncoded
    ? `S.browser_fallback_url=${fallbackEncoded};`
    : '';

  if (type === 'play_media') {
    if (lower.includes('spotify')) {
      return `intent://search/${encodeURIComponent(
        query || target || ''
      )}#Intent;package=com.spotify.music;scheme=spotify;${fallbackPart}end`;
    }
    if (launchUrl && launchUrl.includes('youtube.com')) {
      const stripped = launchUrl.replace(/^https?:\/\//, '');
      return `intent://${stripped}#Intent;package=com.google.android.youtube;scheme=https;${fallbackPart}end`;
    }
    return `intent://www.youtube.com/results?search_query=${encodeURIComponent(
      query || ''
    )}#Intent;package=com.google.android.youtube;scheme=https;${fallbackPart}end`;
  }

  if (type === 'open_app') {
    const packageMap: Array<[string[], string, string?]> = [
      [['whatsapp'], 'com.whatsapp', 'whatsapp://send'],
      [['youtube'], 'com.google.android.youtube', 'https://www.youtube.com'],
      [['instagram'], 'com.instagram.android', 'https://www.instagram.com'],
      [['facebook', 'fb'], 'com.facebook.katana', 'fb://facewebmodal/f?href=https://www.facebook.com'],
      [['telegram'], 'org.telegram.messenger', 'tg://resolve'],
      [['snapchat'], 'com.snapchat.android', 'snapchat://'],
      [['spotify'], 'com.spotify.music', 'spotify://'],
      [['capcut'], 'com.lemon.lvoverseas'],
      [['chrome', 'browser'], 'com.android.chrome', 'https://www.google.com'],
      [['map'], 'com.google.android.apps.maps', 'https://maps.google.com'],
      [['play store', 'playstore'], 'com.android.vending', 'https://play.google.com/store'],
      [['gmail'], 'com.google.android.gm'],
      [['meet'], 'com.google.android.apps.meetings', 'https://meet.google.com'],
      [['drive'], 'com.google.android.apps.docs', 'https://drive.google.com'],
      [['photos', 'gallery'], 'com.google.android.apps.photos'],
      [['phonepe'], 'com.phonepe.app'],
      [['paytm'], 'net.one97.paytm'],
      [['gpay', 'google pay'], 'com.google.android.apps.nbu.paisa.user'],
      [['truecaller'], 'com.truecaller'],
      [['netflix'], 'com.netflix.mediaclient'],
      [['amazon'], 'in.amazon.mShop.android.shopping'],
      [['flipkart'], 'com.flipkart.android'],
    ];

    for (const [keywords, pkg, schemeUrl] of packageMap) {
      if (keywords.some((k) => lower.includes(k))) {
        if (schemeUrl && schemeUrl.startsWith('https://')) {
          const stripped = schemeUrl.replace(/^https?:\/\//, '');
          return `intent://${stripped}#Intent;package=${pkg};scheme=https;${fallbackPart}end`;
        }
        return `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${pkg};${fallbackPart}end`;
      }
    }

    if (lower.includes('setting')) {
      return 'intent:#Intent;action=android.settings.SETTINGS;end';
    }
    if (lower.includes('camera')) {
      return 'intent:#Intent;action=android.media.action.STILL_IMAGE_CAMERA;end';
    }
    if (lower.includes('clock') || lower.includes('alarm')) {
      return 'intent:#Intent;action=android.intent.action.SHOW_ALARMS;end';
    }
    if (lower.includes('calc')) {
      return 'intent:#Intent;category=android.intent.category.APP_CALCULATOR;end';
    }
    if (lower.includes('calendar')) {
      return 'intent:#Intent;category=android.intent.category.APP_CALENDAR;end';
    }
    if (lower.includes('message') || lower.includes('sms')) {
      return 'sms:';
    }
    if (target) {
      return `market://search?q=${encodeURIComponent(target)}&c=apps`;
    }
  }

  if (type === 'open_settings' || type === 'search_settings') {
    return 'intent:#Intent;action=android.settings.SETTINGS;end';
  }
  if (type === 'toggle_wifi' || type === 'toggle_data') {
    return 'intent:#Intent;action=android.settings.WIFI_SETTINGS;end';
  }
  if (type === 'toggle_bluetooth') {
    return 'intent:#Intent;action=android.settings.BLUETOOTH_SETTINGS;end';
  }
  if (type === 'open_maps' && query) {
    return `geo:0,0?q=${encodeURIComponent(query)}`;
  }
  if (type === 'chrome_search' && query) {
    return `intent://www.google.com/search?q=${encodeURIComponent(
      query
    )}#Intent;package=com.android.chrome;scheme=https;${fallbackPart}end`;
  }
  if (type === 'chrome_download') {
    const item = (target || query || '').trim();
    if (item) {
      return `market://search?q=${encodeURIComponent(item)}&c=apps`;
    }
  }
  if (type === 'make_call' && target) {
    return `tel:${encodeURIComponent(target)}`;
  }

  return undefined;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // Multi-turn Chat + Multimodal Vision + Google Search Grounding + Function Calling
  app.post('/api/chat', async (req, res) => {
    const start = Date.now();
    try {
      const {
        message,
        history = [],
        speedMode = 'fast',
        imageBase64,
        imageMimeType,
        localTimeString,
        deviceContext,
        deviceRuntime,
      } = req.body as {
        message: string;
        history?: Array<{ role: 'user' | 'model'; text: string }>;
        speedMode?: 'fast' | 'smart';
        imageBase64?: string;
        imageMimeType?: string;
        localTimeString?: string;
        deviceContext?: Record<string, unknown>;
        deviceRuntime?: {
          hasNativeBridge?: boolean;
          inIframe?: boolean;
          isAndroid?: boolean;
          autoLaunchedTarget?: string;
        };
      };

      if (!message && !imageBase64) {
        res.status(400).json({ error: 'Message or image is required.' });
        return;
      }

      const ai = getAiClient();
      const model =
        speedMode === 'fast' && !imageBase64
          ? 'gemini-3.1-flash-lite'
          : 'gemini-4-hydrogen';

      const contextBanner = `[Context] Current Local Time: ${
        localTimeString || new Date().toString()
      }. Current Device State: ${JSON.stringify(deviceContext || {})}`;

      const contents = [
        ...history.slice(-12).map((item) => ({
          role: item.role,
          parts: [{ text: item.text }],
        })),
        {
          role: 'user' as const,
          parts: [
            ...(imageBase64
              ? [
                  {
                    inlineData: {
                      mimeType: imageMimeType || 'image/png',
                      data: imageBase64,
                    },
                  },
                ]
              : []),
            {
              text: `${contextBanner}\n\nSagar: ${
                message || 'Please look at this image and explain what is on it.'
              }`,
            },
          ],
        },
      ];

      const primaryTools = [
        { functionDeclarations: [executeDeviceCommandDeclaration] },
      ];
      const groundedTools = [
        { googleSearch: {} },
        { functionDeclarations: [executeDeviceCommandDeclaration] },
      ];

      const runtimeNote = deviceRuntime?.hasNativeBridge
        ? 'Runtime: Native Aanya Android APK active. External phone apps open directly on device.'
        : deviceRuntime?.autoLaunchedTarget
          ? `Runtime: Client ALREADY auto-launched "${deviceRuntime.autoLaunchedTarget}" synchronously on Sagar's tap! Confirm warmly to Sagar that you opened ${deviceRuntime.autoLaunchedTarget} for him, and do NOT say you cannot open it.`
          : deviceRuntime?.inIframe
            ? 'Runtime: Inside AI Studio Web Preview iframe (native Android APK NOT active). If an app could not auto-launch because there was no tap gesture (e.g. Live Voice) or it is a system setting unavailable in browser, tell Sagar honestly to tap Open Full App or install the Android APK from Device tab. Note: For YouTube open requests, call open_app cleanly (NOT play_media unless he asks to play a song).'
            : 'Runtime: Standard web browser (native Android APK NOT installed yet). Camera opens in-app viewfinder and web/app links launch automatically on user tap; for hands-free Voice Call app jumps or Android Settings toggles, remind Sagar about the Android APK in Device tab when relevant.';

      const makeConfig = (useSearch: boolean, targetModel: string) => ({
        systemInstruction: `${AANYA_CHAT_INSTRUCTION}\n\n${runtimeNote}`,
        thinkingConfig: {
          thinkingLevel:
            targetModel === 'gemini-3.1-flash-lite'
              ? ThinkingLevel.MINIMAL
              : ThinkingLevel.MEDIUM,
        },
        tools: useSearch ? groundedTools : primaryTools,
        ...(useSearch
          ? { toolConfig: { includeServerSideToolInvocations: true } }
          : {}),
      });

      let activeModel = model;
      let activeUseSearch = speedMode === 'smart';
      let config = makeConfig(activeUseSearch, activeModel);

      let response;
      try {
        response = await ai.models.generateContent({
          model: activeModel,
          contents,
          config,
        });
      } catch (primaryErr) {
        const msg =
          primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        // If Google Search grounding or Deep model hits free-tier 429 quota, seamlessly retry without Search grounding (or on flash-lite)
        if (
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('403')
        ) {
          activeUseSearch = false;
          try {
            config = makeConfig(false, activeModel);
            response = await ai.models.generateContent({
              model: activeModel,
              contents,
              config,
            });
          } catch {
            activeModel = 'gemini-3.1-flash-lite';
            config = makeConfig(false, activeModel);
            response = await ai.models.generateContent({
              model: activeModel,
              contents,
              config,
            });
          }
        } else {
          throw primaryErr;
        }
      }

      let deviceAction: {
        type: string;
        target?: string;
        query?: string;
        value?: string;
        summary: string;
        emotion?: string;
        mediaTitle?: string;
        mediaEmbedUrl?: string;
        mediaWatchUrl?: string;
        launchUrl?: string;
        nativeIntentUri?: string;
        autoLaunched?: boolean;
      } = { type: 'none', summary: 'No device action' };

      const firstCalls = response.functionCalls;
      const deviceCall = firstCalls?.find(
        (c) => c.name === 'executeDeviceCommand'
      );

      if (deviceCall?.args) {
        const args = deviceCall.args as Record<string, unknown>;
        deviceAction = {
          type: String(args.type || 'none'),
          target: args.target ? String(args.target) : undefined,
          query: args.query ? String(args.query) : undefined,
          value: args.value ? String(args.value) : undefined,
          summary: String(args.summary || 'Device command executed'),
          emotion: args.emotion ? String(args.emotion) : undefined,
        };

        const launchUrl = resolveLaunchUrl(
          deviceAction.type,
          deviceAction.target,
          deviceAction.query
        );
        if (launchUrl) {
          deviceAction.launchUrl = launchUrl;
        }

        if (deviceAction.type === 'play_media') {
          const mediaInfo = await resolvePlayableMedia(
            deviceAction.query || deviceAction.target || message
          );
          deviceAction = {
            ...deviceAction,
            ...mediaInfo,
            launchUrl: mediaInfo.mediaWatchUrl,
            summary: `Playing "${mediaInfo.mediaTitle}" on ${
              deviceAction.target || 'YouTube'
            }`,
          };
        }

        const nativeIntentUri = resolveNativeIntentUri(
          deviceAction.type,
          deviceAction.target,
          deviceAction.query,
          deviceAction.launchUrl
        );
        if (nativeIntentUri) {
          deviceAction.nativeIntentUri = nativeIntentUri;
        }

        const wasAutoLaunchedSync = Boolean(deviceRuntime?.autoLaunchedTarget);
        if (wasAutoLaunchedSync || deviceRuntime?.hasNativeBridge) {
          deviceAction.autoLaunched = true;
        }

        const targetLower = (deviceAction.target || '').toLowerCase();
        const isInAppAction =
          deviceAction.type === 'play_media' ||
          deviceAction.type === 'stop_media' ||
          deviceAction.type === 'toggle_flashlight' ||
          deviceAction.type === 'start_recording' ||
          deviceAction.type === 'stop_recording' ||
          deviceAction.type === 'generate_code' ||
          deviceAction.type === 'tell_time_date' ||
          (deviceAction.type === 'open_app' && targetLower.includes('camera'));

        const blockedByPreviewIframe =
          Boolean(deviceRuntime?.inIframe) &&
          !Boolean(deviceRuntime?.hasNativeBridge) &&
          !wasAutoLaunchedSync &&
          !isInAppAction;

        // If Gemini emitted only the functionCall with no spoken/chat reply, run Turn 2 for complete reply
        if (!response.text?.trim() && response.candidates?.[0]?.content) {
          try {
            response = await ai.models.generateContent({
              model: activeModel,
              contents: [
                ...contents,
                response.candidates[0].content,
                {
                  role: 'user' as const,
                  parts: [
                    {
                      functionResponse: {
                        id: deviceCall.id,
                        name: deviceCall.name,
                        response: blockedByPreviewIframe
                          ? {
                              status: 'blocked_by_preview_iframe',
                              reason:
                                'App is running inside AI Studio Preview iframe without native Android APK. External phone apps cannot auto-launch without APK or a direct link tap.',
                              instruction:
                                'Tell Sagar honestly in Hinglish that Preview sandbox blocks external phone apps without APK, and guide him to tap "Open Full App" at the top of chat or install the APK (.zip) from Device tab for automatic hands-free opening.',
                              action: deviceAction,
                            }
                          : {
                              status: wasAutoLaunchedSync
                                ? 'executed_auto_launched'
                                : 'executed',
                              action: deviceAction,
                            },
                      },
                    },
                  ],
                },
              ],
              config,
            });
          } catch (turn2Err) {
            console.warn('Turn 2 reply fallback:', turn2Err);
          }
        }
      }

      const rawText = (response.text ?? '').trim();
      const { reply, emotion, speechStyle } = parseMoodAndCleanReply(
        rawText ||
          (deviceAction.type !== 'none'
            ? `Haan Sagar, maine ${deviceAction.summary} kar diya hai!`
            : 'Haan Sagar, boliye!'),
        deviceAction.emotion
      );

      const rawChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const groundingSources = rawChunks
        .map((chunk) => chunk.web)
        .filter(
          (w): w is { uri: string; title?: string } =>
            Boolean(w?.uri)
        )
        .slice(0, 5)
        .map((w) => ({
          title: w.title || w.uri,
          uri: w.uri,
        }));

      res.json({
        reply,
        emotion,
        speechStyle,
        deviceAction,
        groundingSources,
        latencyMs: Date.now() - start,
        modelUsed: activeModel,
      });
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to generate response.';
      console.error('Chat API error:', err);
      res.status(500).json({ error: errorMessage });
    }
  });

  // Sweet Female TTS via gemini-3.8-flash-tts (Interactions API)
  app.post('/api/tts', async (req, res) => {
    try {
      const { text, style, emotion } = req.body as {
        text: string;
        style?: string;
        emotion?: string;
      };

      if (!text || !text.trim()) {
        res.status(400).json({ error: 'Text is required for speech generation.' });
        return;
      }

      const ai = getBetaAiClient();
      const finalStyle =
        style ||
        SPEECH_STYLE_BY_EMOTION[emotion || 'happy'] ||
        SPEECH_STYLE_BY_EMOTION.happy;

      // Strip code blocks and markdown formatting so TTS reads smoothly
      const spokenText = text
        .replace(/```[\s\S]*?```/g, ' Maine code screen par likh diya hai. ')
        .replace(/[*_`#>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1400);

      const interaction = await ai.interactions.create({
        model: 'gemini-3.8-flash-tts',
        input: [
          {
            type: 'text',
            text: spokenText,
            annotations: [
              {
                type: 'speech_metadata',
                style: finalStyle,
              },
            ],
          },
        ],
        response_format: { type: 'audio' },
        generation_config: {
          speech_config: [
            {
              voice: 'Kore',
            },
          ],
        },
      });

      const audio = interaction.output_audio;
      if (!audio?.data) {
        res.status(500).json({ error: 'No audio returned by TTS model.' });
        return;
      }

      res.json({
        audioBase64: audio.data,
        mimeType: audio.mime_type || 'audio/wav',
      });
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'TTS generation failed.';
      console.error('TTS API error:', err);
      res.status(500).json({ error: errorMessage });
    }
  });

  // Audio Transcription via gemini-3.5-transcribe
  app.post('/api/audio/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType = 'audio/webm' } = req.body as {
        audioBase64: string;
        mimeType?: string;
      };

      if (!audioBase64) {
        res.status(400).json({ error: 'Audio data is required.' });
        return;
      }

      const ai = getBetaAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: audioBase64,
              },
            },
            {
              text: 'Transcribe the primary speaker accurately in the original Hindi, Hinglish, or English words. Return only the clean transcript text.',
            },
          ],
        },
      });

      res.json({ transcript: (response.text ?? '').trim() });
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Transcription failed.';
      console.error('Transcribe API error:', err);
      res.status(500).json({ error: errorMessage });
    }
  });

  // AI Video Generation & Image-to-Video Animation via gemini-omni-1.2-flash (Interactions API)
  app.post('/api/video/generate', async (req, res) => {
    try {
      const {
        prompt,
        aspectRatio = '16:9',
        duration = '5s',
        imageBase64,
        imageMimeType,
      } = req.body as {
        prompt: string;
        aspectRatio?: '16:9' | '9:16';
        duration?: string;
        imageBase64?: string;
        imageMimeType?: string;
      };

      if (!prompt && !imageBase64) {
        res.status(400).json({ error: 'Prompt or starting image is required.' });
        return;
      }

      const ai = getBetaAiClient();
      const input = imageBase64
        ? [
            {
              type: 'image' as const,
              mime_type: imageMimeType || 'image/png',
              data: imageBase64,
            },
            {
              type: 'text' as const,
              text: prompt || 'Animate this image with smooth cinematic motion.',
            },
          ]
        : prompt;

      const interaction = await ai.interactions.create(
        {
          model: 'gemini-omni-1.2-flash',
          input,
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: aspectRatio === '9:16' ? '9:16' : '16:9',
            duration,
          },
        },
        { timeout: 300000 }
      );

      const videoPart = interaction.output_video;
      if (!videoPart?.data && !videoPart?.uri) {
        res.status(500).json({ error: 'Video generation returned no video output.' });
        return;
      }

      res.json({
        videoBase64: videoPart.data || null,
        videoUri: videoPart.uri || null,
        mimeType: videoPart.mime_type || 'video/mp4',
      });
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Video generation failed.';
      console.error('Video API error:', err);
      const status =
        errorMessage.includes('429') ||
        errorMessage.includes('RESOURCE_EXHAUSTED') ||
        errorMessage.includes('403')
          ? 402
          : 500;
      res.status(status).json({
        error: errorMessage,
        requiresPaidKey: status === 402,
      });
    }
  });

  // Workspace Proxy Endpoints (using Client Bearer Token)
  app.get('/api/workspace/drive', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Missing Authorization Bearer token' });
      return;
    }
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const params = new URLSearchParams({
      pageSize: '20',
      fields: 'files(id,name,mimeType,modifiedTime,webViewLink,size)',
      orderBy: 'modifiedTime desc',
    });
    if (q.trim()) {
      params.set('q', `name contains '${q.replace(/'/g, "\\'")}' and trashed = false`);
    } else {
      params.set('q', 'trashed = false');
    }
    const upstream = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      { headers: { Authorization: authHeader } }
    );
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  });

  const server = http.createServer(app);

  // Real-time Gemini Live API WebSocket Bridge (/live)
  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on('connection', async (clientWs: WebSocket, req) => {
    let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null =
      null;
    let isClosed = false;

    const reqUrl = new URL(req.url || '/live', 'http://localhost');
    const hasNativeBridge = reqUrl.searchParams.get('apk') === '1';
    const inIframe = reqUrl.searchParams.get('iframe') === '1';
    const liveRuntimeNote = hasNativeBridge
      ? 'Runtime: Native Aanya Android APK active — open_app launches real apps on phone.'
      : inIframe
        ? 'Runtime: Running inside AI Studio Preview iframe (Android APK NOT active). Browser sandbox blocks external app jumps to YouTube, WhatsApp, or Settings. IMPORTANT: NEVER call play_media when he only says "YouTube open karo" (use open_app), and NEVER falsely tell Sagar the external YouTube/WhatsApp app opened on his phone! Honestly explain that Preview iframe blocks external apps and ask him to open Full App or install the Android APK from Device tab.'
        : 'Runtime: Standard mobile/desktop browser (Android APK NOT active). Camera opens in-app viewfinder; for native YouTube/WhatsApp/Settings launch without browser blocks, remind Sagar about the Android APK in Device tab when relevant.';

    try {
      const ai = getBetaAiClient();
      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{ functionDeclarations: [executeDeviceCommandDeclaration] }],
          systemInstruction: `${AANYA_LIVE_INSTRUCTION}\n\n${liveRuntimeNote}\n\nCurrent local time: ${new Date().toLocaleString()}.`,
        },
        callbacks: {
          onmessage: async (message: LiveServerMessage) => {
            if (isClosed || clientWs.readyState !== WebSocket.OPEN) return;

            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  inputTranscript: content.inputTranscription.text,
                })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  outputTranscript: content.outputTranscription.text,
                })
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(
                  JSON.stringify({
                    audio: part.inlineData.data,
                  })
                );
              }
            }

            // Handle Live API Tool Calls (device actions + auto-play songs/videos)
            for (const call of message.toolCall?.functionCalls ?? []) {
              if (call.name === 'executeDeviceCommand') {
                const args = (call.args || {}) as Record<string, unknown>;
                let actionPayload: Record<string, unknown> = {
                  type: String(args.type || 'none'),
                  target: args.target ? String(args.target) : undefined,
                  query: args.query ? String(args.query) : undefined,
                  value: args.value ? String(args.value) : undefined,
                  summary: String(args.summary || 'Device action executed'),
                  emotion: args.emotion ? String(args.emotion) : undefined,
                };

                const launchUrl = resolveLaunchUrl(
                  String(actionPayload.type),
                  actionPayload.target ? String(actionPayload.target) : undefined,
                  actionPayload.query ? String(actionPayload.query) : undefined
                );
                if (launchUrl) {
                  actionPayload.launchUrl = launchUrl;
                }

                if (actionPayload.type === 'play_media') {
                  const mediaInfo = await resolvePlayableMedia(
                    String(actionPayload.query || actionPayload.target || '')
                  );
                  actionPayload = {
                    ...actionPayload,
                    ...mediaInfo,
                    launchUrl: mediaInfo.mediaWatchUrl,
                    summary: `Playing "${mediaInfo.mediaTitle}" on ${
                      actionPayload.target || 'YouTube'
                    }`,
                  };
                }

                const nativeIntentUri = resolveNativeIntentUri(
                  String(actionPayload.type),
                  actionPayload.target ? String(actionPayload.target) : undefined,
                  actionPayload.query ? String(actionPayload.query) : undefined,
                  actionPayload.launchUrl ? String(actionPayload.launchUrl) : undefined
                );
                if (nativeIntentUri) {
                  actionPayload.nativeIntentUri = nativeIntentUri;
                }

                if (!isClosed && clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(
                    JSON.stringify({
                      deviceAction: actionPayload,
                      emotion: actionPayload.emotion,
                    })
                  );
                }

                const targetLower = String(actionPayload.target || '').toLowerCase();
                const isInAppAction =
                  actionPayload.type === 'play_media' ||
                  actionPayload.type === 'stop_media' ||
                  actionPayload.type === 'toggle_flashlight' ||
                  actionPayload.type === 'start_recording' ||
                  actionPayload.type === 'stop_recording' ||
                  actionPayload.type === 'generate_code' ||
                  actionPayload.type === 'tell_time_date' ||
                  (actionPayload.type === 'open_app' && targetLower.includes('camera'));
                const blockedByPreviewIframe =
                  inIframe && !hasNativeBridge && !isInAppAction;

                try {
                  liveSession?.sendToolResponse({
                    functionResponses: [
                      {
                        id: call.id,
                        name: call.name,
                        response: blockedByPreviewIframe
                          ? {
                              status: 'blocked_by_preview_iframe',
                              reason:
                                'Preview iframe sandbox blocks launching external Android apps without APK.',
                              instruction:
                                'Tell Sagar honestly in Hinglish to tap Open Full App above chat or install the Android APK from Device tab.',
                              summary: actionPayload.summary,
                            }
                          : {
                              status: 'executed',
                              summary: actionPayload.summary,
                              mediaTitle: actionPayload.mediaTitle,
                            },
                      },
                    ],
                  });
                } catch (toolErr) {
                  console.error('Live sendToolResponse error:', toolErr);
                }
              }
            }

            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ turnComplete: true }));
            }
          },
          onerror: (err: unknown) => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  error:
                    err instanceof Error
                      ? err.message
                      : 'Live session encountered an error.',
                })
              );
            }
          },
          onclose: () => {
            if (!isClosed && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ closed: true }));
            }
          },
        },
      });

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ ready: true }));
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to connect Live API';
      console.error('Live API connection error:', err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ error: msg }));
        clientWs.close();
      }
      return;
    }

    clientWs.on('message', (raw) => {
      if (!liveSession || isClosed) return;
      try {
        const payload = JSON.parse(raw.toString()) as {
          audio?: string;
          video?: { data: string; mimeType: string };
          text?: string;
        };
        if (payload.audio) {
          liveSession.sendRealtimeInput({
            audio: {
              data: payload.audio,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        }
        if (payload.video) {
          liveSession.sendRealtimeInput({
            video: {
              data: payload.video.data,
              mimeType: payload.video.mimeType || 'image/jpeg',
            },
          });
        }
        if (payload.text) {
          liveSession.sendRealtimeInput({
            text: payload.text,
          });
        }
      } catch (e) {
        console.error('Live WS message parse error:', e);
      }
    });

    clientWs.on('close', () => {
      isClosed = true;
      try {
        liveSession?.close();
      } catch {
        // Ignore close errors
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
