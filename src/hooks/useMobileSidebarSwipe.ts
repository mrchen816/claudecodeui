import { useEffect, useRef } from 'react';

type UseMobileSidebarSwipeOptions = {
  isMobile: boolean;
  sidebarOpen: boolean;
  onOpen: () => void;
  edgeWidth?: number;
  minSwipeDistance?: number;
};

type TouchPoint = {
  x: number;
  y: number;
};

const DEFAULT_EDGE_WIDTH = 24;
const DEFAULT_MIN_SWIPE_DISTANCE = 50;

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
};

export function useMobileSidebarSwipe({
  isMobile,
  sidebarOpen,
  onOpen,
  edgeWidth = DEFAULT_EDGE_WIDTH,
  minSwipeDistance = DEFAULT_MIN_SWIPE_DISTANCE,
}: UseMobileSidebarSwipeOptions) {
  const edgeRef = useRef<HTMLDivElement>(null);
  const onOpenRef = useRef(onOpen);
  const sidebarOpenRef = useRef(sidebarOpen);
  const touchStartRef = useRef<TouchPoint | null>(null);
  const isTrackingRef = useRef(false);

  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    sidebarOpenRef.current = sidebarOpen;
  }, [sidebarOpen]);

  useEffect(() => {
    const element = edgeRef.current;
    if (!isMobile || !element) {
      return undefined;
    }

    const resetTracking = () => {
      touchStartRef.current = null;
      isTrackingRef.current = false;
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        resetTracking();
        return;
      }

      const touch = event.touches[0];
      if (touch.clientX > edgeWidth || isEditableTarget(event.target)) {
        resetTracking();
        return;
      }

      event.preventDefault();
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      isTrackingRef.current = true;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!isTrackingRef.current || !touchStartRef.current || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;

      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
        resetTracking();
        return;
      }

      if (dx > 0) {
        event.preventDefault();
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (!isTrackingRef.current || !touchStartRef.current) {
        resetTracking();
        return;
      }

      const touch = event.changedTouches[0];
      if (!touch) {
        resetTracking();
        return;
      }

      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;

      if (
        !sidebarOpenRef.current
        && dx >= minSwipeDistance
        && Math.abs(dx) > Math.abs(dy)
      ) {
        onOpenRef.current();
      }

      resetTracking();
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });
    element.addEventListener('touchcancel', resetTracking, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', resetTracking);
    };
  }, [edgeWidth, isMobile, minSwipeDistance]);

  return edgeRef;
}
