import React, { useEffect, useState } from 'react';
import {
  FolderOpen,
  MessageSquare,
  Video,
  Search,
  Send,
  FilePlus,
  ExternalLink,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import { getAccessToken } from '../lib/workspaceAuth';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
}

interface ChatSpace {
  name: string;
  displayName?: string;
  spaceType?: string;
}

interface ChatMessageItem {
  name: string;
  text?: string;
  createTime?: string;
  sender?: { displayName?: string; type?: string };
}

interface WorkspaceHubProps {
  isAuthenticated: boolean;
  onRequestSignIn: () => void;
  latestMeetUrl: string | null;
  onMeetCreated: (url: string) => void;
}

export const WorkspaceHub: React.FC<WorkspaceHubProps> = ({
  isAuthenticated,
  onRequestSignIn,
  latestMeetUrl,
  onMeetCreated,
}) => {
  const [activeTab, setActiveTab] = useState<'drive' | 'chat' | 'meet'>('drive');

  // Drive state
  const [driveQuery, setDriveQuery] = useState('');
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteBody, setNewNoteBody] = useState('');

  // Chat state
  const [spaces, setSpaces] = useState<ChatSpace[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [chatText, setChatText] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Meet state
  const [meetLoading, setMeetLoading] = useState(false);
  const [meetError, setMeetError] = useState<string | null>(null);
  const [meetCode, setMeetCode] = useState<string | null>(null);

  // Explicit Confirmation Modal state for ALL Workspace mutations
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const loadDriveFiles = async (searchQuery = driveQuery) => {
    const token = await getAccessToken();
    if (!token) return;
    setDriveLoading(true);
    setDriveError(null);
    try {
      const res = await fetch(
        `/api/workspace/drive?q=${encodeURIComponent(searchQuery)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || 'Failed to load Drive files');
      }
      setDriveFiles(data.files || []);
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : 'Drive error');
    } finally {
      setDriveLoading(false);
    }
  };

  const loadChatSpaces = async () => {
    const token = await getAccessToken();
    if (!token) return;
    setChatLoading(true);
    setChatError(null);
    try {
      const res = await fetch('https://chat.googleapis.com/v1/spaces', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error?.message ||
            'Google Chat requires a Business/Enterprise Workspace account and Cloud Console Chat app configuration.'
        );
      }
      const list = (data.spaces || []) as ChatSpace[];
      setSpaces(list);
      if (list.length > 0 && !selectedSpace) {
        setSelectedSpace(list[0].name);
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Google Chat unavailable');
    } finally {
      setChatLoading(false);
    }
  };

  const loadSpaceMessages = async (spaceName: string) => {
    const token = await getAccessToken();
    if (!token) return;
    setChatLoading(true);
    try {
      const res = await fetch(
        `https://chat.googleapis.com/v1/${spaceName}/messages?pageSize=25`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Unable to load messages');
      }
      setChatMessages(data.messages || []);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Chat messages error');
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeTab === 'drive') loadDriveFiles();
    if (activeTab === 'chat') loadChatSpaces();
  }, [isAuthenticated, activeTab]);

  useEffect(() => {
    if (isAuthenticated && activeTab === 'chat' && selectedSpace) {
      loadSpaceMessages(selectedSpace);
    }
  }, [selectedSpace, activeTab, isAuthenticated]);

  const promptCreateDriveNote = () => {
    if (!newNoteTitle.trim() || !newNoteBody.trim()) return;
    setConfirmModal({
      title: 'Save File to Google Drive?',
      description: `Create a new text document named "${newNoteTitle.trim()}.txt" in your Google Drive?`,
      confirmLabel: 'Create Drive File',
      onConfirm: async () => {
        const token = await getAccessToken();
        if (!token) return;
        const metadata = {
          name: `${newNoteTitle.trim()}.txt`,
          mimeType: 'text/plain',
        };
        const boundary = 'aanya_drive_boundary_123';
        const body =
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
          JSON.stringify(metadata) +
          `\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n` +
          newNoteBody +
          `\r\n--${boundary}--`;

        const res = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body,
          }
        );
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error?.message || 'Drive upload failed');
        }
        setNewNoteTitle('');
        setNewNoteBody('');
        await loadDriveFiles();
      },
    });
  };

  const promptSendChatMessage = () => {
    if (!selectedSpace || !chatText.trim()) return;
    const textToSend = chatText.trim();
    setConfirmModal({
      title: 'Send Google Chat Message?',
      description: `Send message "${textToSend}" to Google Chat space ${selectedSpace}?`,
      confirmLabel: 'Send Message',
      onConfirm: async () => {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch(
          `https://chat.googleapis.com/v1/${selectedSpace}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: textToSend }),
          }
        );
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error?.message || 'Failed to send message');
        }
        setChatText('');
        await loadSpaceMessages(selectedSpace);
      },
    });
  };

  const handleCreateMeet = async () => {
    const token = await getAccessToken();
    if (!token) return;
    setMeetLoading(true);
    setMeetError(null);
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
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to create Google Meet space');
      }
      if (data.meetingUri) {
        onMeetCreated(data.meetingUri);
        setMeetCode(data.meetingCode || null);
      }
    } catch (err) {
      setMeetError(err instanceof Error ? err.message : 'Meet creation error');
    } finally {
      setMeetLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="bg-[#131722] border border-white/10 rounded-2xl p-10 flex flex-col items-center justify-center text-center">
        <h2 className="font-display text-xl font-semibold text-white">
          Connect Google Workspace
        </h2>
        <p className="text-sm text-slate-400 mt-2 max-w-md">
          Sign in with your Google account to let Aanya search Google Drive, check or send Google Chat messages, and launch Google Meet video calls.
        </p>
        <button
          type="button"
          onClick={onRequestSignIn}
          className="gsi-material-button mt-6"
        >
          <div className="gsi-material-button-state" />
          <div className="gsi-material-button-content-wrapper">
            <div className="gsi-material-button-icon">
              <svg viewBox="0 0 48 48" style={{ display: 'block' }}>
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
            </div>
            <span className="gsi-material-button-contents">Sign in with Google</span>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#131722] border border-white/10 rounded-2xl p-6 relative">
      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#161B26] border border-white/15 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg font-semibold text-white">
                {confirmModal.title}
              </h3>
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed mb-6">
              {confirmModal.description}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const fn = confirmModal.onConfirm;
                  setConfirmModal(null);
                  try {
                    await fn();
                  } catch (err) {
                    setDriveError(
                      err instanceof Error ? err.message : 'Action failed'
                    );
                  }
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-medium text-white cursor-pointer"
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">
            Google Workspace Hub
          </h2>
          <p className="text-sm text-slate-400">
            Drive files, Google Chat spaces, and instant Google Meet rooms
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#0B0D12] rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab('drive')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'drive'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Drive</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('meet')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'meet'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Meet</span>
          </button>
        </div>
      </div>

      {/* DRIVE TAB */}
      {activeTab === 'drive' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-[#0B0D12] border border-white/10 rounded-xl p-4">
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={driveQuery}
                onChange={(e) => setDriveQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadDriveFiles(driveQuery)}
                placeholder="Search Google Drive files..."
                className="flex-1 bg-[#161B26] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => loadDriveFiles(driveQuery)}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search</span>
              </button>
            </div>

            {driveError && (
              <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 mb-3">
                {driveError}
              </div>
            )}

            {driveLoading ? (
              <div className="py-12 flex items-center justify-center text-slate-400 gap-2 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading Drive files...</span>
              </div>
            ) : driveFiles.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">
                No matching files found in Google Drive.
              </p>
            ) : (
              <div className="divide-y divide-white/5 max-h-[340px] overflow-y-auto">
                {driveFiles.map((file) => (
                  <div
                    key={file.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {file.mimeType}
                      </p>
                    </div>
                    {file.webViewLink && (
                      <a
                        href={file.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-200 flex items-center gap-1 shrink-0"
                      >
                        <span>Open</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 bg-[#0B0D12] border border-white/10 rounded-xl p-4 flex flex-col gap-3">
            <h3 className="font-display text-sm font-semibold text-white">
              Save Note to Google Drive
            </h3>
            <input
              type="text"
              value={newNoteTitle}
              onChange={(e) => setNewNoteTitle(e.target.value)}
              placeholder="Document title"
              className="bg-[#161B26] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
            <textarea
              rows={6}
              value={newNoteBody}
              onChange={(e) => setNewNoteBody(e.target.value)}
              placeholder="Write notes, generated code, or reminders to save in Drive..."
              className="bg-[#161B26] border border-white/10 rounded-lg p-3 text-sm text-white placeholder:text-slate-500"
            />
            <button
              type="button"
              disabled={!newNoteTitle.trim() || !newNoteBody.trim()}
              onClick={promptCreateDriveNote}
              className="py-2.5 px-4 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-xs font-medium text-white flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <FilePlus className="w-4 h-4" />
              <span>Save to Drive</span>
            </button>
          </div>
        </div>
      )}

      {/* CHAT TAB */}
      {activeTab === 'chat' && (
        <div className="bg-[#0B0D12] border border-white/10 rounded-xl p-5">
          {chatError && (
            <div className="p-4 rounded-xl bg-amber-950/50 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2.5 mb-4">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>{chatError}</p>
                <p className="text-amber-300/90">
                  Google Chat API requires a Business/Enterprise Workspace account and one-time app configuration in{' '}
                  <a
                    href="https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat?project=gen-lang-client-0566125041"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium"
                  >
                    Google Cloud Console
                  </a>
                  .
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-4 border-r border-white/10 pr-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-300">Spaces</span>
                <button
                  type="button"
                  onClick={loadChatSpaces}
                  className="text-xs text-indigo-400 hover:underline cursor-pointer"
                >
                  Refresh
                </button>
              </div>
              {spaces.length === 0 ? (
                <p className="text-xs text-slate-500">No spaces loaded.</p>
              ) : (
                <div className="space-y-1.5">
                  {spaces.map((sp) => (
                    <button
                      key={sp.name}
                      type="button"
                      onClick={() => setSelectedSpace(sp.name)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs cursor-pointer ${
                        selectedSpace === sp.name
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {sp.displayName || sp.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="md:col-span-8 flex flex-col gap-3">
              <div className="h-60 overflow-y-auto space-y-2.5 pr-1">
                {chatLoading ? (
                  <div className="py-10 flex items-center justify-center text-slate-400 text-xs gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Loading messages...</span>
                  </div>
                ) : chatMessages.length === 0 ? (
                  <p className="text-xs text-slate-500 py-8 text-center">
                    Select a Chat space to inspect messages.
                  </p>
                ) : (
                  chatMessages.map((msg) => (
                    <div
                      key={msg.name}
                      className="p-3 rounded-xl bg-[#161B26] border border-white/10"
                    >
                      <div className="text-[11px] text-slate-400 mb-1">
                        {msg.sender?.displayName || 'Workspace Member'}
                      </div>
                      <p className="text-xs text-slate-100">{msg.text}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Write a message to send to Google Chat..."
                  className="flex-1 bg-[#161B26] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
                <button
                  type="button"
                  disabled={!selectedSpace || !chatText.trim()}
                  onClick={promptSendChatMessage}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MEET TAB */}
      {activeTab === 'meet' && (
        <div className="bg-[#0B0D12] border border-white/10 rounded-xl p-6 flex flex-col items-start gap-4">
          <div>
            <h3 className="font-display text-base font-semibold text-white">
              Instant Google Meet Video Call
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Create a real Google Meet room directly via voice (&ldquo;Aanya, video call lagao&rdquo;) or one click below.
            </p>
          </div>

          {meetError && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 w-full">
              {meetError}
            </div>
          )}

          <button
            type="button"
            disabled={meetLoading}
            onClick={handleCreateMeet}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-sm font-medium text-white flex items-center gap-2 cursor-pointer"
          >
            {meetLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating Meet Room...</span>
              </>
            ) : (
              <>
                <Video className="w-4 h-4" />
                <span>Create Google Meet Call</span>
              </>
            )}
          </button>

          {latestMeetUrl && (
            <div className="w-full p-4 rounded-xl bg-[#161B26] border border-emerald-500/30 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs text-emerald-300 font-medium">
                  Active Meet Room Ready {meetCode ? `· ${meetCode}` : ''}
                </div>
                <p className="text-sm font-mono text-white mt-0.5 break-all">
                  {latestMeetUrl}
                </p>
              </div>
              <a
                href={latestMeetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white flex items-center gap-1.5"
              >
                <span>Join Video Call</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
