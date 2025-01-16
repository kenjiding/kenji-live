"use client";
import { useEffect, useRef, useState } from 'react';
import { Device } from 'mediasoup-client';
import { useParams } from 'next/navigation';

export default function Broadcaster() {
  const { roomId } = useParams();
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [viewers, setViewers] = useState<number>(0);
  const [error, setError] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transportRef = useRef<any>(null);
  const producersRef = useRef<Map<string, any>>(new Map());
  const clientId = useRef<string>(`broadcaster-${Date.now()}`);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3001');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      
      ws.send(JSON.stringify({
        type: 'createRoom',
        roomId
      }));
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received message:', data);
        
        switch (data.type) {
          case 'roomCreated':
            if (!data.routerRtpCapabilities) {
              console.error('No router RTP capabilities received');
              return;
            }

            try {
              // 创建了一个新的媒体设备实例
              const device = new Device();
              await device.load({ routerRtpCapabilities: data.routerRtpCapabilities });
              deviceRef.current = device;

              ws.send(JSON.stringify({
                type: 'createTransport',
                roomId,
                clientId: clientId.current,
                from: '主播端',
              }));
            } catch (error) {
              console.error('Error loading device:', error);
              setError('Failed to load media device');
            }
            break;

          case 'transportIsCreated':
            try {
              const transport = deviceRef.current!.createSendTransport({
                id: data.transportOptions.id,
                iceParameters: data.transportOptions.iceParameters,
                iceCandidates: data.transportOptions.iceCandidates,
                dtlsParameters: data.transportOptions.dtlsParameters,
              });
              
              transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
                console.log('主播的webRTC通道连接成功: ');
                try {
                  ws.send(JSON.stringify({
                    type: 'connectTransport',
                    dtlsParameters,
                    transportId: transport.id,
                    clientId: clientId.current
                  }));
                  callback();
                } catch (error) {
                  errback(error as Error);
                }
              });

              transport.on('produce', async (parameters: any, callback, errback) => {
                try {
                  ws.send(JSON.stringify({
                    type: 'produce',
                    kind: parameters.kind,
                    rtpParameters: parameters.rtpParameters,
                    transportId: transport.id,
                    clientId: clientId.current,
                    roomId
                  }));
                  
                  // 等待服务器返回 producerId，不然无法完成 Producer 创建的最后一步
                  const onProducerCreated = (event: MessageEvent) => {
                    const response = JSON.parse(event.data);
                    if (response.type === 'producerCreated') {
                      ws.removeEventListener('message', onProducerCreated);
                      callback({ id: response.producerId });
                    }
                  };
                  
                  ws.addEventListener('message', onProducerCreated);
                } catch (error) {
                  errback(error as Error);
                }
              });

              transportRef.current = transport;
            } catch (error) {
              console.error('Error creating send transport:', error);
              setError('Failed to create media transport');
            }
            break;
          case 'transportConnected':
            setViewers(data.viewers);
            console.log('Transport connected successfully');
            break;

          case 'producerCreated':
            producersRef.current.set(data.producerId, data);
            break;

          case 'error':
            console.error('Server error:', data.message);
            setError(data.message);
            break;
        }
      } catch (error) {
        console.error('Error processing message:', error);
        setError('Failed to process server message');
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('Connection error');
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      setError('Connection closed');
    };

    return () => {
      producersRef.current.forEach(producer => {
        if (producer) {
          producer.close();
        }
      });
      if (transportRef.current) {
        transportRef.current.close();
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);


const startStreaming = async () => {
  try {
    if (!deviceRef.current?.canProduce('video')) {
      throw new Error('Cannot produce video');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1920 },   // 理想宽度
        height: { ideal: 1080 },  // 理想高度
        frameRate: { ideal: 30 }  // 理想帧率
      },
      audio: {
        noiseSuppression: true,   // 消除背景噪音
        echoCancellation: true,   // 回声抑制
        autoGainControl: true,    // 自动增益控制
        sampleRate: 48000,        // 采样率（Hz）
        sampleSize: 16,           // 采样精度（bits）
        channelCount: 2,          // 声道数量（1 为单声道，2 为立体声）
      }
    });
    
    streamRef.current = stream;
    
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }

    const transport = transportRef.current;

    if (!transport) {
      throw new Error('Transport not ready');
    }

    // 创建视频 Producer 并保存引用
    const videoTrack = stream.getVideoTracks()[0];
    const videoProducer = await transport.produce({
      kind: 'video',
      track: videoTrack,  // 媒体轨道
      rtpParameters: {
        codecs: [
          {
            mimeType: 'video/H264',
            clockRate: 90000,
            parameters: {
              // 编码参数
              'profile-level-id': '42e01f',
              'x-google-start-bitrate': 1000
            }
          }
        ],
        encodings: [
          {
            rid: 'r0',
            maxBitrate: 500000,
            scaleResolutionDownBy: 1
          }
        ]
      }
    });
    // 设置视频生产者的事件监听
    videoProducer.on('transportclose', () => {
      console.log('Video producer transport closed');
      videoProducer.close();
    });

    videoProducer.on('trackended', () => {
      console.log('Video track ended');
      videoProducer.close();
    });
    
    // 创建音频 Producer 并保存引用
    const audioTrack = stream.getAudioTracks()[0];
    const audioProducer = await transport.produce({
      track: audioTrack,
      codecOptions: {
        opusStereo: 1,
        opusDtx: 1,
        opusFec: 1,
        opusMaxPlaybackRate: 48000
      }
    });

    // 设置音频生产者的事件监听
    audioProducer.on('transportclose', () => {
      console.log('Audio producer transport closed');
      audioProducer.close();
    });

    audioProducer.on('trackended', () => {
      console.log('Audio track ended');
      audioProducer.close();
    });

    // 保存生产者引用
    producersRef.current.set('video', videoProducer);
    producersRef.current.set('audio', audioProducer);

    setIsStreaming(true);
  } catch (error: any) {
    console.error('Error starting stream:', error);
    setError(error.message);
  }
};

