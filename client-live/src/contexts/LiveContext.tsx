"use client"
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Socket, io } from 'socket.io-client';

// 定义上下文类型
export interface LiveContextType {
  ws: Socket | null;
  isConnected: boolean;
  roomId: string;
}

// 定义 Provider Props 类型
export interface LiveProviderProps {
  children: ReactNode;
  roomId: string;
  url: string;
}

// 创建上下文
export const LiveContext = createContext<LiveContextType | null>(null);

// Provider 组件
export function LiveProvider({ children, roomId, url }: LiveProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<Socket | null>(null);

  useEffect(() => {
    // 创建 WebSocket 连接
    const ws = io(url, {
      path: '/socket.io',
      transports: ['websocket', 'polling']
    });
    
    wsRef.current = ws;

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

    // 清理函数
    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, []);

  // 提供上下文值
  const contextValue: LiveContextType = {
    ws: wsRef.current,
    isConnected,
    roomId,
  };

  return (
    <LiveContext.Provider value={contextValue}>
      {children}
    </LiveContext.Provider>
  );
}