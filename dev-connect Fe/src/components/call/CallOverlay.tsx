import { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import {
  startCall,
  handleSignal,
  acceptCall,
  rejectCall,
  endCall,
  toggleMute,
  toggleVideo,
  getLocalStream,
} from '../../services/webrtc';
import { subscribe } from '../../services/stompClient';

type CallState = 'idle' | 'calling' | 'incoming' | 'connecting' | 'in-call';

interface CallOverlayProps {
  currentUser: any;
}

export const CallOverlay = ({ currentUser }: CallOverlayProps) => {
  const [callState, setCallState] = useState<CallState>('idle');
  const [remoteUser, setRemoteUser] = useState<string | null>(null);
  const [callType, setCallType] = useState<'audio' | 'video'>('audio');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const onRemoteStream = useCallback((stream: MediaStream) => {
    if (callType === 'video' && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = stream;
    }
    setCallState('in-call');
    setCallDuration(0);
    timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
  }, [callType]);

  const onIncomingCall = useCallback((sender: string, type: 'audio' | 'video') => {
    setRemoteUser(sender);
    setCallType(type);
    setCallState('incoming');
  }, []);

  const onCallEnded = useCallback(() => {
    setCallState('idle');
    setRemoteUser(null);
    if (timerRef.current) clearInterval(timerRef.current);
    setCallDuration(0);
    setIsMuted(false);
    setIsVideoOff(false);
  }, []);

  // Subscribe to signaling topic
  useEffect(() => {
    if (!currentUser?.username) return;
    let cancelled = false;
    let sub: any = null;

    console.log('[Call] Subscribing to signals at /topic/signal/' + currentUser.username);
    subscribe(`/topic/signal/${currentUser.username}`, (signal: any) => {
      if (cancelled) return;
      console.log('[Call] Received signal:', signal.type, 'from:', signal.sender);
      handleSignal(signal, onRemoteStream, onIncomingCall, onCallEnded);
    }).then((s) => {
      sub = s;
      console.log('[Call] Signal subscription active');
    });

    return () => { cancelled = true; sub?.unsubscribe(); };
  }, [currentUser?.username, onRemoteStream, onIncomingCall, onCallEnded]);

  // Update local video when in call
  useEffect(() => {
    if ((callState === 'in-call' || callState === 'calling' || callState === 'connecting') && callType === 'video') {
      const stream = getLocalStream();
      if (stream && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    }
  }, [callState, callType]);

  const handleAccept = () => {
    if (!remoteUser) return;
    setCallState('connecting');
    acceptCall(remoteUser, callType);
  };

  const handleReject = () => {
    if (!remoteUser) return;
    rejectCall(remoteUser);
    onCallEnded();
  };

  const handleEnd = () => {
    endCall(remoteUser || undefined);
    onCallEnded();
  };

  const handleToggleMute = () => {
    const enabled = toggleMute();
    setIsMuted(!enabled);
  };

  const handleToggleVideo = () => {
    const enabled = toggleVideo();
    setIsVideoOff(!enabled);
  };

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60).toString().padStart(2, '0');
    const secs = (s % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // Expose startCall for external use
  (window as any).__startCall = async (username: string, type: 'audio' | 'video') => {
    try {
      setRemoteUser(username);
      setCallType(type);
      setCallState('calling');
      console.log(`[Call] Starting ${type} call to ${username}`);
      await startCall(username, type, onRemoteStream);
      console.log('[Call] Signal sent, waiting for response...');
    } catch (err) {
      console.error('[Call] Failed to start call:', err);
      alert(`Call failed: ${err instanceof Error ? err.message : 'Could not access microphone/camera. Please allow permission and try again.'}`);
      onCallEnded();
    }
  };

  if (callState === 'idle') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="bg-bg-secondary border border-border-color rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">

        {/* ── Incoming Call ── */}
        {callState === 'incoming' && (
          <div className="flex flex-col items-center p-10 gap-6">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white text-4xl font-bold uppercase animate-pulse">
              {remoteUser?.charAt(0) || '?'}
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-text-primary">{remoteUser}</h2>
              <p className="text-text-secondary mt-1 text-lg">
                Incoming {callType === 'video' ? 'Video' : 'Audio'} Call...
              </p>
            </div>
            <div className="flex gap-6 mt-4">
              <button
                onClick={handleReject}
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg transition-all hover:scale-105"
              >
                <PhoneOff className="w-7 h-7" />
              </button>
              <button
                onClick={handleAccept}
                className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white shadow-lg transition-all hover:scale-105 animate-bounce"
              >
                <Phone className="w-7 h-7" />
              </button>
            </div>
          </div>
        )}

        {/* ── Calling / Connecting ── */}
        {(callState === 'calling' || callState === 'connecting') && (
          <div className="flex flex-col items-center p-10 gap-6">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-accent-purple to-accent-hover flex items-center justify-center text-white text-4xl font-bold uppercase">
              {remoteUser?.charAt(0) || '?'}
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-text-primary">{remoteUser}</h2>
              <p className="text-text-secondary mt-1 text-lg">
                {callState === 'calling' ? 'Calling...' : 'Connecting...'}
              </p>
            </div>
            <div className="flex gap-2 mt-2">
              <div className="w-3 h-3 rounded-full bg-accent-purple animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-3 h-3 rounded-full bg-accent-purple animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-3 h-3 rounded-full bg-accent-purple animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <button
              onClick={handleEnd}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg mt-4 transition-all hover:scale-105"
            >
              <PhoneOff className="w-7 h-7" />
            </button>
          </div>
        )}

        {/* ── In Call ── */}
        {callState === 'in-call' && (
          <div className="flex flex-col">
            {/* Video Area */}
            {callType === 'video' ? (
              <div className="relative bg-black aspect-video">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute bottom-4 right-4 w-32 h-24 rounded-xl object-cover border-2 border-white/30 shadow-lg"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center py-10 gap-4">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-accent-purple to-accent-hover flex items-center justify-center text-white text-4xl font-bold uppercase">
                  {remoteUser?.charAt(0) || '?'}
                </div>
                <h2 className="text-2xl font-bold text-text-primary">{remoteUser}</h2>
                <p className="text-green-400 font-medium text-lg">{formatDuration(callDuration)}</p>
              </div>
            )}

            {/* Hidden audio element for audio playback */}
            <audio ref={remoteAudioRef} autoPlay className="hidden" />

            {/* Call Controls */}
            <div className="flex items-center justify-center gap-5 p-6 border-t border-border-color">
              <button
                onClick={handleToggleMute}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-md transition-all hover:scale-105 ${
                  isMuted
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-bg-tertiary text-text-primary border border-border-color'
                }`}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>

              {callType === 'video' && (
                <button
                  onClick={handleToggleVideo}
                  className={`w-14 h-14 rounded-full flex items-center justify-center shadow-md transition-all hover:scale-105 ${
                    isVideoOff
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-bg-tertiary text-text-primary border border-border-color'
                  }`}
                >
                  {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                </button>
              )}

              <button
                onClick={handleEnd}
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg transition-all hover:scale-105"
              >
                <PhoneOff className="w-7 h-7" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
