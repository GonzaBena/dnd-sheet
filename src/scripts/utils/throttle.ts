// src/scripts/utils/throttle.ts
// Throttle con leading y trailing execution, y métodos flush() y cancel().
// Sin dependencias externas ni de DOM, testeable en Node.js.

export interface ThrottledFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void;
  flush(): void;
  cancel(): void;
}

export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  ms: number
): ThrottledFunction<T> {
  let timer: any = null;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: any = null;
  let lastCallTime = -Infinity;

  function invoke() {
    if (lastArgs !== null) {
      const args = lastArgs;
      const context = lastThis;
      lastArgs = null;
      lastThis = null;
      lastCallTime = Date.now();
      fn.apply(context, args);
    }
  }

  const throttled = function (this: any, ...args: Parameters<T>) {
    const now = Date.now();
    const elapsed = now - lastCallTime;
    lastArgs = args;
    lastThis = this;

    if (elapsed >= ms) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      invoke();
    } else if (!timer) {
      const remaining = ms - elapsed;
      timer = setTimeout(() => {
        timer = null;
        invoke();
      }, remaining);
    }
  } as ThrottledFunction<T>;

  throttled.cancel = function () {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = null;
    lastThis = null;
  };

  throttled.flush = function () {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      invoke();
    }
  };

  return throttled;
}
