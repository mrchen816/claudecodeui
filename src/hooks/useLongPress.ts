import { useCallback, useEffect, useRef, useState } from 'react';

export type Point = { x: number; y: number };

export type LongPressGestureOptions = {
  delay: number;
  moveTolerancePx: number;
  onLongPress: () => void;
};

export class LongPressGesture {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private startPoint: Point | null = null;
  private fired = false;

  constructor(private readonly options: LongPressGestureOptions) {}

  start(point: Point): void {
    this.cancel();
    this.startPoint = point;
    this.timeoutId = setTimeout(() => {
      this.timeoutId = null;
      this.fired = true;
      this.options.onLongPress();
    }, this.options.delay);
  }

  move(point: Point): void {
    if (!this.startPoint || this.timeoutId === null) {
      return;
    }

    const dx = point.x - this.startPoint.x;
    const dy = point.y - this.startPoint.y;
    if (Math.hypot(dx, dy) > this.options.moveTolerancePx) {
      this.cancel();
    }
  }

  end(): boolean {
    const didFire = this.fired;
    this.cancel();
    return didFire;
  }

  cancel(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.startPoint = null;
    this.fired = false;
  }
}

type UseLongPressOptions = {
  onLongPress: () => void;
  delay?: number;
  moveTolerancePx?: number;
  disabled?: boolean;
};

export function useLongPress({
  onLongPress,
  delay = 500,
  moveTolerancePx = 10,
  disabled = false,
}: UseLongPressOptions) {
  const [isPressing, setIsPressing] = useState(false);
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;

  const [gesture] = useState(
    () =>
      new LongPressGesture({
        delay,
        moveTolerancePx,
        onLongPress: () => {
          setIsPressing(false);
          onLongPressRef.current();
        },
      }),
  );

  useEffect(() => () => gesture.cancel(), [gesture]);

  const onTouchStart = useCallback(
    (event: React.TouchEvent) => {
      if (disabled || event.touches.length !== 1) {
        return;
      }
      const touch = event.touches[0];
      setIsPressing(true);
      gesture.start({ x: touch.clientX, y: touch.clientY });
    },
    [disabled, gesture],
  );

  const onTouchMove = useCallback(
    (event: React.TouchEvent) => {
      if (event.touches.length !== 1) {
        return;
      }
      const touch = event.touches[0];
      gesture.move({ x: touch.clientX, y: touch.clientY });
    },
    [gesture],
  );

  const onTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      const didFire = gesture.end();
      setIsPressing(false);
      if (didFire) {
        event.preventDefault();
      }
    },
    [gesture],
  );

  const onTouchCancel = useCallback(() => {
    gesture.cancel();
    setIsPressing(false);
  }, [gesture]);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, isPressing };
}
