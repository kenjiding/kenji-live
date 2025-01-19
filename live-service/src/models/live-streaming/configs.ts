import { RtpCodecCapability } from 'mediasoup/node/lib/types';
// Mediasoup settings
export const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    parameters: {
      maxPlaybackRate: 48000,
      stereo: 1,
      useinbandfec: 1,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
      'x-google-max-bitrate': 3000,
      'profile-level-id': '42e01f',
    },
  },
];
// WebRTC transport settings
export const webRtcTransportOptions = {
  listenIps: [
    {
      ip: '0.0.0.0',
      announcedIp: '127.0.0.1',
      // announcedIp: '192.168.1.105',
    },
  ],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
  initialAvailableOutgoingBitrate: 1000000,
};
