type Resume = (fn: Function) => void;

export function getTrampoliningScheduler(deadline = 16, resume: Resume = setTimeout) {
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
    if (startTime && Date.now() - startTime > deadline) {
      trampolinePopping = false;
      startTime = null;
      resume(function() {
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
