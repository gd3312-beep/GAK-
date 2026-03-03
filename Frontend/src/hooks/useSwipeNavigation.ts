import { useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const ROUTES = ["/home", "/gyaan", "/karma", "/ahara", "/planner"];
const SWIPE_THRESHOLD = 60;

export function useSwipeNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const currentIndex = ROUTES.indexOf(location.pathname);
  const isSwipeable = currentIndex !== -1;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current || !isSwipeable) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;

    // Only horizontal swipes (not vertical scroll)
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dy) > Math.abs(dx)) return;

    if (dx < 0 && currentIndex < ROUTES.length - 1) {
      navigate(ROUTES[currentIndex + 1]);
    } else if (dx > 0 && currentIndex > 0) {
      navigate(ROUTES[currentIndex - 1]);
    }
  }, [currentIndex, isSwipeable, navigate]);

  return { onTouchStart, onTouchEnd, isSwipeable };
}
