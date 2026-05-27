import { sendSignal } from './stompClient';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

let peerConnection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let remoteStream: MediaStream | null = null;

export function getLocalStream() {
  return localStream;
}

export function getRemoteStream() {
  return remoteStream;
}

export async function getUserMedia(callType: 'audio' | 'video' = 'audio') {
  const constraints = {
    audio: true,
    video: callType === 'video',
  };
  localStream = await navigator.mediaDevices.getUserMedia(constraints);
  return localStream;
}

export async function startCall(
  receiverUsername: string,
  callType: 'audio' | 'video',
  onRemoteStream: (stream: MediaStream) => void
) {
  console.log('[WebRTC] Getting user media:', callType);
  await getUserMedia(callType);
  console.log('[WebRTC] Media acquired, setting up peer connection');

  peerConnection = new RTCPeerConnection(ICE_SERVERS);

  localStream!.getTracks().forEach((track) => {
    peerConnection!.addTrack(track, localStream!);
  });

  remoteStream = new MediaStream();
  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream!.addTrack(track);
    });
    onRemoteStream(remoteStream!);
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal({
        type: 'ice-candidate',
        receiver: receiverUsername,
        data: event.candidate,
        callType,
      });
    }
  };

  sendSignal({
    type: 'call-request',
    receiver: receiverUsername,
    callType,
  });
}

export async function handleSignal(
  signal: any,
  onRemoteStream: (stream: MediaStream) => void,
  onIncomingCall?: (sender: string, callType: 'audio' | 'video') => void,
  onCallEnded?: () => void
) {
  switch (signal.type) {
    case 'call-request':
      onIncomingCall?.(signal.sender, signal.callType);
      break;

    case 'offer':
      await handleOffer(signal, onRemoteStream);
      break;

    case 'answer':
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.data));
      }
      break;

    case 'ice-candidate':
      if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(signal.data));
      }
      break;

    case 'call-accepted':
      await createAndSendOffer(signal.sender, signal.callType);
      break;

    case 'call-rejected':
    case 'call-ended':
      cleanup();
      onCallEnded?.();
      break;
  }
}

export function acceptCall(callerUsername: string, callType: 'audio' | 'video') {
  sendSignal({
    type: 'call-accepted',
    receiver: callerUsername,
    callType,
  });
}

export function rejectCall(callerUsername: string) {
  sendSignal({
    type: 'call-rejected',
    receiver: callerUsername,
  });
}

async function createAndSendOffer(receiverUsername: string, callType: 'audio' | 'video') {
  if (!peerConnection) return;
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  sendSignal({
    type: 'offer',
    receiver: receiverUsername,
    data: offer,
    callType,
  });
}

async function handleOffer(signal: any, onRemoteStream: (stream: MediaStream) => void) {
  const callType = signal.callType || 'audio';
  await getUserMedia(callType);

  peerConnection = new RTCPeerConnection(ICE_SERVERS);

  localStream!.getTracks().forEach((track) => {
    peerConnection!.addTrack(track, localStream!);
  });

  remoteStream = new MediaStream();
  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream!.addTrack(track);
    });
    onRemoteStream(remoteStream!);
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal({
        type: 'ice-candidate',
        receiver: signal.sender,
        data: event.candidate,
        callType,
      });
    }
  };

  await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.data));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  sendSignal({
    type: 'answer',
    receiver: signal.sender,
    data: answer,
    callType,
  });
}

function cleanup() {
  peerConnection?.close();
  peerConnection = null;
  localStream?.getTracks().forEach((track) => track.stop());
  localStream = null;
  remoteStream = null;
}

export function endCall(receiverUsername?: string) {
  if (receiverUsername) {
    sendSignal({
      type: 'call-ended',
      receiver: receiverUsername,
    });
  }
  cleanup();
}

export function toggleMute(): boolean {
  if (!localStream) return false;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    return audioTrack.enabled;
  }
  return false;
}

export function toggleVideo(): boolean {
  if (!localStream) return false;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    return videoTrack.enabled;
  }
  return false;
}
