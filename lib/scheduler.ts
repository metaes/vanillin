// Obtain function that schedules work to be called as soon as possible, but not immediately.
// Currently don't use requestIdleCallback, it can take even seconds before callback is called.
const callASAP = setTimeout;

export function getTrampoliningScheduler(max_msIdle = 16) {
  const trampoline: any[] = [];
  let startTime;
  let trampolinePopping = false;

  function trampolinePop() {
    startTime = Date.now();
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
    if (startTime && Date.now() - startTime > max_msIdle) {
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
