import { LiveProvider } from "@/contexts/LiveContext";
import { ReactNode } from "react";

export default function LiveLayout({ children }: { children: ReactNode }) {
  return (
    <LiveProvider roomId="123456" url="http://192.168.1.105:3001/live/streaming">
      {children}
    </LiveProvider>
  );
}
