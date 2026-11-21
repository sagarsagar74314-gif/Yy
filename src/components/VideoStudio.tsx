import React, { useRef, useState } from 'react';
import {
  Scissors,
  Upload,
  Download,
  Film,
  ImagePlus,
  Loader2,
  Play,
  AlertCircle,
} from 'lucide-react';

export const VideoStudio: React.FC = () => {
  const [studioTab, setStudioTab] = useState<'cutter' | 'ai-video'>('cutter');

  // Local CapCut-style video trimmer state
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [cutterStatus, setCutterStatus] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Gemini Omni Video Generator state (gemini-omni-1.2-flash)
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [clipDuration, setClipDuration] = useState('5s');
  const [refImagePreview, setRefImagePreview] = useState<string | null>(null);
  const [refImageBase64, setRefImageBase64] = useState<string | null>(null);
  const [refImageMime, setRefImageMime] = useState<string>('image/png');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  const handleLoadLocalVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
    if (exportedUrl) URL.revokeObjectURL(exportedUrl);
    setExportedUrl(null);
    const url = URL.createObjectURL(file);
    setLocalVideoUrl(url);
    setCutterStatus(`Loaded ${file.name}`);
  };

  const handleExportTrimmedClip = async () => {
    const video = videoRef.current;
    if (!video || trimEnd <= trimStart) return;

    setIsExporting(true);
    setCutterStatus('Trimming and recording segment...');
    setExportedUrl(null);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d')!;
      const stream = canvas.captureStream(30);

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm',
      });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      const done = new Promise<void>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          setExportedUrl(URL.createObjectURL(blob));
          resolve();
        };
      });

      video.currentTime = trimStart;
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
      });

      recorder.start();
      await video.play();

      const drawFrame = () => {
        if (video.currentTime >= trimEnd || video.ended || video.paused) {
          video.pause();
          if (recorder.state !== 'inactive') recorder.stop();
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        requestAnimationFrame(drawFrame);
      };
      drawFrame();

      await done;
      setCutterStatus(
        `Cut complete (${(trimEnd - trimStart).toFixed(1)}s clip ready)`
      );
    } catch (err) {
      setCutterStatus(
        err instanceof Error ? err.message : 'Failed to trim video clip.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleRefImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setRefImagePreview(dataUrl);
      const [meta, base64] = dataUrl.split(',');
      const mimeMatch = meta.match(/data:(.*?);/);
      setRefImageMime(mimeMatch?.[1] || 'image/png');
      setRefImageBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateAiVideo = async () => {
    if (!prompt.trim() && !refImageBase64) return;
    setIsGenerating(true);
    setVideoError(null);
    setGeneratedVideoUrl(null);

    try {
      const res = await fetch('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          aspectRatio,
          duration: clipDuration,
          imageBase64: refImageBase64 || undefined,
          imageMimeType: refImageMime,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.requiresPaidKey
            ? `${data.error} — AI video generation (gemini-omni-1.2-flash) requires a billing-enabled key in Settings > Secrets. Use the CapCut Video Cutter tab for free local video cutting anytime.`
            : data.error || 'Video generation failed.'
        );
      }

      if (data.videoBase64) {
        const binary = atob(data.videoBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: data.mimeType || 'video/mp4' });
        setGeneratedVideoUrl(URL.createObjectURL(blob));
      } else if (data.videoUri) {
        setGeneratedVideoUrl(data.videoUri);
      }
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : 'Video generation error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-[#131722] border border-white/10 rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">
            Video Edit &amp; Animation Studio
          </h2>
          <p className="text-sm text-slate-400">
            Cut &amp; trim videos like CapCut locally, or animate images and prompts with Gemini Omni
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#0B0D12] rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => setStudioTab('cutter')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
              studioTab === 'cutter'
                ? 'bg-rose-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>CapCut Video Cutter</span>
          </button>
          <button
            type="button"
            onClick={() => setStudioTab('ai-video')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
              studioTab === 'ai-video'
                ? 'bg-rose-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>AI Video &amp; Photo Animate</span>
          </button>
        </div>
      </div>

      {studioTab === 'cutter' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-[#0B0D12] border border-white/10 rounded-xl p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <label className="px-4 py-2 rounded-lg bg-[#1A2030] hover:bg-[#232A3E] text-xs font-medium text-white border border-white/10 inline-flex items-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4 text-rose-400" />
                <span>Load Video Clip</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleLoadLocalVideo}
                  className="hidden"
                />
              </label>
              {cutterStatus && (
                <span className="text-xs text-slate-400 truncate">
                  {cutterStatus}
                </span>
              )}
            </div>

            {localVideoUrl ? (
              <video
                ref={videoRef}
                src={localVideoUrl}
                controls
                onLoadedMetadata={(e) => {
                  const dur = e.currentTarget.duration || 0;
                  setDuration(dur);
                  setTrimStart(0);
                  setTrimEnd(dur);
                }}
                className="w-full max-h-[360px] rounded-xl bg-black"
              />
            ) : (
              <div className="h-[300px] rounded-xl border border-dashed border-white/15 flex flex-col items-center justify-center text-center p-6">
                <Scissors className="w-8 h-8 text-slate-500 mb-3" />
                <p className="text-sm text-slate-300 font-medium">
                  Select a video to cut, split, or trim
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Works 100% offline in your browser with zero API cost
                </p>
              </div>
            )}
          </div>

          <div className="lg:col-span-5 bg-[#0B0D12] border border-white/10 rounded-xl p-5 flex flex-col gap-5">
            <div>
              <h3 className="font-display text-sm font-semibold text-white mb-1">
                Timeline Cut Controls
              </h3>
              <p className="text-xs text-slate-400">
                Set exact In and Out points to cut out unwanted segments
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-400">Cut Start (In)</span>
                  <span className="font-mono text-white">{trimStart.toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0.1, duration)}
                  step={0.1}
                  value={trimStart}
                  disabled={!localVideoUrl}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setTrimStart(Math.min(v, Math.max(0, trimEnd - 0.2)));
                  }}
                  className="w-full accent-rose-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-400">Cut End (Out)</span>
                  <span className="font-mono text-white">{trimEnd.toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0.1, duration)}
                  step={0.1}
                  value={trimEnd}
                  disabled={!localVideoUrl}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setTrimEnd(Math.max(v, Math.min(duration, trimStart + 0.2)));
                  }}
                  className="w-full accent-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!localVideoUrl}
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = trimStart;
                    videoRef.current.play();
                  }
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#1A2030] hover:bg-[#232A3E] disabled:opacity-40 text-xs font-medium text-white border border-white/10 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Preview Cut</span>
              </button>

              <button
                type="button"
                disabled={!localVideoUrl || isExporting}
                onClick={handleExportTrimmedClip}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-xs font-medium text-white flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Cutting...</span>
                  </>
                ) : (
                  <>
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Export Cut Clip</span>
                  </>
                )}
              </button>
            </div>

            {exportedUrl && (
              <div className="pt-3 border-t border-white/10 flex flex-col gap-3">
                <video
                  src={exportedUrl}
                  controls
                  className="w-full max-h-[180px] rounded-lg bg-black"
                />
                <a
                  href={exportedUrl}
                  download={`aanya-cut-${Date.now()}.webm`}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Trimmed Video</span>
                </a>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-[#0B0D12] border border-white/10 rounded-xl p-5 flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">
                Starting Photo (Optional — for Image-to-Video Animation)
              </label>
              <label className="w-full py-3 px-4 rounded-xl bg-[#161B26] hover:bg-[#1E2534] border border-dashed border-white/15 flex items-center justify-center gap-2 text-xs text-slate-300 cursor-pointer">
                <ImagePlus className="w-4 h-4 text-rose-400" />
                <span>{refImagePreview ? 'Change Photo' : 'Upload Photo to Animate'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleRefImageSelect}
                  className="hidden"
                />
              </label>
              {refImagePreview && (
                <div className="mt-3 relative">
                  <img
                    src={refImagePreview}
                    alt="Starting animation frame"
                    referrerPolicy="no-referrer"
                    className="w-full h-36 object-cover rounded-lg border border-white/10"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setRefImagePreview(null);
                      setRefImageBase64(null);
                    }}
                    className="mt-1.5 text-xs text-rose-400 hover:underline cursor-pointer"
                  >
                    Remove photo
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">
                Video Motion Prompt
              </label>
              <textarea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the scene or how the uploaded photo should animate..."
                className="w-full bg-[#161B26] border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500/60"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Aspect Ratio
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAspectRatio('16:9')}
                    className={`py-2 rounded-lg text-xs font-mono border cursor-pointer ${
                      aspectRatio === '16:9'
                        ? 'bg-rose-600 border-rose-500 text-white'
                        : 'bg-[#161B26] border-white/10 text-slate-300'
                    }`}
                  >
                    16:9
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspectRatio('9:16')}
                    className={`py-2 rounded-lg text-xs font-mono border cursor-pointer ${
                      aspectRatio === '9:16'
                        ? 'bg-rose-600 border-rose-500 text-white'
                        : 'bg-[#161B26] border-white/10 text-slate-300'
                    }`}
                  >
                    9:16
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Duration
                </label>
                <select
                  value={clipDuration}
                  onChange={(e) => setClipDuration(e.target.value)}
                  className="w-full bg-[#161B26] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white"
                >
                  <option value="5s">5s</option>
                  <option value="8s">8s</option>
                  <option value="10s">10s</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              disabled={isGenerating || (!prompt.trim() && !refImageBase64)}
              onClick={handleGenerateAiVideo}
              className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-sm font-medium text-white flex items-center justify-center gap-2 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating Video...</span>
                </>
              ) : (
                <>
                  <Film className="w-4 h-4" />
                  <span>Generate Video (Omni Flash)</span>
                </>
              )}
            </button>
          </div>

          <div className="lg:col-span-7 bg-[#0B0D12] border border-white/10 rounded-xl p-5 flex flex-col items-center justify-center min-h-[360px]">
            {videoError && (
              <div className="w-full p-4 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2.5 mb-4">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{videoError}</span>
              </div>
            )}

            {generatedVideoUrl ? (
              <div className="w-full flex flex-col gap-3">
                <video
                  src={generatedVideoUrl}
                  controls
                  autoPlay
                  loop
                  className="w-full max-h-[360px] rounded-xl bg-black"
                />
                <a
                  href={generatedVideoUrl}
                  download={`aanya-omni-${Date.now()}.mp4`}
                  className="self-end px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Video</span>
                </a>
              </div>
            ) : (
              <div className="text-center max-w-sm">
                <Film className="w-9 h-9 text-slate-600 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-300">
                  AI Video Output Viewport
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Generates 16:9 landscape or 9:16 portrait video using gemini-omni-1.2-flash via the Interactions API.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
