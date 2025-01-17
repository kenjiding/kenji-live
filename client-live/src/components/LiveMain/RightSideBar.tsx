import React from 'react';
import { Camera, House, UserRoundCheck, Handshake, TvMinimalPlay } from 'lucide-react';
const RightSideBar = () => {
  return (
    <aside className="w-80 shadow-lg bg-[#121212] border-l border-gray-800">
      <div className="p-4">
        <div className="space-y-4">
          <div className="p-2 bg-gray-900 rounded">Widget 1</div>
          <div className="p-2 bg-gray-900 rounded">Widget 2</div>
          <div className="p-2 bg-gray-900 rounded">Widget 3</div>
        </div>
      </div>
    </aside>
  );
};

export default RightSideBar;