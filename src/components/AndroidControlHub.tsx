import React, { useState } from 'react';
import {
  Wifi,
  Signal,
  Flashlight,
  Bluetooth,
  Settings,
  Globe,
  MapPin,
  Scissors,
  AlarmClock,
  Smartphone,
  Copy,
  Check,
  Download,
  Terminal,
  Trash2,
  Plus,
  ChevronDown,
  ChevronUp,
  Accessibility,
  Hand,
  Keyboard,
  ArrowDownUp,
  Play,
  ExternalLink,
} from 'lucide-react';
import { AndroidDeviceState, DeviceActionPayload } from '../types';
import { ANDROID_APK_FILES } from '../lib/androidApkProject';
import { createZipBlob } from '../lib/zipBuilder';

interface AndroidControlHubProps {
  deviceState: AndroidDeviceState;
  onDispatchAction: (action: DeviceActionPayload) => void;
  onAddAlarm: (time: string, label: string) => void;
  onToggleAlarm: (id: string) => void;
  onDeleteAlarm: (id: string) => void;
  onTestAlarmChime: () => void;
}

export const AndroidControlHub: React.FC<AndroidControlHubProps> = ({
  deviceState,
  onDispatchAction,
  onAddAlarm,
  onToggleAlarm,
  onDeleteAlarm,
  onTestAlarmChime,
}) => {
  const [selectedApkIdx, setSelectedApkIdx] = useState(0);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [newAlarmTime, setNewAlarmTime] = useState('07:00');
  const [newAlarmLabel, setNewAlarmLabel] = useState('Morning Wakeup');
  const [customTapText, setCustomTapText] = useState('Allow');
  const [customTypeText, setCustomTypeText] = useState('Namaste from Aanya');

  const nativeBridge = window.AanyaAndroidBridge as
    | (typeof window.AanyaAndroidBridge & {
        isAccessibilityEnabled?: () => boolean;
        openAccessibilitySettings?: () => void;
        openOverlaySettings?: () => void;
      })
    | undefined;
  const isNativeAccessibilityReady = Boolean(
    nativeBridge?.isAccessibilityEnabled?.()
  );

  const activeApkFile = ANDROID_APK_FILES[selectedApkIdx];

  const handleCopyFile = async () => {
    await navigator.clipboard.writeText(activeApkFile.content);
    setCopiedPath(activeApkFile.path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const handleDownloadApkProject = () => {
    const blob = createZipBlob(
      ANDROID_APK_FILES.map((f) => ({ path: f.path, content: f.content }))
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aanya-android-apk-project.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Interactive Android Device Twin */}
      <div className="lg:col-span-5 bg-[#131722] border border-white/10 rounded-2xl p-5 flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              Android Device Mirror
            </h2>
            <p className="text-xs text-slate-400">
              Live system state &amp; Accessibility actions
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onDispatchAction({
                type: 'slide_panel',
                value: deviceState.panelExpanded ? 'close' : 'open',
                summary: deviceState.panelExpanded
                  ? 'Closed quick panel'
                  : 'Slid down quick settings panel',
              })
            }
            className="px-3 py-2 text-xs font-medium rounded-lg bg-[#1D2333] hover:bg-[#262E42] text-slate-200 border border-white/10 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {deviceState.panelExpanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Hide Shade</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Slide Shade</span>
              </>
            )}
          </button>
        </div>

        {/* Phone Screen Container */}
        <div className="relative mx-auto w-full max-w-[330px] h-[540px] rounded-[28px] bg-[#0B0E16] border-2 border-slate-700/80 overflow-hidden flex flex-col shadow-2xl">
          {/* Android Status Bar */}
          <div className="px-5 py-2.5 bg-[#0F131D] flex items-center justify-between text-[11px] font-mono text-slate-300 border-b border-white/5">
            <span>
              {new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <div className="flex items-center gap-2">
              <span className={deviceState.wifi ? 'text-indigo-400' : 'text-slate-600'}>
                WiFi
              </span>
              <span className={deviceState.mobileData ? 'text-emerald-400' : 'text-slate-600'}>
                5G
              </span>
              <span>94%</span>
            </div>
          </div>

          {/* Slide-down Network & Quick Settings Shade */}
          {deviceState.panelExpanded && (
            <div className="bg-[#181E2E] border-b border-white/10 p-4 grid grid-cols-2 gap-2.5 transition-all">
              <button
                type="button"
                onClick={() =>
                  onDispatchAction({
                    type: 'toggle_wifi',
                    value: 'toggle',
                    summary: 'Toggled Wi-Fi',
                  })
                }
                className={`p-2.5 rounded-xl text-xs font-medium flex items-center gap-2 border cursor-pointer ${
                  deviceState.wifi
                    ? 'bg-indigo-600/25 border-indigo-400/50 text-white'
                    : 'bg-white/5 border-white/10 text-slate-400'
                }`}
              >
                <Wifi className="w-4 h-4" />
                <span>Wi-Fi {deviceState.wifi ? 'On' : 'Off'}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onDispatchAction({
                    type: 'toggle_data',
                    value: 'toggle',
                    summary: 'Toggled Mobile Network',
                  })
                }
                className={`p-2.5 rounded-xl text-xs font-medium flex items-center gap-2 border cursor-pointer ${
                  deviceState.mobileData
                    ? 'bg-emerald-600/25 border-emerald-400/50 text-white'
                    : 'bg-white/5 border-white/10 text-slate-400'
                }`}
              >
                <Signal className="w-4 h-4" />
                <span>Data {deviceState.mobileData ? 'On' : 'Off'}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onDispatchAction({
                    type: 'toggle_flashlight',
                    value: 'toggle',
                    summary: 'Toggled Flashlight',
                  })
                }
                className={`p-2.5 rounded-xl text-xs font-medium flex items-center gap-2 border cursor-pointer ${
                  deviceState.flashlight
                    ? 'bg-amber-500/25 border-amber-400/50 text-amber-100'
                    : 'bg-white/5 border-white/10 text-slate-400'
                }`}
              >
                <Flashlight className="w-4 h-4" />
                <span>Torch {deviceState.flashlight ? 'On' : 'Off'}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onDispatchAction({
                    type: 'toggle_bluetooth',
                    value: 'toggle',
                    summary: 'Toggled Bluetooth',
                  })
                }
                className={`p-2.5 rounded-xl text-xs font-medium flex items-center gap-2 border cursor-pointer ${
                  deviceState.bluetooth
                    ? 'bg-sky-500/25 border-sky-400/50 text-sky-100'
                    : 'bg-white/5 border-white/10 text-slate-400'
                }`}
              >
                <Bluetooth className="w-4 h-4" />
                <span>BT {deviceState.bluetooth ? 'On' : 'Off'}</span>
              </button>
            </div>
          )}

          {/* Active Phone Viewport */}
          <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto">
            <div className="bg-[#151A28] border border-white/10 rounded-xl p-3">
              <div className="text-[11px] text-slate-400 mb-1">Active App</div>
              <div className="font-display text-base font-semibold text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-rose-400" />
                <span>{deviceState.activeApp}</span>
              </div>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                {deviceState.screenContent}
              </p>
            </div>

            {deviceState.typedText && (
              <div className="bg-[#151A28] border border-indigo-500/30 rounded-xl p-3">
                <div className="text-[11px] text-indigo-300 mb-1">Auto-Typed Input</div>
                <div className="text-xs font-mono text-white bg-black/30 rounded-lg px-2.5 py-2">
                  {deviceState.typedText}
                </div>
              </div>
            )}

            {deviceState.lastTapTarget && (
              <div className="bg-[#151A28] border border-rose-500/30 rounded-xl p-3">
                <div className="text-[11px] text-rose-300 mb-0.5">Last Auto-Tap Target</div>
                <div className="text-xs font-medium text-white">
                  {deviceState.lastTapTarget}
                </div>
              </div>
            )}

            {deviceState.mediaEmbedUrl && (
              <div className="bg-[#151A28] border border-rose-500/40 rounded-xl p-2.5 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-rose-300 truncate">
                    Playing: {deviceState.mediaTitle || 'YouTube Media'}
                  </span>
                  {deviceState.mediaWatchUrl && (
                    <a
                      href={deviceState.mediaWatchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-sky-400 hover:underline inline-flex items-center gap-1 shrink-0"
                    >
                      <span>YouTube</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
                  <iframe
                    src={deviceState.mediaEmbedUrl}
                    title={deviceState.mediaTitle || 'YouTube Auto-Player'}
                    className="w-full h-full border-0"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            )}

            {deviceState.chromeUrl && (
              <div className="bg-[#151A28] border border-white/10 rounded-xl p-3">
                <div className="text-[11px] text-slate-400 mb-1">Chrome Browser</div>
                <a
                  href={deviceState.chromeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-sky-400 hover:underline break-all"
                >
                  {deviceState.chromeUrl}
                </a>
              </div>
            )}

            {/* Quick App Launch Buttons */}
            <div className="grid grid-cols-2 gap-2 mt-auto">
              <button
                type="button"
                onClick={() =>
                  onDispatchAction({
                    type: 'open_settings',
                    summary: 'Opened Android Settings',
                  })
                }
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-slate-200 flex items-center gap-2 border border-white/10 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-slate-300" />
                <span>Settings</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onDispatchAction({
                    type: 'chrome_search',
                    query: 'Latest AI technology',
                    summary: 'Opened Chrome Search',
                  })
                }
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-slate-200 flex items-center gap-2 border border-white/10 cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-sky-400" />
                <span>Chrome</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onDispatchAction({
                    type: 'capcut_edit',
                    value: 'Split and trim selected clip',
                    summary: 'Activated CapCut Cut Script',
                  })
                }
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-slate-200 flex items-center gap-2 border border-white/10 cursor-pointer"
              >
                <Scissors className="w-3.5 h-3.5 text-rose-400" />
                <span>CapCut</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onDispatchAction({
                    type: 'open_maps',
                    query: 'New Delhi India',
                    summary: 'Opened Maps Search',
                  })
                }
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-slate-200 flex items-center gap-2 border border-white/10 cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                <span>Maps</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onDispatchAction({
                    type: 'play_media',
                    target: 'YouTube',
                    query: 'Kesariya Brahmastra song',
                    value: 'autoplay',
                    summary: 'Auto-playing song on YouTube',
                  })
                }
                className="col-span-2 p-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-xs text-rose-100 flex items-center justify-center gap-2 border border-rose-500/40 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-rose-400" />
                <span>Auto-Play YouTube Song</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Accessibility Service Bridge + Alarms + GitHub APK Builder */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        {/* Accessibility Service Control Panel */}
        <div className="bg-[#131722] border border-white/10 rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <Accessibility className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="font-display text-base font-semibold text-white">
                  Android Accessibility Service Bridge
                </h3>
                <p className="text-xs text-slate-400">
                  {isNativeAccessibilityReady
                    ? 'Connected to AanyaAccessibilityService on Android'
                    : 'Mirror ready — install the APK below & enable Accessibility to control every app'}
                </p>
              </div>
            </div>
            {nativeBridge?.openAccessibilitySettings && (
              <button
                type="button"
                onClick={() => nativeBridge.openAccessibilitySettings?.()}
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white cursor-pointer"
              >
                Enable on Android
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={customTapText}
                onChange={(e) => setCustomTapText(e.target.value)}
                placeholder="Button label to tap"
                className="flex-1 bg-[#0B0D12] border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
              />
              <button
                type="button"
                onClick={() =>
                  onDispatchAction({
                    type: 'tap_target',
                    target: customTapText,
                    summary: `Auto-tapped "${customTapText}"`,
                  })
                }
                className="px-3 py-2 rounded-lg bg-[#1D2333] hover:bg-[#262E42] text-xs font-medium text-white border border-white/10 flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Hand className="w-3.5 h-3.5 text-rose-400" />
                <span>Auto-Tap</span>
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={customTypeText}
                onChange={(e) => setCustomTypeText(e.target.value)}
                placeholder="Text to auto-type"
                className="flex-1 bg-[#0B0D12] border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
              />
              <button
                type="button"
                onClick={() =>
                  onDispatchAction({
                    type: 'type_text',
                    value: customTypeText,
                    target: 'Focused Input',
                    summary: `Auto-typed "${customTypeText}"`,
                  })
                }
                className="px-3 py-2 rounded-lg bg-[#1D2333] hover:bg-[#262E42] text-xs font-medium text-white border border-white/10 flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Keyboard className="w-3.5 h-3.5 text-indigo-400" />
                <span>Auto-Type</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              onClick={() =>
                onDispatchAction({
                  type: 'slide_panel',
                  value: 'open',
                  summary: 'Accessibility Global Action: Quick Settings Shade',
                })
              }
              className="px-3 py-1.5 rounded-lg bg-[#0B0D12] hover:bg-[#1D2333] text-xs text-slate-300 border border-white/10 flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowDownUp className="w-3.5 h-3.5 text-sky-400" />
              <span>Quick Panel Gesture</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onDispatchAction({
                  type: 'search_settings',
                  query: 'Accessibility',
                  summary: 'Opened Settings & searched Accessibility',
                })
              }
              className="px-3 py-1.5 rounded-lg bg-[#0B0D12] hover:bg-[#1D2333] text-xs text-slate-300 border border-white/10 flex items-center gap-1.5 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-slate-300" />
              <span>Search Settings</span>
            </button>
          </div>
        </div>

        {/* Live Alarms & Reminders */}
        <div className="bg-[#131722] border border-white/10 rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <AlarmClock className="w-5 h-5 text-rose-400" />
              <div>
                <h3 className="font-display text-base font-semibold text-white">
                  Alarms &amp; Time Reminders
                </h3>
                <p className="text-xs text-slate-400">
                  Ask Aanya by voice or add an alarm directly here
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onTestAlarmChime}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-[#1D2333] hover:bg-[#262E42] text-slate-200 border border-white/10 cursor-pointer"
            >
              Test Ringtone
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <input
              type="time"
              value={newAlarmTime}
              onChange={(e) => setNewAlarmTime(e.target.value)}
              className="bg-[#0B0D12] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white"
            />
            <input
              type="text"
              value={newAlarmLabel}
              onChange={(e) => setNewAlarmLabel(e.target.value)}
              placeholder="Alarm label"
              className="flex-1 min-w-[160px] bg-[#0B0D12] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={() => {
                if (newAlarmTime) {
                  onAddAlarm(newAlarmTime, newAlarmLabel || 'Reminder');
                }
              }}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Set Alarm</span>
            </button>
          </div>

          <div className="divide-y divide-white/5">
            {deviceState.alarms.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">
                No alarms scheduled yet. Say &ldquo;Aanya, subah 6 baje ka alarm lagao&rdquo;.
              </p>
            ) : (
              deviceState.alarms.map((alarm) => (
                <div
                  key={alarm.id}
                  className="py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-base font-semibold text-white">
                      {alarm.time}
                    </span>
                    <span className="text-sm text-slate-300">{alarm.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleAlarm(alarm.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                        alarm.enabled
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-white/5 text-slate-400 border border-white/10'
                      }`}
                    >
                      {alarm.enabled ? 'Active' : 'Paused'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteAlarm(alarm.id)}
                      className="p-2 text-slate-400 hover:text-rose-400 cursor-pointer"
                      aria-label="Delete alarm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* GitHub-Ready Android APK Bridge Code */}
        <div className="bg-[#131722] border border-white/10 rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <Terminal className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="font-display text-base font-semibold text-white">
                  GitHub APK Builder &amp; Accessibility Code
                </h3>
                <p className="text-xs text-slate-400">
                  Includes Accessibility XML, Floating Orb Service, and GitHub Actions APK compiler
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownloadApkProject}
              className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download APK Project (.zip)</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {ANDROID_APK_FILES.map((file, idx) => (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedApkIdx(idx)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                  idx === selectedApkIdx
                    ? 'bg-indigo-600 text-white'
                    : 'bg-[#0B0D12] text-slate-400 hover:text-white border border-white/10'
                }`}
              >
                {file.path.split('/').pop()}
              </button>
            ))}
          </div>

          <div className="bg-[#0B0D12] border border-white/10 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between gap-3">
              <span className="text-xs font-mono text-slate-300 truncate">
                {activeApkFile.path}
              </span>
              <button
                type="button"
                onClick={handleCopyFile}
                className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 text-xs text-slate-200 flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {copiedPath === activeApkFile.path ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>
            <p className="px-4 py-2 text-xs text-slate-400 border-b border-white/5">
              {activeApkFile.description}
            </p>
            <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto max-h-[260px] leading-relaxed">
              <code>{activeApkFile.content}</code>
            </pre>
          </div>
        </div>

        {/* Recent Device Execution Log */}
        <div className="bg-[#131722] border border-white/10 rounded-2xl p-5">
          <h3 className="font-display text-sm font-semibold text-white mb-3">
            Recent Device Commands
          </h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {deviceState.recentLogs.length === 0 ? (
              <p className="text-xs text-slate-500">
                No device actions triggered yet.
              </p>
            ) : (
              deviceState.recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="text-xs flex items-center justify-between gap-3 py-1.5 border-b border-white/5 last:border-0"
                >
                  <span className="text-slate-200">
                    <span className="font-mono text-rose-300 mr-2">
                      {log.action}
                    </span>
                    {log.detail}
                  </span>
                  <span className="font-mono text-slate-500 shrink-0">
                    {log.time}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
