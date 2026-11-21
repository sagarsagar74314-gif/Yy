import React, { useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Mic,
  Square,
  Send,
  Volume2,
  VolumeX,
  ImagePlus,
  ChevronDown,
  ChevronUp,
  Radio,
  ShieldCheck,
  Zap,
  Brain,
  BellRing,
  X,
  LogOut,
  Loader2,
  EyeOff,
  Eye,
  ExternalLink,
  Play,
  Flashlight,
  Video,
  Download,
  Copy,
  Check,
  Smartphone,
  Camera,
  RotateCcw,
} from 'lucide-react';
import {
  AndroidDeviceState,
  ChatAttachment,
  ChatMessage,
  CompanionEmotion,
  DeviceActionPayload,
  VoiceprintProfile,
} from './types';
import {
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from './lib/workspaceAuth';
import {
  clearVoiceprintProfile,
  extractAudioFeatures,
  loadVoiceprintProfile,
  matchOwnerVoiceprint,
  saveVoiceprintProfile,
} from './lib/voiceprint';
import { detectInstantLaunchTarget } from './lib/instantLaunch';
import { AnimeCompanion3D } from './components/AnimeCompanion3D';
import { FloatingMicOrb } from './components/FloatingMicOrb';
import { AndroidControlHub } from './components/AndroidControlHub';
import { VideoStudio } from './components/VideoStudio';
import { WorkspaceHub } from './components/WorkspaceHub';

declare global {
  interface Window {
    AanyaAndroidBridge?: {
      dispatchDeviceAction: (actionJson: string) => void;
      isAccessibilityEnabled?: () => boolean;
      readCurrentScreen?: () => string;
      openAccessibilitySettings?: () => void;
      openOverlaySettings?: () => void;
    };
  }
}

type AppView = 'companion' | 'device' | 'video' | 'workspace';

function downsampleFloat32(
  buffer: Float32Array,
  fromRate: number,
  toRate = 16000
): Float32Array {
  if (fromRate === toRate || fromRate < toRate) {
    return buffer;
  }
  const ratio = fromRate / toRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (
      let i = offsetBuffer;
      i < nextOffsetBuffer && i < buffer.length;
      i++
    ) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function floatTo16BitPcmBase64(float32: Float32Array): string {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64PcmToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const float32 = new Float32Array(bytes.length / 2);
  for (let i = 0; i < float32.length; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function playAlarmTone() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);
      gain.gain.setValueAtTime(0.18, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.36);
    });
  } catch {
    // Audio playback blocked
  }
}

function mergeTranscriptChunk(existing: string, incoming: string): string {
  const cleanIncoming = incoming.replace(/^\[MOOD:[a-zA-Z]+\]\s*/i, '');
  if (!cleanIncoming.trim()) return existing;
  if (!existing) return cleanIncoming.trimStart();
  if (cleanIncoming.startsWith(existing)) return cleanIncoming;
  const needsSpace =
    !/[\s\n]$/.test(existing) &&
    !/^[\s.,!?;:'")\]\n]/.test(cleanIncoming);
  return existing + (needsSpace ? ' ' : '') + cleanIncoming;
}

function sanitizeLiveDisplayText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.includes('"reply"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed.reply === 'string') return parsed.reply;
    } catch {
      const match = trimmed.match(/"reply"\s*:\s*"([^"]*)/);
      if (match?.[1]) return match[1];
    }
  }
  return text;
}

function extractHtmlBlock(text: string): string | null {
  const match = text.match(/```html\s*([\s\S]*?)```/i);
  if (match?.[1]?.trim()) return match[1].trim();
  const trimmed = text.trim();
  if (trimmed.startsWith('<!DOCTYPE html') || trimmed.startsWith('<html')) {
    return trimmed;
  }
  return null;
}

function extractFirstCodeBlock(text: string): string | null {
  const match = text.match(/```[a-zA-Z0-9_-]*\s*([\s\S]*?)```/);
  return match?.[1]?.trim() || null;
}