const stopStreaming = async () => {
  try {
    // 停止所有媒体轨道
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // 关闭视频和音频 Producers
    const videoProducer = producersRef.current.get('video');
    const audioProducer = producersRef.current.get('audio');

    if (videoProducer) {
      videoProducer.close();
      producersRef.current.delete('video');
    }

    if (audioProducer) {
      audioProducer.close();
      producersRef.current.delete('audio');
    }

    // 清空视频播放
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // 向服务器发送停止直播的消息
    wsRef.current?.send(JSON.stringify({
      type: 'stopStreaming',
      roomId,
      clientId: clientId.current
    }));

    // 重置状态
    setIsStreaming(false);
    setError('');
  } catch (error) {
    console.error('Error stopping stream:', error);
    setError('停止直播失败');
  }
};


  return (
    <div className="p-4">
      <h1 className="text-2xl mb-4">主播端</h1>
      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">
          错误: {error}
        </div>
      )}
      <div className="w-3/4 m-auto mb-4 flex justify-center relative">
        <div className='absolute top-0 left-0 w-full pt-3 p-3 pl-5 pr-5'>
          <span className='text-sm text-red-500 py-1 px-2 bg-slate-200 opacity-70'>正在直播</span>
          <span className='text-sm text-blue-800 py-1 px-2 bg-orange-300 ml-3'>观看: {viewers}</span>
        </div>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full bg-black"
        />
      </div>
      <div className="flex gap-4">
        <button
          onClick={isStreaming ? stopStreaming : startStreaming}
          disabled={!isConnected}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400"
        >
          {isStreaming ? '停止直播' : '开始直播'}
        </button>
      </div>
      <div className="mt-4 text-sm text-gray-600">
        连接状态: {isConnected ? '已连接' : '未连接'}
      </div>
    </div>
  );
}