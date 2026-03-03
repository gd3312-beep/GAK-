import { ReactNode } from "react";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";

interface SwipeContainerProps {
  children: ReactNode;
}

export function SwipeContainer({ children }: SwipeContainerProps) {
  const { onTouchStart, onTouchEnd } = useSwipeNavigation();

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="min-h-screen">
      {children}
    </div>
  );
}
