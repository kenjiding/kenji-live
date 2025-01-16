// pages/viewer.tsx
"use client";
import { useEffect, useRef, useState } from 'react';
import { Device } from 'mediasoup-client';
import { useParams } from 'next/navigation';

export default function Viewer() {
  const { roomId } = useParams();
  const [connectionInfo, setConnectionInfo] = useState<{
    websocket: string;
    webRTC: string;
  }>({
    websocket: '未连接',
    webRTC: '未连接',
  });
  const [viewers, setViewers] = useState<number>(0);
  const [error, setError] = useState<string>('');
  const [info, setInfo] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const transportRef = useRef<any>(null);
  const consumersRef = useRef<Map<string, any>>(new Map());
  const clientId = useRef<string>(`viewer-${Date.now()}`);

  const changeConnectionInfo = (key: 'websocket' | 'webRTC', value: string) => {
    setConnectionInfo((state) => ({
      ...state,
      [key]: value,
    }));
  }

  useEffect(() => {
    let isMounted = true;

    const connect = async () => {
      try {
        const ws = new WebSocket('ws://localhost:3001');
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          changeConnectionInfo('websocket', '已连接');
          setInfo('正在加载媒体设备...');
          ws.send(JSON.stringify({
            type: 'getRouterRtpCapabilities',
            roomId
          }));
        };

        ws.onmessage = async (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            switch (data.type) {
              case 'routerRtpCapabilities':
                try {
                  const device = new Device();
                  await device.load({ routerRtpCapabilities: data.rtpCapabilities });
                  deviceRef.current = device;
                  changeConnectionInfo('webRTC', '设备已加载');
                  ws.send(JSON.stringify({
                    type: 'createTransport',
                    roomId,
                    clientId: clientId.current
                  }));
                } catch (error: any) {
                  console.error('设备加载错误:', error);
                  setError('加载媒体设备失败');
                }
                break;

              case 'transportIsCreated':
                try {
                  if (!deviceRef.current) {
                    throw new Error('Device not initialized');
                  }

                  const transport = deviceRef.current.createRecvTransport({
                    id: data.transportOptions.id,
                    iceParameters: data.transportOptions.iceParameters,
                    iceCandidates: data.transportOptions.iceCandidates,
                    dtlsParameters: data.transportOptions.dtlsParameters,
                  });

                  transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
                    try {
                      ws.send(JSON.stringify({
                        type: 'connectTransport',
                        dtlsParameters,
                        transportId: transport.id,
                        clientId: clientId.current,
                        roomId
                      }));
                      callback();
                    } catch (error) {
                      errback(error as Error);
                    }
                  });

                  transport.on('connectionstatechange', (state) => {
                    switch (state) {
                      case 'connecting':
                        changeConnectionInfo('webRTC', '正在建立连接...');
                        break;
                      case 'connected':
                        changeConnectionInfo('webRTC', '连接已建立，正在获取媒体流...');
                        ws.send(JSON.stringify({
                          type: 'getProducers',
                          roomId,
                          clientId: clientId.current
                        }));
                        break;
                      case 'failed':
                        changeConnectionInfo('webRTC', '连接失败');
                        console.error('webrtc连接失败');
                        break;
                    }
                  });

                  transportRef.current = transport;

                  if (transportRef.current) {
                    ws.send(JSON.stringify({
                      type: 'getProducers',
                      roomId,
                      clientId: clientId.current
                    }));
                  }

                } catch (error: any) {
                  console.error('创建传输错误:', error);
                }
                break;

              case 'transportConnected':
                setViewers(data.viewers);
                changeConnectionInfo('webRTC', '传输已连接, 等待媒体流...');
                break;

              case 'newProducer':
                if (transportRef.current) {
                  ws.send(JSON.stringify({
                    type: 'getProducers',
                    roomId,
                    clientId: clientId.current
                  }));
                }
                break;

              case 'producers':
                try {
                  if (!data.producers || data.producers.length === 0) {
                    setInfo('当前没有可用的媒体流');
                    return;
                  }

                  for (const producer of data.producers) {
                    if (!deviceRef.current?.rtpCapabilities || !transportRef.current) {
                      throw new Error('设备或传输未就绪');
                    }
                    ws.send(JSON.stringify({
                      type: 'consume',
                      roomId,
                      producerId: producer.id,
                      rtpCapabilities: deviceRef.current.rtpCapabilities,
                      transportId: transportRef.current.id,
                      clientId: clientId.current
                    }));
                  }
                } catch (error: any) {
                  console.error('处理生产者错误:', error);
                }
                break;

              case 'consumerCreated':
                try {
                  const { id, producerId, kind, rtpParameters } = data;

                  const consumer = await transportRef.current?.consume({
                    id,
                    producerId,
                    kind,
                    rtpParameters,
                    paused: false
                  });
                  changeConnectionInfo('webRTC', '消费者创建成功');
                  consumersRef.current.set(id, consumer);

                  if (kind === 'video') {
                    const stream = new MediaStream([consumer.track]);
                    if (videoRef.current) {
                      videoRef.current.srcObject = stream;
                      try {
                        // await videoRef.current.play();
                        setInfo('');
                      } catch (error: any) {
                        console.error('视频播放错误:', error);
                      }
                    }
                  } else if (kind === 'audio') {
                    const stream = videoRef.current?.srcObject as MediaStream;
                    if (stream) {
                      stream.addTrack(consumer.track);
                    } else {
                      const newStream = new MediaStream([consumer.track]);
                      if (videoRef.current) {
                        videoRef.current.srcObject = newStream;
                      }
                    }
                  }

                  consumer.on('trackended', () => {
                    consumer.close();
                    consumersRef.current.delete(id);
                    ws.send(JSON.stringify({type: 'removeViewer', roomId, clientId: clientId.current}));
                  });

                  consumer.on('transportclose', () => {
                    changeConnectionInfo('webRTC', '消费者传输关闭');
                    consumer.close();
                    consumersRef.current.delete(id);
                    ws.send(JSON.stringify({type: 'removeViewer', roomId, clientId: clientId.current}));
                  });
                } catch (error: any) {
                  console.error('设置消费者错误:', error);
                }
                break;
              case 'livestreamStopped':
                {
                  // 关闭所有 Consumers
                  consumersRef.current.forEach((consumer, consumerId) => {
                    consumer.close();
                    consumersRef.current.delete(consumerId);
                  });

                  // 清空视频源
                  if (videoRef.current) {
                    videoRef.current.srcObject = null;
                  }
                  changeConnectionInfo('webRTC', '连接已关闭');
                  setInfo('主播已结束直播');
                }
                break;
              case 'viewerCount': 
                setViewers(data.viewers);
                break;
              case 'error':
                console.error('服务器错误:', data.message);
                break;
            }
          } catch (error: any) {
            console.error('处理消息错误:', error);
            ws.send(JSON.stringify({type: 'removeViewer', roomId, clientId: clientId.current}));
          }
        };

        ws.onerror = (error) => {
          if (!isMounted) return;
          ws.send(JSON.stringify({type: 'removeViewer', roomId, clientId: clientId.current}));
          console.error('WebSocket错误:', error);
        };

        ws.onclose = () => {
          if (!isMounted) return;
          ws.send(JSON.stringify({type: 'removeViewer', roomId, clientId: clientId.current}));
          console.log('WebSocket已关闭');
          changeConnectionInfo('websocket', '连接已关闭');
        };
      } catch (error: any) {
        if (!isMounted) return;
        console.error('连接错误:', error);
      }
    };

    connect();

    return () => {
      isMounted = false;
      consumersRef.current.forEach(consumer => {
        if (consumer) {
          consumer.close();
        }
      });

      if (transportRef.current) {
        transportRef.current.close();
      }

      if (wsRef.current) {
        wsRef.current.close();
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl mb-4">观看端</h1>
      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}
      {info && (
        <div className="mb-4 p-4 bg-blue-100 text-blue-700 rounded">
          {info}
        </div>
      )}
      <div className="mb-4 flex justify-center">
        <div>观看: {viewers}</div>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-3/4 bg-black"
          style={{ border: '1px solid #ccc' }}
        />
      </div>
      <div className="mt-4 space-y-2 text-sm">
        <p>服务器连接状态: {connectionInfo.websocket}</p>
        <p>webRTC连接状态: {connectionInfo.webRTC}</p>
      </div>
    </div>
  );
}