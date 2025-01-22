"use client"
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Socket, io } from 'socket.io-client';

// 定义上下文类型
export interface LiveContextType {
  ws: Socket | null;
  wsInterativeRef: Socket | null;
  isConnected: boolean;
  isInteractiveConnected: boolean;
  roomId: string;
}

// 定义 Provider Props 类型
export interface LiveProviderProps {
  children: ReactNode;
  roomId: string;
  url?: string;
}

// 创建上下文
export const LiveContext = createContext<LiveContextType | null>(null);

// Provider 组件
export function LiveProvider({ children, roomId, url }: LiveProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isInteractiveConnected, setIsInteractiveConnected] = useState(false);
  const wsRef = useRef<Socket | null>(null);
  const wsInterativeRef = useRef<Socket | null>(null);

  useEffect(() => {
    // 创建 WebSocket 连接
    const ws = io('http://192.168.1.105:3001/live/streaming', {
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: Infinity, // 无限重试
      reconnectionDelay: 1000,   // 初始重连延迟1秒
      reconnectionDelayMax: 5000, // 最大重连延迟5秒
      randomizationFactor: 0.5, 
      transports: ['websocket', 'polling']
    });

    const wsInterative = io('http://192.168.1.105:3001/live/interactive', {
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: Infinity, // 无限重试
      reconnectionDelay: 1000,   // 初始重连延迟1秒
      reconnectionDelayMax: 5000, // 最大重连延迟5秒
      randomizationFactor: 0.5, 
      transports: ['websocket', 'polling']
    });
    
    wsRef.current = ws;
    wsInterativeRef.current = wsInterative;

    // 基础连接事件处理
    ws.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    });

    ws.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    });

    ws.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setIsConnected(false);
    });

    // 基础连接事件处理
    wsInterative.on('connect', () => {
      console.log('interative WebSocket connected');
      setIsInteractiveConnected(true);
    });

    wsInterative.on('disconnect', () => {
      console.log('interative WebSocket disconnected');
      setIsInteractiveConnected(false);
    });

    wsInterative.on('connect_error', (error) => {
      console.error('interative Connection error:', error);
      setIsInteractiveConnected(false);
    });

    // 清理函数
    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current = null;
      }
      if (wsInterativeRef.current) {
        wsInterativeRef.current.disconnect();
        wsInterativeRef.current = null;
      }
      setIsConnected(false);
      setIsInteractiveConnected(false);
    };
  }, []);

  // 提供上下文值
  const contextValue: LiveContextType = {
    ws: wsRef.current,
    wsInterativeRef: wsInterativeRef.current,
    isConnected,
    roomId,
    isInteractiveConnected
  };

  return (
    <LiveContext.Provider value={contextValue}>
      {children}
    </LiveContext.Provider>
  );
}