export default function App() {
  const [view, setView] = useState<AppView>('companion');
  const [dockOpen, setDockOpen] = useState(true);

  // Auth & Workspace state
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [latestMeetUrl, setLatestMeetUrl] = useState<string | null>(null);

  // Companion Persona & Chat state
  const [emotion, setEmotion] = useState<CompanionEmotion>('happy');
  const [speedMode, setSpeedMode] = useState<'fast' | 'smart'>('fast');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [autoHideOrb, setAutoHideOrb] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      text: 'Namaste Sagar! Main Aanya hoon. Boliye—aaj mobile settings control karwani hai, CapCut/video edit karna hai, Chrome search, ya dil ki koi baat karni hai?',
      timestamp: Date.now(),
      emotion: 'happy',
      speechStyle: 'Warm, affectionate anime companion voice',
    },
  ]);

  // Voice & Audio refs (persistent AudioContext unlocked on user gesture for Android Chrome)
  const audioLevelRef = useRef<number>(0);
  const [liveOrbLevel, setLiveOrbLevel] = useState(0);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const activeTtsSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ttsAnimRef = useRef<number>(0);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Live API WebSocket state
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveConnecting, setLiveConnecting] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const isSpeakingRef = useRef(false);
  const liveUserBubbleIdRef = useRef<string | null>(null);
  const liveAssistantBubbleIdRef = useRef<string | null>(null);
  const liveAssistantPlaceholderRef = useRef(false);
  const livePendingActionRef = useRef<DeviceActionPayload | null>(null);
  const liveActionFlushTimerRef = useRef<number | null>(null);
  const liveRecentActionBubbleRef = useRef<{
    id: string;
    timestamp: number;
  } | null>(null);
  const lastAutoIntentRef = useRef<{ uri: string; at: number } | null>(null);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  // Short-clip Transcriber (gemini-3.5-transcribe)
  const [isRecordingClip, setIsRecordingClip] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const clipChunksRef = useRef<BlobPart[]>([]);

  // Owner Voiceprint Isolation state
  const [voiceprint, setVoiceprint] = useState<VoiceprintProfile | null>(() =>
    loadVoiceprintProfile()
  );
  const [voiceLockEnabled, setVoiceLockEnabled] = useState(false);
  const [isEnrollingVoice, setIsEnrollingVoice] = useState(false);
  const [voiceMatchStatus, setVoiceMatchStatus] = useState<
    'idle' | 'verified' | 'rejected'
  >('idle');
  const voiceLockRef = useRef(voiceLockEnabled);
  const voiceprintRef = useRef(voiceprint);
  const lastVerifiedAtRef = useRef<number>(0);

  useEffect(() => {
    voiceLockRef.current = voiceLockEnabled;
  }, [voiceLockEnabled]);
  useEffect(() => {
    voiceprintRef.current = voiceprint;
  }, [voiceprint]);

  // Android Device State, Hardware Torch, Self-Recorder & Alarms
  const [ringingAlarm, setRingingAlarm] = useState<string | null>(null);
  const [torchStatus, setTorchStatus] = useState<
    'idle' | 'active' | 'unsupported' | 'permission_needed'
  >('idle');
  const torchStreamRef = useRef<MediaStream | null>(null);

  const [isSelfRecording, setIsSelfRecording] = useState(false);
  const [selfRecordingUrl, setSelfRecordingUrl] = useState<string | null>(null);
  const selfRecorderRef = useRef<MediaRecorder | null>(null);
  const selfRecChunksRef = useRef<BlobPart[]>([]);
  const selfRecStreamRef = useRef<MediaStream | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [previewHtmlMsgId, setPreviewHtmlMsgId] = useState<string | null>(null);
  const [stoppedMediaEpoch, setStoppedMediaEpoch] = useState<number>(0);

  // Real Live Camera Viewfinder state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const [deviceState, setDeviceState] = useState<AndroidDeviceState>({
    panelExpanded: false,
    wifi: true,
    mobileData: true,
    flashlight: false,
    bluetooth: false,
    activeApp: 'Aanya Home Launcher',
    screenContent: 'Listening for Sagar voice or tap instructions.',
    typedText: '',
    lastTapTarget: '',
    chromeUrl: '',
    recordingActive: false,
    chromeDownloads: [],
    capcutStatus: 'Idle',
    alarms: [],
    recentLogs: [],
  });

  const applyHardwareTorch = useCallback(async (turnOn: boolean) => {
    try {
      if (!turnOn) {
        if (torchStreamRef.current) {
          torchStreamRef.current.getTracks().forEach((t) => t.stop());
          torchStreamRef.current = null;
        }
        setTorchStatus('idle');
        setDeviceState((prev) => ({ ...prev, flashlight: false }));
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setTorchStatus('unsupported');
        return;
      }

      const stream =
        torchStreamRef.current ||
        (await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        }));
      torchStreamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as
        | (MediaTrackCapabilities & { torch?: boolean })
        | undefined;

      if (track && caps && 'torch' in caps && caps.torch) {
        await track.applyConstraints({
          advanced: [{ torch: true } as MediaTrackConstraintSet],
        });
        setTorchStatus('active');
        setDeviceState((prev) => ({ ...prev, flashlight: true }));
      } else {
        // Desktop / browser without LED torch hardware
        stream.getTracks().forEach((t) => t.stop());
        torchStreamRef.current = null;
        setTorchStatus('unsupported');
      }
    } catch {
      setTorchStatus('permission_needed');
    }
  }, []);

  const stopSelfRecording = useCallback(() => {
    if (selfRecorderRef.current && selfRecorderRef.current.state !== 'inactive') {
      selfRecorderRef.current.stop();
    }
    setIsSelfRecording(false);
    setDeviceState((prev) => ({ ...prev, recordingActive: false }));
  }, []);

  const startSelfRecording = useCallback(async () => {
    if (isSelfRecording) {
      stopSelfRecording();
      return;
    }
    try {
      let stream: MediaStream;
      if (navigator.mediaDevices?.getDisplayMedia) {
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      selfRecStreamRef.current = stream;
      selfRecChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      selfRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) selfRecChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        selfRecStreamRef.current = null;
        const blob = new Blob(selfRecChunksRef.current, {
          type: recorder.mimeType || 'video/webm',
        });
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          setSelfRecordingUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
          setDeviceState((prev) => ({
            ...prev,
            recordingActive: false,
            recordingUrl: url,
          }));
        }
        setIsSelfRecording(false);
      };

      recorder.start(500);
      setIsSelfRecording(true);
      setDeviceState((prev) => ({
        ...prev,
        recordingActive: true,
        activeApp: 'Aanya Screen & Voice Recorder',
        screenContent: 'Recording active — tap Stop & Save anytime.',
      }));
    } catch (err) {
      setLiveError(
        err instanceof Error ? err.message : 'Recording permission denied.'
      );
    }
  }, [isSelfRecording, stopSelfRecording]);

  // Unlock shared Web Audio context synchronously inside user tap/click handlers
  const unlockPlaybackAudio = useCallback(() => {
    try {
      if (!playbackCtxRef.current || playbackCtxRef.current.state === 'closed') {
        playbackCtxRef.current = new AudioContext();
      }
      if (playbackCtxRef.current.state === 'suspended') {
        playbackCtxRef.current.resume().catch(() => {});
      }
    } catch {
      // Ignore if AudioContext unavailable
    }
  }, []);

  // Init Firebase Auth listener
  useEffect(() => {
    const unsub = initAuth(
      (u) => {
        setUser(u);
        setIsAuthenticated(true);
      },
      (u) => {
        setUser(u);
        setIsAuthenticated(false);
      }
    );
    return () => unsub();
  }, []);

  // Scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // Live Alarm checker every second
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')}`;
      setDeviceState((prev) => {
        let changed = false;
        const nextAlarms = prev.alarms.map((a) => {
          if (a.enabled && !a.triggered && a.time === hhmm) {
            changed = true;
            setRingingAlarm(`${a.time} · ${a.label}`);
            playAlarmTone();
            return { ...a, triggered: true };
          }
          return a;
        });
        return changed ? { ...prev, alarms: nextAlarms } : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSignIn = async () => {
    setIsLoggingIn(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setIsAuthenticated(true);
      }
    } catch (err) {
      console.error('Google sign in error:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  const speakWithBrowserFallback = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return false;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(
        text.replace(/```[\s\S]*?```/g, 'Code screen par hai.')
      );
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find((v) => /hi-IN|en-IN/i.test(v.lang) && /female|lekha|heera|kalpana|swara/i.test(v.name)) ||
        voices.find((v) => /hi-IN|en-IN/i.test(v.lang)) ||
        voices.find((v) => /female|samantha|zira|google/i.test(v.name));
      if (preferred) utter.voice = preferred;
      utter.pitch = 1.15;
      utter.rate = 1.0;
      utter.onstart = () => {
        setIsSpeaking(true);
        audioLevelRef.current = 0.35;
      };
      utter.onend = () => {
        setIsSpeaking(false);
        audioLevelRef.current = 0;
        setLiveOrbLevel(0);
      };
      utter.onerror = () => {
        setIsSpeaking(false);
        audioLevelRef.current = 0;
        setLiveOrbLevel(0);
      };
      window.speechSynthesis.speak(utter);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Speak via gemini-3.8-flash-tts (decoded into unlocked Web AudioContext for mobile reliability)
  const speakMessage = useCallback(
    async (text: string, style?: string, msgEmotion?: CompanionEmotion) => {
      unlockPlaybackAudio();
      try {
        if (activeTtsSourceRef.current) {
          try {
            activeTtsSourceRef.current.stop();
          } catch {
            // Ignore
          }
          activeTtsSourceRef.current = null;
        }
        cancelAnimationFrame(ttsAnimRef.current);
        setIsSpeaking(true);

        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            style,
            emotion: msgEmotion || emotion,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.audioBase64) {
          throw new Error(data.error || 'TTS failed');
        }

        const ctx = playbackCtxRef.current || new AudioContext();
        playbackCtxRef.current = ctx;
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        const wavBuffer = base64ToArrayBuffer(data.audioBase64);
        const decoded = await ctx.decodeAudioData(wavBuffer);
        const source = ctx.createBufferSource();
        source.buffer = decoded;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(ctx.destination);

        activeTtsSourceRef.current = source;
        const timeSamples = new Float32Array(analyser.fftSize);

        const pumpLipSync = () => {
          if (activeTtsSourceRef.current === source) {
            analyser.getFloatTimeDomainData(timeSamples);
            let sq = 0;
            for (let i = 0; i < timeSamples.length; i += 4) {
              sq += timeSamples[i] * timeSamples[i];
            }
            const rms = Math.sqrt(sq / (timeSamples.length / 4));
            const lvl = Math.min(1, rms * 3.5);
            audioLevelRef.current = lvl;
            setLiveOrbLevel(lvl);
            ttsAnimRef.current = requestAnimationFrame(pumpLipSync);
          }
        };

        source.onended = () => {
          cancelAnimationFrame(ttsAnimRef.current);
          if (activeTtsSourceRef.current === source) {
            activeTtsSourceRef.current = null;
          }
          audioLevelRef.current = 0;
          setLiveOrbLevel(0);
          setIsSpeaking(false);
        };

        source.start(0);
        pumpLipSync();
      } catch (err) {
        console.warn('Gemini TTS fallback triggered:', err);
        const spokeFallback = speakWithBrowserFallback(text);
        if (!spokeFallback) {
          audioLevelRef.current = 0;
          setLiveOrbLevel(0);
          setIsSpeaking(false);
        }
      }
    },
    [emotion, speakWithBrowserFallback, unlockPlaybackAudio]
  );

  const stopActiveMediaPlayback = useCallback(() => {
    try {
      document
        .querySelectorAll<HTMLIFrameElement>('iframe[data-aanya-media="1"]')
        .forEach((frame) => {
          try {
            frame.contentWindow?.postMessage(
              JSON.stringify({ event: 'command', func: 'stopVideo', args: '' }),
              '*'
            );
          } catch {
            // Ignore cross-origin frame postMessage failure
          }
        });
    } catch {
      // Ignore DOM query errors
    }
    setStoppedMediaEpoch(Date.now());
    setDeviceState((prev) => ({
      ...prev,
      mediaEmbedUrl: undefined,
      mediaTitle: undefined,
      mediaWatchUrl: undefined,
      screenContent: 'Media playback stopped.',
    }));
  }, []);

  const closeLiveCamera = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
    setCameraError(null);
  }, []);

  const openLiveCamera = useCallback(
    async (overrideFacing?: 'environment' | 'user') => {
      const targetFacing = overrideFacing || cameraFacingMode;
      try {
        setCameraError(null);
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Browser camera access is unavailable.');
        }
        if (cameraStreamRef.current) {
          cameraStreamRef.current.getTracks().forEach((t) => t.stop());
          cameraStreamRef.current = null;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: targetFacing } },
          audio: false,
        });
        cameraStreamRef.current = stream;
        setCameraFacingMode(targetFacing);
        setCapturedPhotoUrl(null);
        setIsCameraOpen(true);
        setDeviceState((prev) => ({
          ...prev,
          activeApp: 'Camera',
          screenContent: `Live ${targetFacing === 'user' ? 'Front' : 'Back'} Camera active.`,
        }));
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Camera permission needed — tap Camera in dock.';
        setCameraError(msg);
      }
    },
    [cameraFacingMode]
  );

  useEffect(() => {
    if (isCameraOpen && cameraVideoRef.current && cameraStreamRef.current) {
      cameraVideoRef.current.srcObject = cameraStreamRef.current;
      cameraVideoRef.current.play().catch(() => {});
    }
  }, [isCameraOpen]);

  const captureCameraPhoto = useCallback(() => {
    const video = cameraVideoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturedPhotoUrl(canvas.toDataURL('image/jpeg', 0.92));
  }, []);

  const flipLiveCamera = useCallback(() => {
    const nextFacing = cameraFacingMode === 'environment' ? 'user' : 'environment';
    void openLiveCamera(nextFacing);
  }, [cameraFacingMode, openLiveCamera]);

  // Programmatically fire Android native intent URI or HTTPS App Link without needing a manual "Open" tap
  const triggerZeroTapAndroidLaunch = useCallback(
    (action: DeviceActionPayload): boolean => {
      if (window.AanyaAndroidBridge) return true;
      const nativeUri =
        action.nativeIntentUri ||
        (action.type === 'make_call' && action.target
          ? `tel:${encodeURIComponent(action.target)}`
          : action.type === 'open_maps' && action.query
            ? `geo:0,0?q=${encodeURIComponent(action.query)}`
            : undefined);
      const webUrl =
        action.launchUrl && /^https?:\/\//i.test(action.launchUrl)
          ? action.launchUrl
          : undefined;
      const dedupKey = nativeUri || webUrl;
      if (!dedupKey) return false;

      // Skip double-firing identical intent within 15s (e.g. sync pre-launch + API reply)
      const now = Date.now();
      if (
        lastAutoIntentRef.current &&
        lastAutoIntentRef.current.uri === dedupKey &&
        now - lastAutoIntentRef.current.at < 15000
      ) {
        return true;
      }

      const inIframe = window.self !== window.top;
      const isAndroid = /Android/i.test(navigator.userAgent);
      const hasGesture =
        typeof navigator !== 'undefined' &&
        'userActivation' in navigator &&
        Boolean(navigator.userActivation?.isActive);

      try {
        if (!inIframe && isAndroid && nativeUri) {
          lastAutoIntentRef.current = { uri: dedupKey, at: now };
          window.location.assign(nativeUri);
          return true;
        }

        // Inside AI Studio Preview iframe or desktop browsers: HTTPS links opened with
        // target="_blank" during an active tap/submit gesture escape sandbox and trigger
        // Android App Links (opening YouTube/WhatsApp/Maps directly) or open in a new tab.
        if (webUrl && hasGesture) {
          lastAutoIntentRef.current = { uri: dedupKey, at: now };
          const a = document.createElement('a');
          a.href = webUrl;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          return true;
        }

        if (nativeUri && isAndroid && hasGesture) {
          lastAutoIntentRef.current = { uri: dedupKey, at: now };
          const a = document.createElement('a');
          a.href = nativeUri;
          if (inIframe) {
            a.target = '_top';
          }
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          return true;
        }

        return false;
      } catch {
        return false;
      }
    },
    []
  );

  // Execute Android & Workspace actions returned by Gemini
  const dispatchDeviceAction = useCallback(
    async (action: DeviceActionPayload) => {
      if (!action || action.type === 'none') return;

      let nativeBridgeActive = false;
      try {
        if (window.AanyaAndroidBridge) {
          window.AanyaAndroidBridge.dispatchDeviceAction(JSON.stringify(action));
          nativeBridgeActive = true;
        }
      } catch {
        // Running in standard browser
      }

      if (!nativeBridgeActive && action.type !== 'stop_media') {
        triggerZeroTapAndroidLaunch(action);
      }

      if (action.type === 'open_app' && /camera/i.test(action.target || '')) {
        if (!nativeBridgeActive) {
          void openLiveCamera();
        }
      }

      if (action.type === 'stop_media') {
        stopActiveMediaPlayback();
        closeLiveCamera();
      }

      const logTime = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      setDeviceState((prev) => {
        const next = { ...prev };
        next.recentLogs = [
          {
            id: `${Date.now()}-${Math.random()}`,
            time: logTime,
            action: action.type,
            detail: action.summary,
          },
          ...prev.recentLogs.slice(0, 14),
        ];

        switch (action.type) {
          case 'slide_panel':
            next.panelExpanded =
              action.value === 'close'
                ? false
                : action.value === 'open'
                  ? true
                  : !prev.panelExpanded;
            break;
          case 'toggle_wifi':
            next.wifi =
              action.value === 'on'
                ? true
                : action.value === 'off'
                  ? false
                  : !prev.wifi;
            break;
          case 'toggle_data':
            next.mobileData =
              action.value === 'on'
                ? true
                : action.value === 'off'
                  ? false
                  : !prev.mobileData;
            break;
          case 'toggle_flashlight':
            next.flashlight =
              action.value === 'on'
                ? true
                : action.value === 'off'
                  ? false
                  : !prev.flashlight;
            break;
          case 'toggle_bluetooth':
            next.bluetooth =
              action.value === 'on'
                ? true
                : action.value === 'off'
                  ? false
                  : !prev.bluetooth;
            break;
          case 'open_settings':
            next.activeApp = 'Android Settings';
            next.screenContent =
              'System Settings opened: Network, Display, Sound, Apps & Security.';
            break;
          case 'search_settings':
            next.activeApp = 'Android Settings';
            next.typedText = action.query || '';
            next.screenContent = `Searching Settings for "${action.query || ''}"`;
            break;
          case 'type_text':
            next.typedText = action.value || '';
            next.screenContent = `Auto-typed into ${action.target || 'active input field'}`;
            break;
          case 'tap_target':
            next.lastTapTarget = action.target || 'Selected Element';
            next.screenContent = `Auto-tapped "${action.target || 'element'}" on screen`;
            break;
          case 'open_app':
            next.activeApp = action.target || 'App';
            next.screenContent = `Launched ${action.target || 'application'} in foreground.`;
            break;
          case 'play_media': {
            const songTitle = action.mediaTitle || action.query || action.target || 'Media';
            const watchUrl =
              action.mediaWatchUrl ||
              `https://www.youtube.com/results?search_query=${encodeURIComponent(songTitle)}`;
            next.activeApp = action.target || 'YouTube';
            next.typedText = action.query || songTitle;
            next.mediaTitle = songTitle;
            next.mediaEmbedUrl = action.mediaEmbedUrl;
            next.mediaWatchUrl = watchUrl;
            next.chromeUrl = watchUrl;
            next.screenContent = `Auto-playing "${songTitle}" in ${action.target || 'YouTube'}`;
            break;
          }
          case 'stop_media':
            next.mediaTitle = undefined;
            next.mediaEmbedUrl = undefined;
            next.mediaWatchUrl = undefined;
            next.screenContent = 'Stopped media playback.';
            break;
          case 'chrome_search':
            next.activeApp = 'Google Chrome';
            next.typedText = action.query || '';
            next.chromeUrl = `https://www.google.com/search?q=${encodeURIComponent(
              action.query || ''
            )}`;
            next.screenContent = `Chrome opened search for "${action.query || ''}"`;
            break;
          case 'chrome_download':
            next.activeApp = 'Chrome Downloads';
            next.chromeDownloads = [
              action.target || 'Requested package',
              ...prev.chromeDownloads,
            ];
            next.screenContent = `Prepared download queue for ${action.target || 'item'}`;
            break;
          case 'open_maps':
            next.activeApp = 'Google Maps';
            next.chromeUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              action.query || ''
            )}`;
            next.screenContent = `Maps navigated to "${action.query || ''}"`;
            break;
          case 'capcut_edit':
            next.activeApp = 'CapCut / Video Studio';
            next.capcutStatus = action.value || 'Cut ready';
            next.screenContent = `Video timeline action: ${action.value || 'Trimmed segment'}`;
            break;
          case 'set_alarm': {
            const timeVal = /^\d{1,2}:\d{2}$/.test(action.value || '')
              ? (action.value as string).padStart(5, '0')
              : '07:00';
            next.alarms = [
              {
                id: `alarm-${Date.now()}`,
                time: timeVal,
                label: action.target || 'Aanya Alarm',
                enabled: true,
              },
              ...prev.alarms,
            ];
            next.screenContent = `Alarm scheduled for ${timeVal}`;
            break;
          }
          case 'make_call':
            next.activeApp = 'Phone Dialer';
            next.screenContent = `Calling ${action.target || 'contact'}...`;
            break;
          case 'start_video_call':
            next.activeApp = 'Google Meet';
            next.screenContent = `Creating Google Meet room for ${action.target || 'video call'}...`;
            break;
          case 'check_messages':
            next.activeApp = 'Messages & Google Chat';
            next.screenContent = `Checking important messages (${action.query || 'latest'})`;
            break;
          case 'create_account_flow':
            next.activeApp = 'Account Setup Assistant';
            next.screenContent = `Guided setup prepared for ${action.target || 'new account'}`;
            break;
          case 'start_recording':
            next.recordingActive = true;
            next.activeApp = 'Aanya Recorder';
            next.screenContent = 'Self-recording started.';
            break;
          case 'stop_recording':
            next.recordingActive = false;
            next.screenContent = 'Recording stopped and ready to download.';
            break;
          default:
            break;
        }
        return next;
      });

      if (action.type === 'toggle_flashlight') {
        const desired =
          action.value === 'on'
            ? true
            : action.value === 'off'
              ? false
              : !deviceState.flashlight;
        void applyHardwareTorch(desired);
      }

      if (action.type === 'start_recording') {
        void startSelfRecording();
      } else if (action.type === 'stop_recording') {
        stopSelfRecording();
      }

      if (action.type === 'start_video_call') {
        const token = await getAccessToken();
        if (token) {
          try {
            const res = await fetch('https://meet.googleapis.com/v2/spaces', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({}),
            });
            const data = await res.json();
            if (res.ok && data.meetingUri) {
              setLatestMeetUrl(data.meetingUri);
            }
          } catch {
            // Ignored
          }
        }
      }
    },
    [
      applyHardwareTorch,
      closeLiveCamera,
      deviceState.flashlight,
      openLiveCamera,
      startSelfRecording,
      stopActiveMediaPlayback,
      stopSelfRecording,
      triggerZeroTapAndroidLaunch,
    ]
  );

  // Send text + optional image to Gemini /api/chat
  const handleSendMessage = useCallback(
    async (overrideText?: string) => {
      const textToSend = (overrideText ?? inputText).trim();
      if (!textToSend && !attachment) return;
      if (isSending) return;

      // Unlock audio synchronously while still inside user click/submit event!
      unlockPlaybackAudio();

      if (
        /\b(song|gaana|gana|music|video|youtube|player)\b.*\b(band|stop|pause|roko|off|chup|hatao)\b|\b(band|stop|pause|roko)\b.*\b(song|gaana|gana|music|video|youtube|chal)\b|\bsong\s+ko\s+band\b/i.test(
          textToSend
        )
      ) {
        stopActiveMediaPlayback();
      }
      if (
        /\bcamera\b.*\b(band|stop|close|off|hatao)\b|\b(band|stop|close|off)\b.*\bcamera\b/i.test(
          textToSend
        )
      ) {
        closeLiveCamera();
      }

      // Synchronously launch recognized apps BEFORE async fetch() so browser
      // userActivation stays active (allowing instant Android App Links / intents).
      let autoLaunchedTarget: string | undefined;
      const instantMatch = detectInstantLaunchTarget(textToSend);
      if (instantMatch && !window.AanyaAndroidBridge) {
        if (instantMatch.isCamera) {
          void openLiveCamera();
          autoLaunchedTarget = instantMatch.appName;
        } else {
          const fired = triggerZeroTapAndroidLaunch({
            type: 'open_app',
            target: instantMatch.appName,
            summary: `Opening ${instantMatch.appName}`,
            launchUrl: instantMatch.launchUrl,
            nativeIntentUri: instantMatch.nativeIntentUri,
          });
          if (fired) {
            autoLaunchedTarget = instantMatch.appName;
          }
        }
      }

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: textToSend || 'Please analyze this image.',
        timestamp: Date.now(),
        attachmentPreview: attachment?.previewUrl,
      };

      const historyPayload = messages.slice(-10).map((m) => ({
        role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
        text: m.text,
      }));

      setMessages((prev) => [...prev, userMsg]);
      if (!overrideText) setInputText('');
      const currentAttachment = attachment;
      setAttachment(null);
      setIsSending(true);
      setEmotion('thinking');

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: textToSend,
            history: historyPayload,
            speedMode,
            imageBase64: currentAttachment?.base64,
            imageMimeType: currentAttachment?.mimeType,
            localTimeString: new Date().toLocaleString(),
            deviceContext: {
              wifi: deviceState.wifi,
              mobileData: deviceState.mobileData,
              flashlight: deviceState.flashlight,
              activeApp: deviceState.activeApp,
              alarmsCount: deviceState.alarms.length,
            },
            deviceRuntime: {
              hasNativeBridge: Boolean(window.AanyaAndroidBridge),
              inIframe: window.self !== window.top,
              isAndroid: /Android/i.test(navigator.userAgent),
              autoLaunchedTarget,
            },
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to get response from Aanya.');
        }

        const nextEmotion = (data.emotion || 'happy') as CompanionEmotion;
        setEmotion(nextEmotion);

        const resolvedDeviceAction: DeviceActionPayload | undefined =
          data.deviceAction
            ? {
                ...data.deviceAction,
                autoLaunched:
                  Boolean(data.deviceAction.autoLaunched) ||
                  Boolean(autoLaunchedTarget),
              }
            : undefined;

        const aiMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: data.reply,
          timestamp: Date.now(),
          emotion: nextEmotion,
          speechStyle: data.speechStyle,
          latencyMs: data.latencyMs,
          modelUsed: data.modelUsed,
          deviceAction: resolvedDeviceAction,
          groundingSources: data.groundingSources,
        };

        setMessages((prev) => [...prev, aiMsg]);

        if (resolvedDeviceAction && resolvedDeviceAction.type !== 'none') {
          await dispatchDeviceAction(resolvedDeviceAction);
        }

        if (autoSpeak && !liveConnected) {
          speakMessage(data.reply, data.speechStyle, nextEmotion);
        }
      } catch (err) {
        setEmotion('caring');
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            text:
              err instanceof Error
                ? `Sagar, thodi technical dikkat aayi: ${err.message}`
                : 'Sagar, response generate karne me dikkat aayi.',
            timestamp: Date.now(),
            emotion: 'caring',
          },
        ]);
      } finally {
        setIsSending(false);
      }
    },
    [
      attachment,
      autoSpeak,
      closeLiveCamera,
      deviceState,
      dispatchDeviceAction,
      inputText,
      isSending,
      liveConnected,
      messages,
      openLiveCamera,
      speakMessage,
      speedMode,
      stopActiveMediaPlayback,
      triggerZeroTapAndroidLaunch,
      unlockPlaybackAudio,
    ]
  );

  // Image attachment handler
  const handleImageAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const [meta, base64] = dataUrl.split(',');
      const mimeMatch = meta.match(/data:(.*?);/);
      setAttachment({
        name: file.name,
        mimeType: mimeMatch?.[1] || 'image/png',
        base64,
        previewUrl: dataUrl,
      });
    };
    reader.readAsDataURL(file);
  };

  // Enroll Sagar's Owner Voiceprint (3 seconds)
  const handleEnrollVoiceprint = async () => {
    setIsEnrollingVoice(true);
    setLiveError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const ctx = new AudioContext();
      await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Float32Array(analyser.fftSize);
      const bandSamples: number[][] = [];
      const pitchSamples: number[] = [];
      const rmsSamples: number[] = [];

      const started = Date.now();
      await new Promise<void>((resolve) => {
        const sampleLoop = () => {
          analyser.getByteFrequencyData(freqData);
          analyser.getFloatTimeDomainData(timeData);
          const { bands, rms, pitchHz } = extractAudioFeatures(
            freqData,
            timeData,
            ctx.sampleRate
          );
          if (rms > 0.012) {
            bandSamples.push(bands);
            pitchSamples.push(pitchHz);
            rmsSamples.push(rms);
          }
          if (Date.now() - started < 3000) {
            requestAnimationFrame(sampleLoop);
          } else {
            resolve();
          }
        };
        sampleLoop();
      });

      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();

      if (bandSamples.length < 3) {
        throw new Error('Voice was too quiet. Please speak clearly for 3 seconds.');
      }

      const avgBands = new Array<number>(16).fill(0);
      for (const sample of bandSamples) {
        for (let i = 0; i < 16; i++) avgBands[i] += sample[i];
      }
      for (let i = 0; i < 16; i++) avgBands[i] /= bandSamples.length;

      const avgPitch =
        pitchSamples.reduce((a, b) => a + b, 0) / pitchSamples.length;
      const avgRms = rmsSamples.reduce((a, b) => a + b, 0) / rmsSamples.length;

      const profile: VoiceprintProfile = {
        enrolled: true,
        ownerName: 'Sagar',
        spectralBands: avgBands,
        pitchHz: avgPitch,
        energyThreshold: Math.max(0.01, avgRms * 0.25),
        enrolledAt: Date.now(),
      };
      saveVoiceprintProfile(profile);
      setVoiceprint(profile);
      setVoiceLockEnabled(true);
      setEmotion('happy');
    } catch (err) {
      setLiveError(
        err instanceof Error ? err.message : 'Could not enroll voiceprint.'
      );
    } finally {
      setIsEnrollingVoice(false);
    }
  };

  // Stop Gemini Live API Session
  const stopLiveSession = useCallback(() => {
    setLiveConnected(false);
    setLiveConnecting(false);
    setVoiceMatchStatus('idle');
    audioLevelRef.current = 0;
    setLiveOrbLevel(0);
    liveUserBubbleIdRef.current = null;
    liveAssistantBubbleIdRef.current = null;
    liveAssistantPlaceholderRef.current = false;
    livePendingActionRef.current = null;
    liveRecentActionBubbleRef.current = null;
    if (liveActionFlushTimerRef.current !== null) {
      window.clearTimeout(liveActionFlushTimerRef.current);
      liveActionFlushTimerRef.current = null;
    }

    activeSourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch {
        // Ignore
      }
    });
    activeSourcesRef.current = [];
    nextPlayTimeRef.current = 0;

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // Ignore
      }
      processorRef.current = null;
    }
    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect();
      } catch {
        // Ignore
      }
      micSourceRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
  }, []);

  // Start Gemini Live API Real-Time Voice Session (gemini-3.8-live)
  const startLiveSession = useCallback(async () => {
    if (liveConnected || liveConnecting) {
      stopLiveSession();
      return;
    }

    // Create & unlock BOTH AudioContexts synchronously inside the tap gesture BEFORE any await!
    unlockPlaybackAudio();
    let inputCtx: AudioContext;
    let outputCtx: AudioContext;
    try {
      inputCtx = new AudioContext();
      inputCtx.resume().catch(() => {});
      try {
        outputCtx = new AudioContext({ sampleRate: 24000 });
      } catch {
        outputCtx = new AudioContext();
      }
      outputCtx.resume().catch(() => {});
    } catch (err) {
      setLiveError(
        err instanceof Error ? err.message : 'Browser audio system unavailable.'
      );
      return;
    }

    inputCtxRef.current = inputCtx;
    outputCtxRef.current = outputCtx;
    nextPlayTimeRef.current = outputCtx.currentTime;
    liveUserBubbleIdRef.current = null;
    liveAssistantBubbleIdRef.current = null;
    livePendingActionRef.current = null;

    setLiveError(null);
    setLiveConnecting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;

      if (inputCtx.state === 'suspended') {
        await inputCtx.resume();
      }
      if (outputCtx.state === 'suspended') {
        await outputCtx.resume();
      }

      const source = inputCtx.createMediaStreamSource(stream);
      micSourceRef.current = source;
      const analyser = inputCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      const silentGain = inputCtx.createGain();
      silentGain.gain.value = 0;
      analyser.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(inputCtx.destination);

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const hasApk = window.AanyaAndroidBridge ? '1' : '0';
      const inIframe = window.self !== window.top ? '1' : '0';
      const ws = new WebSocket(
        `${proto}//${window.location.host}/live?apk=${hasApk}&iframe=${inIframe}`
      );
      wsRef.current = ws;

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Float32Array(analyser.fftSize);

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as {
          ready?: boolean;
          audio?: string;
          inputTranscript?: string;
          outputTranscript?: string;
          deviceAction?: DeviceActionPayload;
          emotion?: CompanionEmotion;
          interrupted?: boolean;
          turnComplete?: boolean;
          error?: string;
        };

        if (msg.ready) {
          setLiveConnecting(false);
          setLiveConnected(true);
          setEmotion('happy');
          // Ask Aanya to greet Sagar aloud right when voice connects
          ws.send(
            JSON.stringify({
              text: 'Hii Aanya, main Sagar bol raha hoon. Chhota sa pyaara greeting do aur pucho kya kaam karna hai.',
            })
          );
        }
        if (msg.error) {
          setLiveError(msg.error);
          stopLiveSession();
          return;
        }
        if (msg.interrupted) {
          activeSourcesRef.current.forEach((s) => {
            try {
              s.stop();
            } catch {
              // Ignore
            }
          });
          activeSourcesRef.current = [];
          if (outputCtxRef.current) {
            nextPlayTimeRef.current = outputCtxRef.current.currentTime;
          }
          setIsSpeaking(false);
          liveAssistantBubbleIdRef.current = null;
        }
        if (msg.deviceAction && msg.deviceAction.type !== 'none') {
          const actionPayload = msg.deviceAction;
          const nextMood = msg.emotion || actionPayload.emotion;
          if (nextMood) setEmotion(nextMood);
          livePendingActionRef.current = actionPayload;
          if (liveActionFlushTimerRef.current !== null) {
            window.clearTimeout(liveActionFlushTimerRef.current);
            liveActionFlushTimerRef.current = null;
          }
          void dispatchDeviceAction(actionPayload);

          const activeAid = liveAssistantBubbleIdRef.current;
          if (activeAid) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === activeAid ? { ...m, deviceAction: actionPayload } : m
              )
            );
          }
        }
        if (msg.audio && outputCtxRef.current) {
          if (outputCtxRef.current.state === 'suspended') {
            outputCtxRef.current.resume().catch(() => {});
          }
          const float32 = base64PcmToFloat32(msg.audio);
          const audioBuffer = outputCtxRef.current.createBuffer(
            1,
            float32.length,
            24000
          );
          audioBuffer.copyToChannel(new Float32Array(float32), 0);

          const bufSrc = outputCtxRef.current.createBufferSource();
          bufSrc.buffer = audioBuffer;
          bufSrc.connect(outputCtxRef.current.destination);

          const startAt = Math.max(
            outputCtxRef.current.currentTime,
            nextPlayTimeRef.current
          );
          bufSrc.start(startAt);
          nextPlayTimeRef.current = startAt + audioBuffer.duration;
          activeSourcesRef.current.push(bufSrc);
          setIsSpeaking(true);

          let sq = 0;
          for (let i = 0; i < float32.length; i += 8) {
            sq += float32[i] * float32[i];
          }
          const rms = Math.sqrt(sq / Math.max(1, float32.length / 8));
          audioLevelRef.current = Math.min(1, rms * 2.8);
          setLiveOrbLevel(Math.min(1, rms * 2.8));

          bufSrc.onended = () => {
            activeSourcesRef.current = activeSourcesRef.current.filter(
              (n) => n !== bufSrc
            );
            if (activeSourcesRef.current.length === 0) {
              setIsSpeaking(false);
              audioLevelRef.current = 0;
              setLiveOrbLevel(0);
            }
          };
        }
        if (msg.inputTranscript) {
          const chunk = msg.inputTranscript;
          if (chunk.trim()) {
            liveAssistantBubbleIdRef.current = null;
            liveRecentActionBubbleRef.current = null;
            if (
              /\b(song|gaana|gana|music|video|youtube|player)\b.*\b(band|stop|pause|roko|off|chup|hatao)\b|\b(band|stop|pause|roko)\b.*\b(song|gaana|gana|music|video|youtube|chal)\b|\bsong\s+ko\s+band\b/i.test(
                chunk
              )
            ) {
              stopActiveMediaPlayback();
            }
            if (
              /\bcamera\b.*\b(band|stop|close|off|hatao)\b|\b(band|stop|close|off)\b.*\bcamera\b/i.test(
                chunk
              )
            ) {
              closeLiveCamera();
            }
            if (!liveUserBubbleIdRef.current) {
              const id = `live-u-${Date.now()}`;
              liveUserBubbleIdRef.current = id;
              setMessages((prev) => [
                ...prev,
                {
                  id,
                  role: 'user',
                  text: chunk.trim(),
                  timestamp: Date.now(),
                },
              ]);
            } else {
              const targetId = liveUserBubbleIdRef.current;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === targetId
                    ? { ...m, text: mergeTranscriptChunk(m.text, chunk) }
                    : m
                )
              );
            }
          }
        }
        if (msg.outputTranscript) {
          const chunk = sanitizeLiveDisplayText(msg.outputTranscript);
          if (chunk.trim()) {
            liveUserBubbleIdRef.current = null;
            if (liveActionFlushTimerRef.current !== null) {
              window.clearTimeout(liveActionFlushTimerRef.current);
              liveActionFlushTimerRef.current = null;
            }
            if (!liveAssistantBubbleIdRef.current) {
              const recent = liveRecentActionBubbleRef.current;
              if (recent && Date.now() - recent.timestamp < 5000) {
                liveRecentActionBubbleRef.current = null;
                liveAssistantBubbleIdRef.current = recent.id;
                liveAssistantPlaceholderRef.current = false;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === recent.id ? { ...m, text: chunk.trim() } : m
                  )
                );
              } else {
                const id = `live-a-${Date.now()}`;
                liveAssistantBubbleIdRef.current = id;
                liveAssistantPlaceholderRef.current = false;
                const pendingAction =
                  livePendingActionRef.current || undefined;
                livePendingActionRef.current = null;
                setMessages((prev) => [
                  ...prev,
                  {
                    id,
                    role: 'assistant',
                    text: chunk.trim(),
                    timestamp: Date.now(),
                    emotion: pendingAction?.emotion || 'happy',
                    modelUsed: 'gemini-3.8-live',
                    deviceAction: pendingAction,
                  },
                ]);
              }
            } else {
              const targetId = liveAssistantBubbleIdRef.current;
              const replacePlaceholder = liveAssistantPlaceholderRef.current;
              liveAssistantPlaceholderRef.current = false;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === targetId
                    ? {
                        ...m,
                        text: replacePlaceholder
                          ? chunk.trimStart()
                          : sanitizeLiveDisplayText(
                              mergeTranscriptChunk(m.text, chunk)
                            ),
                      }
                    : m
                )
              );
            }
          }
        }
        if (msg.turnComplete) {
          if (livePendingActionRef.current && !liveAssistantBubbleIdRef.current) {
            if (liveActionFlushTimerRef.current !== null) {
              window.clearTimeout(liveActionFlushTimerRef.current);
            }
            liveActionFlushTimerRef.current = window.setTimeout(() => {
              liveActionFlushTimerRef.current = null;
              const actionPayload = livePendingActionRef.current;
              if (!actionPayload || liveAssistantBubbleIdRef.current) return;
              const fallbackId = `live-a-${Date.now()}`;
              livePendingActionRef.current = null;
              liveRecentActionBubbleRef.current = {
                id: fallbackId,
                timestamp: Date.now(),
              };
              setMessages((prev) => [
                ...prev,
                {
                  id: fallbackId,
                  role: 'assistant',
                  text: actionPayload.summary,
                  timestamp: Date.now(),
                  emotion: actionPayload.emotion || 'happy',
                  modelUsed: 'gemini-3.8-live',
                  deviceAction: actionPayload,
                },
              ]);
            }, 950);
          }
          liveUserBubbleIdRef.current = null;
          liveAssistantBubbleIdRef.current = null;
          liveAssistantPlaceholderRef.current = false;
        }
      };

      ws.onerror = () => {
        setLiveError('Live voice WebSocket connection failed.');
        stopLiveSession();
      };

      ws.onclose = () => {
        stopLiveSession();
      };

      processor.onaudioprocess = (ev) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const inputSamples = ev.inputBuffer.getChannelData(0);

        if (voiceLockRef.current && voiceprintRef.current?.enrolled) {
          analyser.getByteFrequencyData(freqData);
          analyser.getFloatTimeDomainData(timeData);
          const { bands, rms, pitchHz } = extractAudioFeatures(
            freqData,
            timeData,
            inputCtx.sampleRate
          );
          if (rms > voiceprintRef.current.energyThreshold) {
            const match = matchOwnerVoiceprint(
              bands,
              pitchHz,
              rms,
              voiceprintRef.current
            );
            if (match.isMatch) {
              lastVerifiedAtRef.current = Date.now();
              setVoiceMatchStatus('verified');
            } else if (Date.now() - lastVerifiedAtRef.current > 550) {
              setVoiceMatchStatus('rejected');
              return;
            }
          } else if (Date.now() - lastVerifiedAtRef.current > 600) {
            setVoiceMatchStatus('idle');
          }
        }

        let sq = 0;
        for (let i = 0; i < inputSamples.length; i += 8) {
          sq += inputSamples[i] * inputSamples[i];
        }
        const inRms = Math.sqrt(sq / Math.max(1, inputSamples.length / 8));
        if (!isSpeakingRef.current) {
          setLiveOrbLevel(Math.min(1, inRms * 3.0));
        }

        // Downsample from device hardware rate (e.g. 48kHz) to exact 16000Hz for Gemini Live
        const pcm16k = downsampleFloat32(
          inputSamples,
          inputCtx.sampleRate,
          16000
        );
        const base64Pcm = floatTo16BitPcmBase64(pcm16k);
        ws.send(JSON.stringify({ audio: base64Pcm }));
      };
    } catch (err) {
      setLiveError(
        err instanceof Error
          ? err.message
          : 'Microphone access denied or unavailable.'
      );
      stopLiveSession();
    }
  }, [
    closeLiveCamera,
    dispatchDeviceAction,
    liveConnected,
    liveConnecting,
    stopActiveMediaPlayback,
    stopLiveSession,
    unlockPlaybackAudio,
  ]);

  // One-shot Voice Clip Transcription via gemini-3.5-transcribe
  const handleToggleClipRecord = async () => {
    unlockPlaybackAudio();
    if (isRecordingClip) {
      mediaRecorderRef.current?.stop();
      setIsRecordingClip(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      clipChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) clipChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const resolvedMime = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(clipChunksRef.current, { type: resolvedMime });
        if (blob.size < 200) {
          setLiveError('Awaaz record nahi ho payi — mic tap karke thoda clearly boliye.');
          return;
        }
        setIsTranscribing(true);
        try {
          const reader = new FileReader();
          const base64Data = await new Promise<string>((resolve) => {
            reader.onload = () =>
              resolve(String(reader.result).split(',')[1] || '');
            reader.readAsDataURL(blob);
          });
          const res = await fetch('/api/audio/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: base64Data,
              mimeType: resolvedMime,
            }),
          });
          const data = await res.json();
          if (res.ok && data.transcript) {
            await handleSendMessage(data.transcript);
          } else if (data.error) {
            setLiveError(data.error);
          } else {
            setLiveError('Sagar, awaaz clear nahi thi—dobara boliye.');
          }
        } catch (err) {
          setLiveError(
            err instanceof Error ? err.message : 'Audio transcription failed.'
          );
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start(250);
      setIsRecordingClip(true);
    } catch (err) {
      setLiveError(
        err instanceof Error ? err.message : 'Microphone access unavailable.'
      );
    }
  };

  useEffect(() => {
    return () => {
      stopLiveSession();
      closeLiveCamera();
    };
  }, [closeLiveCamera, stopLiveSession]);

  return (
    <div className="min-h-screen bg-[#0B0D12] text-slate-100 flex flex-col">
      {/* Top Bar Contract: Brand — 4 Single-line Nav Links — 1 Primary Action */}
      <header className="sticky top-0 z-30 bg-[#0B0D12]/95 border-b border-white/10 px-3 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 sm:gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setView('companion');
            }}
            className="font-display text-lg sm:text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            Aanya
          </a>

          <nav className="flex items-center gap-3 sm:gap-7 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'companion', label: 'Companion' },
                { id: 'device', label: 'Device' },
                { id: 'video', label: 'Video' },
                { id: 'workspace', label: 'Workspace' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`py-1.5 text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                  view === item.id
                    ? 'text-white border-rose-500'
                    : 'text-slate-400 border-transparent hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="shrink-0 flex items-center">
            {isAuthenticated && user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="px-3 py-1.5 rounded-full bg-[#161B26] hover:bg-[#1E2534] border border-white/15 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="max-w-[70px] sm:max-w-[110px] truncate">
                  {user.displayName || user.email}
                </span>
                <LogOut className="w-3.5 h-3.5 text-slate-400" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isLoggingIn}
                onClick={handleSignIn}
                className="gsi-material-button whitespace-nowrap shrink-0"
              >
                <div className="gsi-material-button-state" />
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg viewBox="0 0 48 48" style={{ display: 'block' }}>
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents">
                    <span className="hidden sm:inline">
                      {isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
                    </span>
                    <span className="sm:hidden">
                      {isLoggingIn ? '...' : 'Sign in'}
                    </span>
                  </span>
                </div>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Active Ringing Alarm Banner */}
      {ringingAlarm && (
        <div className="bg-rose-600 text-white px-4 py-2.5 flex items-center justify-center gap-4 text-sm font-medium">
          <BellRing className="w-4 h-4 shrink-0" />
          <span>Alarm Ringing: {ringingAlarm}</span>
          <button
            type="button"
            onClick={() => setRingingAlarm(null)}
            className="px-3 py-1 rounded-md bg-black/25 hover:bg-black/40 text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-5">
        {view === 'companion' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Left 7 cols: Unobstructed 3D Anime Stage + Collapsible Bottom Dock */}
            <section className="lg:col-span-7 relative rounded-2xl border border-white/10 bg-[#0B0D12] overflow-hidden h-[430px] sm:h-[480px] lg:h-[calc(100vh-124px)] flex flex-col">
              <div className="absolute top-3 left-3 z-10 pointer-events-none flex items-center gap-2 text-xs text-slate-300 bg-[#131722]/90 px-3 py-1.5 rounded-lg border border-white/10">
                <span className="font-display font-semibold text-white">Aanya</span>
                <span aria-hidden="true">·</span>
                <span className="capitalize text-rose-300">{emotion}</span>
                {liveConnected && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-300">Live Voice On</span>
                  </>
                )}
              </div>

              <div className="flex-1 w-full h-full">
                <AnimeCompanion3D
                  emotion={emotion}
                  isSpeaking={isSpeaking}
                  isListening={liveConnected || isRecordingClip}
                  audioLevelRef={audioLevelRef}
                />
              </div>

              {/* Live In-App Camera Viewfinder */}
              {(isCameraOpen || cameraError) && (
                <div className="absolute inset-3 bottom-20 z-20 rounded-xl bg-[#0B0D12]/95 border border-emerald-500/40 overflow-hidden flex flex-col shadow-2xl">
                  <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-emerald-300 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5" />
                      <span>
                        Aanya Live Camera (
                        {cameraFacingMode === 'user' ? 'Front' : 'Back'})
                      </span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={flipLiveCamera}
                        className="px-2 py-1 rounded bg-white/5 hover:bg-white/15 text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Flip</span>
                      </button>
                      <button
                        type="button"
                        onClick={captureCameraPhoto}
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium cursor-pointer"
                      >
                        Capture
                      </button>
                      <button
                        type="button"
                        onClick={closeLiveCamera}
                        className="p-1 rounded bg-rose-600/20 hover:bg-rose-600/40 text-rose-200 cursor-pointer"
                        aria-label="Close Camera"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {cameraError ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-4 text-center gap-3 text-xs text-slate-300">
                      <p>{cameraError}</p>
                      <button
                        type="button"
                        onClick={() => openLiveCamera()}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium cursor-pointer"
                      >
                        Allow &amp; Open Camera
                      </button>
                    </div>
                  ) : capturedPhotoUrl ? (
                    <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
                      <img
                        src={capturedPhotoUrl}
                        alt="Captured snapshot"
                        className="max-h-full max-w-full object-contain"
                      />
                      <div className="absolute bottom-2 inset-x-2 flex items-center justify-center gap-2">
                        <a
                          href={capturedPhotoUrl}
                          download={`aanya-photo-${Date.now()}.jpg`}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium inline-flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          <span>Save Photo</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => setCapturedPhotoUrl(null)}
                          className="px-3 py-1.5 rounded-lg bg-[#161B26] border border-white/15 text-slate-200 text-xs cursor-pointer"
                        >
                          Back to Live View
                        </button>
                      </div>
                    </div>
                  ) : (
                    <video
                      ref={cameraVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="flex-1 w-full h-full object-cover bg-black"
                    />
                  )}
                </div>
              )}

              {/* Collapsible Bottom Dock */}
              <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-20px)] max-w-[660px] flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => setDockOpen((v) => !v)}
                  className="px-3 py-1 rounded-t-lg bg-[#161B26] border border-b-0 border-white/15 text-[11px] font-medium text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  {dockOpen ? (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>Hide Controls</span>
                    </>
                  ) : (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      <span>Show Controls</span>
                    </>
                  )}
                </button>

                {dockOpen && (
                  <div className="w-full bg-[#131722]/95 border border-white/15 rounded-xl p-2 flex flex-wrap items-center justify-center sm:justify-between gap-1.5 sm:gap-2 shadow-2xl">
                    <button
                      type="button"
                      onClick={startLiveSession}
                      className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                        liveConnected
                          ? 'bg-rose-600 text-white'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      }`}
                    >
                      {liveConnecting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Radio className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {liveConnected
                          ? 'End Live Voice'
                          : liveConnecting
                            ? 'Connecting...'
                            : 'Live Voice Call'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleEnrollVoiceprint}
                      disabled={isEnrollingVoice}
                      className="px-3 py-2 rounded-lg bg-[#1D2333] hover:bg-[#252D40] text-xs font-medium text-slate-200 border border-white/10 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>
                        {isEnrollingVoice
                          ? 'Speak 3s...'
                          : voiceprint?.enrolled
                            ? 'Re-Record Voice'
                            : 'Lock My Voice'}
                      </span>
                    </button>

                    {voiceprint?.enrolled && (
                      <button
                        type="button"
                        onClick={() => setVoiceLockEnabled((v) => !v)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium border whitespace-nowrap shrink-0 cursor-pointer ${
                          voiceLockEnabled
                            ? 'bg-emerald-600/25 border-emerald-400/50 text-emerald-200'
                            : 'bg-[#1D2333] border-white/10 text-slate-300'
                        }`}
                      >
                        {voiceLockEnabled ? 'Owner Filter: On' : 'Owner Filter: Off'}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setAutoHideOrb((v) => !v)}
                      className="px-3 py-2 rounded-lg bg-[#1D2333] hover:bg-[#252D40] text-xs font-medium text-slate-200 border border-white/10 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {autoHideOrb ? (
                        <EyeOff className="w-3.5 h-3.5 text-slate-300" />
                      ) : (
                        <Eye className="w-3.5 h-3.5 text-rose-300" />
                      )}
                      <span>{autoHideOrb ? 'Auto-Hide Orb' : 'Show Orb'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAutoSpeak((v) => !v)}
                      className="px-3 py-2 rounded-lg bg-[#1D2333] hover:bg-[#252D40] text-xs font-medium text-slate-200 border border-white/10 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {autoSpeak ? (
                        <Volume2 className="w-3.5 h-3.5 text-rose-400" />
                      ) : (
                        <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>{autoSpeak ? 'TTS On' : 'TTS Muted'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => applyHardwareTorch(!deviceState.flashlight)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                        deviceState.flashlight
                          ? 'bg-amber-500/25 border-amber-400/60 text-amber-200'
                          : 'bg-[#1D2333] hover:bg-[#252D40] border-white/10 text-slate-200'
                      }`}
                    >
                      <Flashlight className="w-3.5 h-3.5 text-amber-400" />
                      <span>{deviceState.flashlight ? 'Torch On' : 'Torch'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        isCameraOpen ? closeLiveCamera() : openLiveCamera()
                      }
                      className={`px-3 py-2 rounded-lg text-xs font-medium border flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                        isCameraOpen
                          ? 'bg-emerald-600 border-emerald-400 text-white'
                          : 'bg-[#1D2333] hover:bg-[#252D40] border-white/10 text-slate-200'
                      }`}
                    >
                      <Camera className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{isCameraOpen ? 'Close Cam' : 'Camera'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={startSelfRecording}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                        isSelfRecording
                          ? 'bg-rose-600 border-rose-400 text-white'
                          : 'bg-[#1D2333] hover:bg-[#252D40] border-white/10 text-slate-200'
                      }`}
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>{isSelfRecording ? 'Stop Rec' : 'Record'}</span>
                    </button>

                    {voiceprint?.enrolled && (
                      <button
                        type="button"
                        onClick={() => {
                          clearVoiceprintProfile();
                          setVoiceprint(null);
                          setVoiceLockEnabled(false);
                        }}
                        className="px-2.5 py-2 rounded-lg text-xs text-slate-400 hover:text-rose-400 cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Right 5 cols: Multi-Turn Voice & Text Companion Thread */}
            <section className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#131722] flex flex-col lg:h-[calc(100vh-124px)] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
                <div>
                  <h1 className="font-display text-base font-semibold text-white">
                    Sagar &amp; Aanya
                  </h1>
                  <p className="text-xs text-slate-400">
                    {new Date().toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    ·{' '}
                    {new Date().toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#0B0D12] rounded-lg border border-white/10">
                  <button
                    type="button"
                    onClick={() => setSpeedMode('fast')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 cursor-pointer ${
                      speedMode === 'fast'
                        ? 'bg-rose-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Zap className="w-3 h-3" />
                    <span>0.5s Fast</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpeedMode('smart')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 cursor-pointer ${
                      speedMode === 'smart'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Brain className="w-3 h-3" />
                    <span>Deep</span>
                  </button>
                </div>
              </div>

              {typeof window !== 'undefined' &&
                window.self !== window.top &&
                !window.AanyaAndroidBridge && (
                  <div className="mx-4 mt-2.5 px-3 py-2 rounded-xl bg-amber-950/35 border border-amber-500/30 text-xs text-amber-100 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Preview Sandbox: Phone apps auto-open ke liye Full App ya Android APK use karein.
                    </span>
                    <div className="flex items-center gap-1.5">
                      <a
                        href={window.location.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                      >
                        Open Full App
                      </a>
                      <button
                        type="button"
                        onClick={() => setView('device')}
                        className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white font-medium cursor-pointer"
                      >
                        Get APK (.zip)
                      </button>
                    </div>
                  </div>
                )}

              {liveError && (
                <div className="mx-4 mt-3 p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 flex items-center justify-between gap-2">
                  <span>{liveError}</span>
                  <button
                    type="button"
                    onClick={() => setLiveError(null)}
                    className="p-1 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {(deviceState.flashlight || isSelfRecording || selfRecordingUrl) && (
                <div className="mx-4 mt-2.5 px-3 py-2 rounded-xl bg-[#0B0D12] border border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                  {deviceState.flashlight && (
                    <button
                      type="button"
                      onClick={() => applyHardwareTorch(false)}
                      className="text-amber-300 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Flashlight className="w-3.5 h-3.5" />
                      <span>
                        Torch Active
                        {torchStatus === 'unsupported'
                          ? ' (Mirror — Hardware Torch needs Phone/APK)'
                          : torchStatus === 'permission_needed'
                            ? ' (Tap to Allow Camera)'
                            : ''}
                      </span>
                    </button>
                  )}
                  {isSelfRecording && (
                    <button
                      type="button"
                      onClick={stopSelfRecording}
                      className="text-rose-300 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Square className="w-3 h-3" />
                      <span>Recording Live — Tap to Stop</span>
                    </button>
                  )}
                  {selfRecordingUrl && !isSelfRecording && (
                    <a
                      href={selfRecordingUrl}
                      download={`aanya-recording-${Date.now()}.webm`}
                      className="text-emerald-300 hover:underline flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Recording (.webm)</span>
                    </a>
                  )}
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[380px] lg:max-h-none">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-[#1A2030] border border-white/10 text-slate-100'
                      }`}
                    >
                      {msg.attachmentPreview && (
                        <img
                          src={msg.attachmentPreview}
                          alt="Uploaded visual query"
                          referrerPolicy="no-referrer"
                          className="w-full max-h-44 object-cover rounded-lg mb-2.5 border border-white/10"
                        />
                      )}
                      <p className="whitespace-pre-wrap">{msg.text}</p>

                      {msg.deviceAction &&
                        (msg.deviceAction.type === 'play_media' ||
                          Boolean(msg.deviceAction.mediaEmbedUrl)) && (
                          <div className="mt-3 rounded-xl bg-[#0B0D12] border border-rose-500/35 overflow-hidden">
                            <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-white/10">
                              <span className="text-xs font-medium text-rose-300 flex items-center gap-1.5 truncate">
                                <Play className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">
                                  {msg.deviceAction.mediaTitle ||
                                    msg.deviceAction.query ||
                                    'YouTube Player'}
                                </span>
                              </span>
                              {msg.timestamp > stoppedMediaEpoch ? (
                                <button
                                  type="button"
                                  onClick={stopActiveMediaPlayback}
                                  className="px-2.5 py-1 rounded-md bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-[11px] font-medium text-rose-200 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                                >
                                  <Square className="w-2.5 h-2.5" />
                                  <span>Stop</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400 shrink-0">
                                  Stopped
                                </span>
                              )}
                            </div>
                            {msg.deviceAction.mediaEmbedUrl &&
                              !window.AanyaAndroidBridge &&
                              msg.timestamp > stoppedMediaEpoch && (
                                <div className="aspect-video w-full bg-black">
                                  <iframe
                                    data-aanya-media="1"
                                    src={msg.deviceAction.mediaEmbedUrl}
                                    title={
                                      msg.deviceAction.mediaTitle ||
                                      'YouTube Auto-Player'
                                    }
                                    className="w-full h-full border-0"
                                    allow="autoplay; encrypted-media; picture-in-picture"
                                    allowFullScreen
                                  />
                                </div>
                              )}
                          </div>
                        )}

                      {msg.deviceAction &&
                        msg.deviceAction.type === 'open_app' &&
                        /camera/i.test(msg.deviceAction.target || '') && (
                          <div className="mt-3 rounded-xl bg-[#0B0D12] border border-emerald-500/35 px-3 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-xs text-emerald-200 flex items-center gap-1.5">
                              <Camera className="w-3.5 h-3.5 text-emerald-400" />
                              <span>
                                Camera:{' '}
                                {isCameraOpen ? 'Live On Screen' : 'Ready'}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                isCameraOpen
                                  ? closeLiveCamera()
                                  : openLiveCamera()
                              }
                              className="px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-xs font-medium text-emerald-100 cursor-pointer"
                            >
                              {isCameraOpen ? 'Close Camera' : 'Open Camera'}
                            </button>
                          </div>
                        )}

                      {msg.deviceAction &&
                        msg.deviceAction.type === 'toggle_flashlight' && (
                          <div className="mt-3 rounded-xl bg-[#0B0D12] border border-amber-500/35 px-3 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-xs text-amber-200 flex items-center gap-1.5">
                              <Flashlight className="w-3.5 h-3.5 text-amber-400" />
                              <span>
                                Hardware Torch:{' '}
                                {deviceState.flashlight ? 'ON' : 'OFF'}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                applyHardwareTorch(!deviceState.flashlight)
                              }
                              className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-xs font-medium text-amber-100 cursor-pointer"
                            >
                              {deviceState.flashlight ? 'Turn Off' : 'Turn On Torch'}
                            </button>
                          </div>
                        )}

                      {msg.deviceAction &&
                        (msg.deviceAction.nativeIntentUri ||
                          msg.deviceAction.launchUrl) &&
                        msg.deviceAction.type !== 'play_media' &&
                        !msg.deviceAction.mediaEmbedUrl &&
                        !/camera/i.test(msg.deviceAction.target || '') && (() => {
                          const inApk = Boolean(window.AanyaAndroidBridge);
                          const inIframe =
                            typeof window !== 'undefined' &&
                            window.self !== window.top;
                          const isAndroidStandalone =
                            !inApk &&
                            !inIframe &&
                            /Android/i.test(navigator.userAgent);
                          const wasAutoLaunched =
                            Boolean(msg.deviceAction.autoLaunched) ||
                            inApk ||
                            isAndroidStandalone;
                          return (
                            <div className="mt-3 rounded-xl bg-[#0B0D12] border border-white/15 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs text-slate-200 flex items-center gap-1.5">
                                <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
                                <span>
                                  {msg.deviceAction.target || 'System Action'}
                                </span>
                                {wasAutoLaunched ? (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                    Auto-Launched
                                  </span>
                                ) : (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                    Needs APK / Full App
                                  </span>
                                )}
                              </span>
                              <div className="flex items-center gap-1.5">
                                {inIframe && !wasAutoLaunched && (
                                  <a
                                    href={window.location.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/45 border border-indigo-400/40 text-xs text-indigo-100"
                                  >
                                    Full App
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setView('device')}
                                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 cursor-pointer"
                                >
                                  {inIframe && !wasAutoLaunched
                                    ? 'Get APK'
                                    : 'Device Mirror'}
                                </button>
                              </div>
                            </div>
                          );
                        })()}

                      {(() => {
                        const htmlCode =
                          msg.role === 'assistant'
                            ? extractHtmlBlock(msg.text)
                            : null;
                        const anyCode =
                          msg.role === 'assistant'
                            ? extractFirstCodeBlock(msg.text)
                            : null;
                        if (!htmlCode && !anyCode) return null;
                        return (
                          <div className="mt-3 flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {htmlCode && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewHtmlMsgId((prev) =>
                                      prev === msg.id ? null : msg.id
                                    )
                                  }
                                  className="px-3 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-xs font-medium text-emerald-200 inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                  <Play className="w-3 h-3" />
                                  <span>
                                    {previewHtmlMsgId === msg.id
                                      ? 'Hide Live Website'
                                      : 'Live Website Preview'}
                                  </span>
                                </button>
                              )}
                              {anyCode && (
                                <>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await navigator.clipboard.writeText(anyCode);
                                      setCopiedMsgId(msg.id);
                                      setTimeout(() => setCopiedMsgId(null), 1800);
                                    }}
                                    className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
                                  >
                                    {copiedMsgId === msg.id ? (
                                      <>
                                        <Check className="w-3 h-3 text-emerald-400" />
                                        <span>Copied</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3" />
                                        <span>Copy Code</span>
                                      </>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const blob = new Blob([anyCode], {
                                        type: htmlCode ? 'text/html' : 'text/plain',
                                      });
                                      const url = URL.createObjectURL(blob);
                                      const a = document.createElement('a');
                                      a.href = url;
                                      a.download = htmlCode
                                        ? 'aanya-website.html'
                                        : 'aanya-code.txt';
                                      a.click();
                                      URL.revokeObjectURL(url);
                                    }}
                                    className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>
                                      {htmlCode ? 'Download .html' : 'Download'}
                                    </span>
                                  </button>
                                </>
                              )}
                            </div>
                            {htmlCode && previewHtmlMsgId === msg.id && (
                              <div className="rounded-xl overflow-hidden border border-emerald-500/35 bg-white h-64">
                                <iframe
                                  srcDoc={htmlCode}
                                  sandbox="allow-scripts"
                                  title="Aanya Live Website Preview"
                                  className="w-full h-full border-0"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {msg.deviceAction && msg.deviceAction.type !== 'none' && (
                        <div className="mt-2.5 pt-2 border-t border-white/10 text-xs text-rose-300 font-mono">
                          Executed: {msg.deviceAction.summary}
                        </div>
                      )}

                      {msg.groundingSources && msg.groundingSources.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-white/10 flex flex-wrap gap-1.5">
                          {msg.groundingSources.map((src, i) => (
                            <a
                              key={`${src.uri}-${i}`}
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-sky-300 hover:underline inline-flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded"
                            >
                              <span className="max-w-[160px] truncate">
                                {src.title}
                              </span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-1 px-1 flex items-center gap-2 text-[11px] text-slate-500">
                      <span className="font-mono">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {msg.latencyMs && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{msg.latencyMs}ms</span>
                        </>
                      )}
                      {msg.role === 'assistant' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            onClick={() =>
                              speakMessage(msg.text, msg.speechStyle, msg.emotion)
                            }
                            className="text-rose-400 hover:text-rose-300 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Volume2 className="w-3 h-3" />
                            <span>Speak</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {isSending && (
                  <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                    <span>Aanya is thinking...</span>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              <div className="px-4 py-2 border-t border-white/5 flex items-center gap-1.5 overflow-x-auto">
                {[
                  'YouTube par Kesariya song play karo',
                  'Time aur tarikh batao',
                  'Network panel slide karo',
                  'GF dusri banane ja raha hu',
                  'Subah 7:00 alarm lagao',
                  'Chrome me AI search karo',
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleSendMessage(q)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#0B0D12] hover:bg-[#1D2333] border border-white/10 text-xs text-slate-300 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {q}
                  </button>
                ))}
              </div>

              {attachment && (
                <div className="px-4 pt-2 flex items-center gap-2">
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.name}
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-lg object-cover border border-white/15"
                  />
                  <span className="text-xs text-slate-300 truncate flex-1">
                    {attachment.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    className="p-1 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="p-3 border-t border-white/10 flex items-center gap-2">
                <label
                  className="min-h-[42px] min-w-[42px] rounded-xl bg-[#0B0D12] hover:bg-[#1D2333] border border-white/10 flex items-center justify-center text-slate-300 cursor-pointer"
                  title="Upload photo or app screenshot to ask Aanya"
                >
                  <ImagePlus className="w-4 h-4" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageAttach}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  disabled={isTranscribing}
                  onClick={handleToggleClipRecord}
                  title="Record voice query (transcribed via gemini-3.5-transcribe)"
                  className={`min-h-[42px] min-w-[42px] rounded-xl border flex items-center justify-center cursor-pointer ${
                    isRecordingClip
                      ? 'bg-rose-600 border-rose-400 text-white'
                      : 'bg-[#0B0D12] hover:bg-[#1D2333] border-white/10 text-slate-300'
                  }`}
                >
                  {isTranscribing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isRecordingClip ? (
                    <Square className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>

                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Bolo ya likho Sagar..."
                  className="flex-1 bg-[#0B0D12] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500/60"
                />

                <button
                  type="button"
                  disabled={isSending || (!inputText.trim() && !attachment)}
                  onClick={() => handleSendMessage()}
                  className="min-h-[42px] min-w-[42px] rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white flex items-center justify-center cursor-pointer"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </section>
          </div>
        )}

        {view === 'device' && (
          <AndroidControlHub
            deviceState={deviceState}
            onDispatchAction={dispatchDeviceAction}
            onAddAlarm={(time, label) =>
              setDeviceState((prev) => ({
                ...prev,
                alarms: [
                  { id: `alarm-${Date.now()}`, time, label, enabled: true },
                  ...prev.alarms,
                ],
              }))
            }
            onToggleAlarm={(id) =>
              setDeviceState((prev) => ({
                ...prev,
                alarms: prev.alarms.map((a) =>
                  a.id === id ? { ...a, enabled: !a.enabled, triggered: false } : a
                ),
              }))
            }
            onDeleteAlarm={(id) =>
              setDeviceState((prev) => ({
                ...prev,
                alarms: prev.alarms.filter((a) => a.id !== id),
              }))
            }
            onTestAlarmChime={() => {
              playAlarmTone();
              setRingingAlarm('Test Ringtone · Aanya Alarm Ready');
            }}
          />
        )}

        {view === 'video' && <VideoStudio />}

        {view === 'workspace' && (
          <WorkspaceHub
            isAuthenticated={isAuthenticated}
            onRequestSignIn={handleSignIn}
            latestMeetUrl={latestMeetUrl}
            onMeetCreated={setLatestMeetUrl}
          />
        )}
      </main>

      <FloatingMicOrb
        isActive={liveConnected || isRecordingClip}
        isSpeaking={isSpeaking}
        autoHideWhenIdle={autoHideOrb}
        audioLevel={liveOrbLevel}
        voiceMatchStatus={voiceMatchStatus}
        onToggle={startLiveSession}
      />
    </div>
  );
}
