import { LiveProvider } from "@/contexts/LiveContext";
import { ReactNode } from "react";

export default function LiveLayout({ children }: { children: ReactNode }) {
  return (
    <LiveProvider roomId="123456">
      {children}
    </LiveProvider>
  );
}
