import React, { useRef } from 'react';
import LeftSideBar from './LeftSideBar';
import RightSideBar from './RightSideBar';
import Content from './Content';
import { LiveProvider } from '@/contexts/LiveContext';

const LiveMain = () => {
  return (
    <div className="flex h-screen w-full relative">
      <LeftSideBar className="hidden lg:block"></LeftSideBar>
      <LiveProvider roomId="123456">
        <Content></Content>
      </LiveProvider>
      <RightSideBar className="hidden md:block"></RightSideBar>
    </div>
  );
};

export default LiveMain;