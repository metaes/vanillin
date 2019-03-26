const hasPerformance = typeof performance === "object";

export function getTrampoliningScheduler(max_msIdle = 16) {
  const trampoline: any[] = [];
  let startTime;
  let trampolinePopping = false;
  function now() {
    return hasPerformance ? performance.now() : new Date().getTime();
  }
  function trampolinePop() {
    startTime = now();
    trampolinePopping = true;
    while (trampoline.length) {
      try {
        trampoline.pop()();
      } catch (e) {
        console.log("uncaught, will be rethrown", e);
      }
    }
    trampolinePopping = false;
  }
  return function trampolinePush(fn) {
    if (startTime && now() - startTime > max_msIdle) {
      trampolinePopping = false;
      startTime = null;
      (typeof requestIdleCallback === "function" ? requestIdleCallback : setTimeout)(function() {
        trampoline.push(fn);
        trampolinePop();
      });
      return;
    }
    trampoline.push(fn);
    if (trampolinePopping) {
      return;
    }
    trampolinePop();
  };
}
