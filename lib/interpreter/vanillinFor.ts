import { callcc } from "metaes/callcc";
import { defaultScheduler } from "metaes/evaluate";
import { createScript } from "metaes/metaes";
import { ASTNode, Continuation, Environment, Evaluation } from "metaes/types";
import { EvaluationListener } from "../observable";
import { getTrampoliningScheduler } from "../scheduler";
import {
  ArrayUpdatingMethods,
  collectObservableVars,
  ObservableResult,
  VanillinEvaluateElement,
  VanillinEvaluationConfig
} from "../vanillin-0";

const isNode = (node: ASTNode, key: string) => {
  const value = node[key];
  return key !== "range" && value && (Array.isArray(value) || (typeof value === "object" && "type" in value));
};

const getNodeChildren = (node: ASTNode) =>
  Object.keys(node)
    .filter(isNode.bind(null, node))
    .map(name => ({ key: name, value: node[name] }));

const walkTree = (node: ASTNode, visitor: (node: ASTNode) => void) =>
  (function _walkTree(node) {
    if (Array.isArray(node)) {
      node.forEach(_walkTree);
    } else {
      visitor(node);
      if (typeof node === "object") {
        getNodeChildren(node).forEach(({ value }) => _walkTree(value));
      }
    }
  })(node);

export function VanillinFor({ element }, c, cerr, environment, config: VanillinEvaluationConfig) {
  const { context } = config;

  // Prepare template
  const template = element.cloneNode(true) as HTMLElement;
  template.removeAttribute("for");
  const parent = element.parentNode as HTMLElement;
  parent.removeChild(element);

  // Prepare metaes source/script
  const headerSource = element.getAttribute("for");
  const forLoopSource = `const bind = (iterable, index) => callcc(applyBind, {iterable, index}); for(${headerSource}) callcc(runBody);`;
  const script = createScript(forLoopSource, context.cache);

  // Collect observable variables until right-hand side of for-of statement is exited for the first time.
  walkTree(script.ast, node => {
    if (node.type === "ForOfStatement") {
      context.addListener(onRightNodeExited);

      function onRightNodeExited(evaluation: Evaluation) {
        if (evaluation.e === node.right && evaluation.phase === "exit") {
          context.removeListener(onRightNodeExited);
          if (observablesListener) {
            context.removeListener(observablesListener);
            observablesListener = null;
            listenToObservables(observableResults);
          }
        }
      }
    }
  });

  type Operation = { item: any; index?: number; operation: string; touchedBody?: boolean };

  // Indicates if interpretation exited loop header for the first time and started to evaluate loop body.
  let reachedLoopBody = false;
  let boundArray: any[];
  let boundContinuation: Continuation | undefined;
  let currentOperation: Operation | undefined;
  const boundArrayToHTML: HTMLElement[] = [];
  const boundArrayOperationsQueue: Operation[] = [];

  function applyBind({ iterable, index }, c, cerr) {
    if (boundContinuation && !reachedLoopBody) {
      cerr(new Error(`Multiple bind() calls in for-of loop are not supported yet.`));
    } else if (Array.isArray(iterable)) {
      // Catch only once. Subsequent runs shouldn't override original array.
      if (!boundArray) {
        // Iterator is object which should be ECMAScript Iterator. Currently only arrays are supported.
        boundArray = iterable;

        // Enqueue all new items to the queue.
        boundArrayOperationsQueue.push(...iterable.map((item, index) => ({ item, index, operation: "add" })));
      }

      // Catch continuation for later use
      boundContinuation = c;

      // bind() was called and `iterable` is argument to that call.
      // Don't pass it immediately forward as if `bind` wasn't used, rather pass empty array to stop loop iteration immediately.
      // Iteration will be resumed when whole loop ends.
      c([]);
    } else {
      const error = new Error(`Only arrays in bind() call are supported now.`);
      console.error({
        source: headerSource,
        loopSource: forLoopSource,
        env: loopEnv,
        element,
        error
      });
      cerr(error);
    }
  }

  function runBody(_, c, cerr, env: Environment) {
    reachedLoopBody = true;
    if (boundArray && currentOperation && currentOperation.operation === "check") {
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

  const evaluateNextItem = (nextElement: HTMLElement, c, cerr, env: Environment) => {
    itemsContainer.appendChild(nextElement);
    VanillinEvaluateElement(
      nextElement,
      c,
      cerr,
      // Rebuild this environment, skip values added for state control -
      // call/cc and environment getting should be not available for recurrent DOM binding.
      // They are under `bodyEnvironment.prev` environment.
      { values: env.values, prev: environment },
      config
    );
  };

  // Initially it's empty document fragment
  let itemsContainer: DocumentFragment | HTMLElement = parent; // document.createDocumentFragment();

  const observableResults: ObservableResult[] = [];
  let observablesListener: EvaluationListener | null = collectObservableVars(
    observableResults.push.bind(observableResults),
    environment
  );
  context.addListener(observablesListener);

  function listenToObservables(observableResults: ObservableResult[]) {
    function evaluate() {
      if (boundArray) {
        // 1. Find boundContinuation again, because environment state may change
        // 2. rerun loop body for each element
        boundArrayOperationsQueue.push(...boundArray.map((item, index) => ({ item, index, operation: "check" })));
        mainEval();
      } else {
        // TODO: unbind removed elements
        while (itemsContainer.firstChild) {
          itemsContainer.removeChild(itemsContainer.firstChild);
        }
        context.evaluate(
          script,
          console.log,
          cerr,
          loopEnv,
          Object.assign({ schedule: getTrampoliningScheduler() }, config)
        );
      }
    }

    uniqueValues(observableResults).forEach(observable => {
      const { object, property } = observable;

      let target;
      if (object === (target = boundArray) || (target = object[property!]) === boundArray) {
        context.addHandler({
          target,
          traps: {
            didApply(object: any[], method, args: any[]) {
              if (ArrayUpdatingMethods.includes(method)) {
                if (method === object.push) {
                  boundArrayOperationsQueue.push(...args.map(item => ({ item, operation: "add" })));
                  boundArrayToHTML.push.apply(boundArrayToHTML, [].fill.call({ length: args.length }, null));
                  evaluateQueue();
                } else if (method === object.splice) {
                  const [start, deleteCount, ...items] = args;
                  const element = boundArrayToHTML[start];
                  if (element) {
                    element.parentNode!.removeChild(element);
                  }
                  boundArrayToHTML.splice.apply(boundArrayToHTML, args);
                } else if (method === object.pop) {
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
    });
  }

  const loopEnv = {
    prev: environment,
    values: {
      applyBind,
      runBody,
      callcc
    }
  };

  let finishedAtLeastOnce = false;

  function evaluateQueue() {
    currentOperation = boundArrayOperationsQueue.shift();
    if (currentOperation) {
      boundContinuation!([currentOperation.item]);
    }
  }

  function mainEval() {
    reachedLoopBody = false;
    boundContinuation = undefined;
    context.evaluate(
      script,
      () => {
        if (currentOperation && currentOperation.operation === "check") {
          boundArrayToHTML[currentOperation.index].style.display = currentOperation.touchedBody ? null : "none";
        }
        if (boundArrayOperationsQueue.length) {
          evaluateQueue();
        } else if (!finishedAtLeastOnce) {
          //parent.appendChild(itemsContainer);
          itemsContainer = parent;
          c();
          finishedAtLeastOnce = true;
        }
      },
      e => {
        console.error({ forLoopSource, environment, element });
        console.error(e);
        cerr(e);
      },
      loopEnv,
      Object.assign({}, config, { schedule: defaultScheduler })
    );
  }

  mainEval();
}

function uniqueValues(observableResults: ObservableResult[]) {
  const added: ObservableResult[] = [];
  for (let i = 0; i < observableResults.length; i++) {
    const observable = observableResults[i];
    const { object, property } = observable;
    if (added.find(item => item.object === object && item.property === property)) {
      break;
    }
    added.push(observable);
  }
  return added;
}
