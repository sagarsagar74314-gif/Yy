export type CompanionEmotion =
  | 'happy'
  | 'caring'
  | 'playful'
  | 'jealous'
  | 'focused'
  | 'thinking'
  | 'surprised';

export type DeviceActionType =
  | 'none'
  | 'open_settings'
  | 'search_settings'
  | 'slide_panel'
  | 'toggle_wifi'
  | 'toggle_data'
  | 'toggle_flashlight'
  | 'toggle_bluetooth'
  | 'type_text'
  | 'tap_target'
  | 'open_app'
  | 'play_media'
  | 'stop_media'
  | 'chrome_search'
  | 'chrome_download'
  | 'open_maps'
  | 'capcut_edit'
  | 'set_alarm'
  | 'make_call'
  | 'start_video_call'
  | 'check_messages'
  | 'tell_time_date'
  | 'generate_code'
  | 'create_account_flow'
  | 'start_recording'
  | 'stop_recording';

export interface DeviceActionPayload {
  type: DeviceActionType;
  target?: string;
  query?: string;
  value?: string;
  summary: string;
  emotion?: CompanionEmotion;
  mediaTitle?: string;
  mediaEmbedUrl?: string;
  mediaWatchUrl?: string;
  launchUrl?: string;
  nativeIntentUri?: string;
  autoLaunched?: boolean;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ChatAttachment {
  name: string;
  mimeType: string;
  base64: string;
  previewUrl: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  emotion?: CompanionEmotion;
  speechStyle?: string;
  latencyMs?: number;
  modelUsed?: string;
  deviceAction?: DeviceActionPayload;
  groundingSources?: GroundingSource[];
  attachmentPreview?: string;
  audioUrl?: string;
}

export interface AlarmItem {
  id: string;
  time: string;
  label: string;
  enabled: boolean;
  triggered?: boolean;
}

export interface AndroidDeviceState {
  panelExpanded: boolean;
  wifi: boolean;
  mobileData: boolean;
  flashlight: boolean;
  bluetooth: boolean;
  activeApp: string;
  screenContent: string;
  typedText: string;
  lastTapTarget: string;
  chromeUrl: string;
  mediaTitle?: string;
  mediaEmbedUrl?: string;
  mediaWatchUrl?: string;
  recordingActive?: boolean;
  recordingUrl?: string;
  chromeDownloads: string[];
  capcutStatus: string;
  alarms: AlarmItem[];
  recentLogs: { id: string; time: string; action: string; detail: string }[];
}

export interface VoiceprintProfile {
  enrolled: boolean;
  ownerName: string;
  spectralBands: number[];
  pitchHz: number;
  energyThreshold: number;
  enrolledAt: number;
}
