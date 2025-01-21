
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TooltipWrapperProps {
  children: React.ReactNode;
  text: string;
}

const TooltipWrapper = ({ children, text }: TooltipWrapperProps) => {
  return <TooltipProvider delayDuration={100}>
  <Tooltip>
    <TooltipTrigger asChild>
      { children }
    </TooltipTrigger>
    <TooltipContent>
      { text }
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
};

export default TooltipWrapper;