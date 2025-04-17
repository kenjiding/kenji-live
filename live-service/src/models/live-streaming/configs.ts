import { RtpCodecCapability } from 'mediasoup/node/lib/types';
// Mediasoup settings
export const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    parameters: {
      useinbandfec: 1,  // 启用前向纠错
      minptime: 10,     // 最小打包时间
      maxptime: 60      // 最大打包时间
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
      // announcedIp: process.env.SERVER_IP,
    },
  ],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
  enableSctp: true,
  initialAvailableOutgoingBitrate: 1000000,  // 增加初始比特率
  minimumAvailableOutgoingBitrate: 600000,   // 增加最小比特率
  iceServers: [
    // { urls: "stun:stun.l.google.com:19302" },
    {
      urls: ["stun:oz-turn-2.xirsys.com"]
    }, 
    {
      username: "eqbSG_Ufzgom4HHBbj9VvyQAZ1VuhKLthJ8BFAtQcAX-X10mRfjwkSHkf22EJ3oIAAAAAGeSXONrZW5qaUdN",
      credential: "c67d07ac-d99c-11ef-8cba-0242ac120004",
      urls: [
        "turn:oz-turn-2.xirsys.com:80?transport=udp",
        "turn:oz-turn-2.xirsys.com:3478?transport=udp",
        "turn:oz-turn-2.xirsys.com:80?transport=tcp", 
        "turn:oz-turn-2.xirsys.com:3478?transport=tcp", 
        "turns:oz-turn-2.xirsys.com:443?transport=tcp",
        "turns:oz-turn-2.xirsys.com:5349?transport=tcp"
      ]
    }
  ]
};
