import React from 'react';
import LeftSideBar from './LeftSideBar';
import RightSideBar from './RightSideBar';
import Content from './Content';

const LiveMain = () => {
  return (
    <div className="flex h-screen w-full">
      <LeftSideBar></LeftSideBar>
      <Content></Content>
      <RightSideBar></RightSideBar>
    </div>
  );
};

export default LiveMain;