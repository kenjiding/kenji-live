import React from 'react';
import {Input} from '@/components/ui/input';

type HeaderProps = {
  // props
};

const Header: React.FC<HeaderProps> = (props) => {
  return (
    <div className='flex flex-row py-3 px-10 border-b border-gray-800 bg-[#121212]'>
      <div className='flex-1 flex items-center'>
        <span>Kenji Live</span>
      </div>
      <div className='flex-1'>
        <Input type="text" />
      </div>
      <div className='flex-1 flex items-center justify-end'>
        <div className='py-1 px-4 bg-red-500 rounded-md mr-3 cursor-pointer'>
          <a target='_blank' href="/broadcaster/123456">start broadcasting</a>
        </div>
        Login
      </div>
    </div>
  );
};

export default Header;