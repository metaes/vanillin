const now = typeof performance === "object" ? () => performance.now() : () => new Date().getTime();

// Obtain function that schedules work to be called as soon as possible.
const callASAP = typeof requestIdleCallback === "function" ? requestIdleCallback : setTimeout;

export function getTrampoliningScheduler(max_msIdle = 16) {
  const trampoline: any[] = [];
  let startTime;
  let trampolinePopping = false;

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
      callASAP(function() {
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
