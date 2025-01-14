"use client"
import { useState } from 'react';
import Link from 'next/link';

export default function Home() {
  const [roomId, setRoomId] = useState<string>('');
  
  const createRoom = () => {
    const newRoomId = Math.random().toString(36).substring(7);
    setRoomId(newRoomId);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold mb-8">WebRTC 直播平台</h1>
      <div className="space-y-4">
        <button
          onClick={createRoom}
          className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
        >
          创建直播房间
        </button>
        {roomId && (
          <div className="flex flex-col items-center space-y-4">
            <p>房间号: {roomId}</p>
            <Link 
              href={`/broadcast/${roomId}`}
              className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600"
            >
              开始直播
            </Link>
            <Link
              href={`/watchs/${roomId}`}
              className="bg-purple-500 text-white px-6 py-2 rounded hover:bg-purple-600"
            >
              观看直播
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}