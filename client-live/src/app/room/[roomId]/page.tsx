// pages/viewer.tsx
"use client";
import { useEffect, useRef, useState } from 'react';
import { Device } from 'mediasoup-client';
import { useParams } from 'next/navigation';

export default function Viewer() {
  const { roomId } = useParams();
  const [isConnected, setIsConnected] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [viewers, setViewers] = useState<number>(0);
  const [error, setError] = useState<string>('');
  const [info, setInfo] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const transportRef = useRef<any>(null);
  const consumersRef = useRef<Map<string, any>>(new Map());
  const clientId = useRef<string>(`viewer-${Date.now()}`);

  const addLog = (message: string) => {
    console.log(message);
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  useEffect(() => {
    let isMounted = true;

    const connect = async () => {
      try {
        const ws = new WebSocket('ws://localhost:3001');
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          addLog('WebSocket已连接');
          setIsConnected(true);
          setInfo('正在加载媒体设备...');

          ws.send(JSON.stringify({
            type: 'getRouterRtpCapabilities',
            roomId
          }));
          addLog('已请求RTP能力');
        };

        ws.onmessage = async (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            switch (data.type) {
              case 'routerRtpCapabilities':
                try {
                  addLog('正在加载设备...');
                  const device = new Device();
                  await device.load({ routerRtpCapabilities: data.rtpCapabilities });
                  deviceRef.current = device;

                  ws.send(JSON.stringify({
                    type: 'createTransport',
                    roomId,
                    clientId: clientId.current
                  }));
                } catch (error: any) {
                  console.error('设备加载错误:', error);
                  setError('加载媒体设备失败');
                  addLog(`设备加载错误: ${error.message}`);
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
                      addLog('room观看端已经connect完成, 已发送连接请求');
                      callback();
                    } catch (error) {
                      addLog('发送连接请求失败: ' + error);
                      errback(error as Error);
                    }
                  });

                  transport.on('connectionstatechange', (state) => {
                    addLog(`传输状态变化: ${state}`);
                    switch (state) {
                      case 'connecting':
                        setInfo('正在建立连接...');
                        break;
                      case 'connected':
                        setInfo('连接已建立，正在获取媒体流...');
                        ws.send(JSON.stringify({
                          type: 'getProducers',
                          roomId,
                          clientId: clientId.current
                        }));
                        break;
                      case 'failed':
                        setError('连接失败');
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

                  addLog('传输初始化完成');

                } catch (error: any) {
                  console.error('创建传输错误:', error);
                  setError('创建媒体传输失败: ' + error.message);
                  addLog(`创建传输错误: ${error.message}`);
                }
                break;

              case 'transportConnected':
                setViewers(data.viewers);
                addLog('传输连接成功');
                setInfo('传输已连接，等待媒体流...');
                break;

              case 'newProducer':
                addLog(`收到新生产者通知: ${data.producerId}`);
                if (transportRef.current) {
                  ws.send(JSON.stringify({
                    type: 'getProducers',
                    roomId,
                    clientId: clientId.current
                  }));
                }
                break;

              case 'producers':
                addLog(`收到生产者列表: ${JSON.stringify(data.producers)}`);
                try {
                  if (!data.producers || data.producers.length === 0) {
                    setInfo('当前没有可用的媒体流');
                    addLog('没有可用的生产者');
                    return;
                  }

                  for (const producer of data.producers) {
                    if (!deviceRef.current?.rtpCapabilities || !transportRef.current) {
                      throw new Error('设备或传输未就绪');
                    }
                    addLog(`请求消费生产者: ${producer.id}`);
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
                  setError('处理媒体流失败');
                  addLog(`处理生产者错误: ${error.message}`);
                }
                break;

              case 'consumer-created':
                try {
                  const { id, producerId, kind, rtpParameters } = data;
                  addLog(`创建消费者: ${kind}`);

                  const consumer = await transportRef.current?.consume({
                    id,
                    producerId,
                    kind,
                    rtpParameters,
                    paused: false
                  });

                  addLog(`消费者创建成功: ${consumer.id}`);
                  consumersRef.current.set(id, consumer);

                  if (kind === 'video') {
                    addLog('设置视频流');
                    const stream = new MediaStream([consumer.track]);
                    if (videoRef.current) {
                      videoRef.current.srcObject = stream;
                      try {
                        // await videoRef.current.play();
                        addLog('视频开始播放');
                        setIsViewing(true);
                        setInfo('');
                      } catch (error: any) {
                        console.error('视频播放错误:', error);
                        addLog(`视频播放错误: ${error.message}`);
                      }
                    }
                  } else if (kind === 'audio') {
                    addLog('设置音频流');
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
                    addLog(`消费者轨道结束: ${consumer.id}`);
                    consumer.close();
                    consumersRef.current.delete(id);
                    ws.send(JSON.stringify({type: 'removeViewer', roomId, clientId: clientId.current}));
                  });

                  consumer.on('transportclose', () => {
                    addLog(`消费者传输关闭: ${consumer.id}`);
                    consumer.close();
                    consumersRef.current.delete(id);
                    ws.send(JSON.stringify({type: 'removeViewer', roomId, clientId: clientId.current}));
                  });
                } catch (error: any) {
                  console.error('设置消费者错误:', error);
                  setError('设置媒体流失败');
                  addLog(`设置消费者错误: ${error.message}`);
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

                  // 重置状态
                  setIsViewing(false);
                  setInfo('主播已结束直播');
                  setError('');
                }
                break;
              case 'viewerCount': 
                setViewers(data.viewers);
                break;
              case 'error':
                console.error('服务器错误:', data.message);
                setError(`服务器错误: ${data.message}`);
                addLog(`服务器错误: ${data.message}`);
                break;
            }
          } catch (error: any) {
            console.error('处理消息错误:', error);
            setError('处理服务器消息失败');
            addLog(`处理消息错误: ${error.message}`);
            ws.send(JSON.stringify({type: 'removeViewer', roomId, clientId: clientId.current}));
          }
        };

        ws.onerror = (error) => {
          if (!isMounted) return;
          ws.send(JSON.stringify({type: 'removeViewer', roomId, clientId: clientId.current}));
          console.error('WebSocket错误:', error);
          setError('连接错误');
          addLog('WebSocket发生错误');
        };

        ws.onclose = () => {
          if (!isMounted) return;
          ws.send(JSON.stringify({type: 'removeViewer', roomId, clientId: clientId.current}));
          console.log('WebSocket已关闭');
          setIsConnected(false);
          setError('连接已关闭');
          addLog('WebSocket连接关闭');
        };
      } catch (error: any) {
        if (!isMounted) return;
        console.error('连接错误:', error);
        setError(`连接失败: ${error.message}`);
        addLog(`连接错误: ${error.message}`);
      }
    };

    connect();

    return () => {
      isMounted = false;
      addLog('清理资源...');

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
        <p>连接状态: {isConnected ? '已连接' : '未连接'}</p>
        <p>观看状态: {isViewing ? '正在观看' : '未观看'}</p>
      </div>
      <div className="mt-4 p-4 bg-gray-100 rounded max-h-60 overflow-y-auto">
        <h2 className="font-bold mb-2">调试日志:</h2>
        {logs.map((log, index) => (
          <div key={index} className="text-xs text-gray-600">
            {log}
          </div>
        ))}
      </div>
    </div>
  );
}