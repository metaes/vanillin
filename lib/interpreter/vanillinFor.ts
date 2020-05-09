import { liftedAll, lifted, callcc } from "metaes/callcc";
import { GetValueSync } from "metaes/environment";
import { createScript } from "metaes/metaes";
import { Continuation, Environment } from "metaes/types";
import { EvaluationListener } from "../observable";
import { getTrampoliningScheduler } from "../scheduler";
import { ArrayUpdatingMethods, collectObservableVars, ObservableResult, VanillinEvaluationConfig } from "../vanillin-0";

class PauseException {}

const pause = lifted(function ([resumer], c, cerr) {
  resumer(c, cerr);
  cerr(new PauseException());
});

type Input = { element: HTMLElement };

export function VanillinFor(
  { element }: Input,
  c,
  cerr,
  closureEnvironment: Environment,
  config: VanillinEvaluationConfig
) {
  const { context } = config;

  const forStatementHeadSource = element.getAttribute("for");
  const forStatementSource = `for (${forStatementHeadSource}) callcc(evaluateBody);`;
  const forStatementScript = createScript(forStatementSource, context.cache);

  const template = element.cloneNode(true) as HTMLElement;
  const parentNode = element.parentNode as HTMLElement;
  let { previousElementSibling, nextElementSibling } = element;
  template.removeAttribute("for");
  parentNode.removeChild(element);

  // TODO: simplify
  type Operation = { item: any; index?: number; operation: string; touchedBody?: boolean };

  const boundArrayToHTML: HTMLElement[] = [];
  const targetModificationsQueue: Operation[] = [];
  const observableResults: ObservableResult[] = [];
  const forStatementEnvironment: Environment = {
    values: { pause, callcc, evaluateBody, ...liftedAll({ bind }) },
    prev: closureEnvironment
  };
  let reachedLoopBody = false;
  let finished = false;
  let boundObject: any[];
  let boundContinuation: Continuation | undefined;
  let currentOperation: Operation | undefined;
  // Initially it's empty document fragment
  let itemsContainer: DocumentFragment | HTMLElement = parentNode; // document.createDocumentFragment();
  let collectObservablesListener: EvaluationListener | null = collectObservableVars(
    (d) => observableResults.push(d),
    forStatementScript,
    closureEnvironment
  );
  context.addListener(collectObservablesListener);

  mainEval();

  function evaluateBody(_, c, cerr, env: Environment) {
    listenToObservables();
    reachedLoopBody = true;

    if (boundObject && currentOperation && currentOperation.operation === "check") {
      currentOperation.touchedBody = true;
      c();
    } else {
      const element = template.cloneNode(true) as HTMLElement;
      if (currentOperation && typeof currentOperation.index === "number") {
        boundArrayToHTML[currentOperation.index] = element;
      }
      evaluateNextItem(element, c, cerr, env);
    }
  }

  function evaluateNextItem(nextElement: HTMLElement, c, cerr, env: Environment) {
    if (previousElementSibling) {
      previousElementSibling.insertAdjacentElement("afterend", nextElement);
    } else if (nextElementSibling) {
      nextElementSibling.insertAdjacentElement("beforebegin", nextElement);
      nextElementSibling = null;
    } else {
      itemsContainer.appendChild(nextElement);
    }
    previousElementSibling = nextElement;

    GetValueSync("VanillinEvaluateElement", config.interpreters)(nextElement, c, cerr, env, config);
  }

  function bind([target], c, cerr) {
    if (boundContinuation && !reachedLoopBody) {
      cerr(new Error(`Multiple bind() calls in for-of loop are not supported yet.`));
    } else if (Array.isArray(target)) {
      if (!boundObject) {
        boundObject = target;
        targetModificationsQueue.push(...target.map((item, index) => ({ item, index, operation: "add" })));
      }
      boundContinuation = c;
      c([]);
    } else {
      const error = new Error(`Only arrays in bind() call are supported now.`);
      console.error({
        source: forStatementHeadSource,
        loopSource: forStatementSource,
        env: forStatementEnvironment,
        element,
        error
      });
      cerr(error);
    }
  }

  function listenToObservables() {
    if (!collectObservablesListener) {
      return;
    }
    context.removeListener(collectObservablesListener);
    collectObservablesListener = null;

    for (let observable of observableResults) {
      const { object, property } = observable;

      let target;
      if (object === (target = boundObject) || (target = object[property!]) === boundObject) {
        context.addHandler({
          target,
          traps: {
            didApply(object: any[], method, args: any[]) {
              if (ArrayUpdatingMethods.includes(method)) {
                if (method === object.push) {
                  targetModificationsQueue.push(...args.map((item) => ({ item, operation: "add" })));
                  boundArrayToHTML.push.apply(boundArrayToHTML, [].fill.call({ length: args.length }, null));
                  evaluateQueue();
                } else if (method === object.splice) {
                  const [start, deleteCount, ...items] = args;
                  const element = boundArrayToHTML[start];
                  if (element) {
                    element.parentNode!.removeChild(element);
                  }
                  boundArrayToHTML.splice.apply(boundArrayToHTML, args);
                } else if (method === object.unshift) {
                }
              }
            }
          }
        });
      } else {
        context.addHandler({
          target: object,
          traps: {
            didSet(_object, prop, _value) {
              if (prop === property) {
                evaluate();
              }
            }
          }
        });
        if (property && Array.isArray(object[property])) {
          context.addHandler({
            target: object[property],
            traps: {
              didApply(_, method) {
                if (ArrayUpdatingMethods.includes(method)) {
                  evaluate();
                }
              }
            }
          });
        }
      }
    }

    function evaluate() {
      if (boundObject) {
        // 1. Find boundContinuation again, because environment state may change
        // 2. rerun loop body for each element
        targetModificationsQueue.push(...boundObject.map((item, index) => ({ item, index, operation: "check" })));
        mainEval();
      } else {
        // TODO: unbind removed elements
        while (itemsContainer.firstChild) {
          itemsContainer.removeChild(itemsContainer.firstChild);
        }
        context.evaluate(forStatementScript, console.log, cerr, forStatementEnvironment, {
          schedule: getTrampoliningScheduler(),
          ...config,
          script: forStatementScript
        });
      }
    }
  }

  function finish() {
    if (!finished) {
      //parent.appendChild(itemsContainer);
      itemsContainer = parentNode;
      c();
      finished = true;
    }
  }

  function evaluateQueue() {
    currentOperation = targetModificationsQueue.shift();
    if (currentOperation) {
      boundContinuation!([currentOperation.item]);
    }
  }

  function mainEval() {
    reachedLoopBody = false;
    boundContinuation = undefined;
    context.evaluate(
      forStatementScript,
      function () {
        listenToObservables();
        if (currentOperation && currentOperation.operation === "check") {
          boundArrayToHTML[currentOperation.index].style.display = currentOperation.touchedBody ? null : "none";
        }
        if (targetModificationsQueue.length) {
          evaluateQueue();
        } else {
          finish();
        }
      },
      function (e) {
        if (e instanceof PauseException) {
          finish();
        } else {
          console.error({ forLoopSource: forStatementSource, environment: closureEnvironment, element });
          console.error(e);
          cerr(e);
        }
      },
      forStatementEnvironment,
      { ...config, script: forStatementScript }
    );
  }
}
