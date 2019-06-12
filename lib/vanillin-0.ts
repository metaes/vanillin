import { getEnvironmentForValue, GetValueSync, toEnvironment } from "metaes/environment";
import { visitArray } from "metaes/evaluate";
import { createScript } from "metaes/metaes";
import { MemberExpression } from "metaes/nodeTypes";
import { ASTNode, Continuation, Environment, ErrorContinuation, EvaluationConfig, Script } from "metaes/types";
import { ComponentOptions, COMPONENT_ATTRIBUTE_NAME } from "./interpreter/vanillinEvaluateComponent";
import { VanillinInterpreters } from "./interpreter/vanillinInterpreters";
import { EvaluationListener, ObservableContext } from "./observable";
import { getTrampoliningScheduler } from "./scheduler";
import { GetVanillinLib } from "./vanillin-lib";
import { defineComponent } from "./vanillinEnvironment";

export function evalCollect(
  { results, script }: { results: ObservableResult[]; script: Script },
  c: Continuation,
  cerr: ErrorContinuation,
  environment: Environment,
  config: VanillinEvaluationConfig
) {
  const context = config.context;
  const collector = collectObservableVars(result => results.push(result), environment);
  context.addListener(collector);
  context.evaluate(
    script,
    value => {
      context.removeListener(collector);
      c(value);
    },
    e => {
      context.removeListener(collector);
      console.error({ e, environment, source: script.source });
      cerr(e);
    },
    environment,
    config
  );
}

export const ArrayUpdatingMethods = ["splice", "pop", "push", "shift", "unshift"].map(
  methodName => Array.prototype[methodName]
);

export function evalCollectObserve(
  script: Script,
  c: Continuation,
  cerr: ErrorContinuation,
  environment: Environment,
  config: VanillinEvaluationConfig
) {
  const { context } = config;
  const evaluate = () => context.evaluate(script, c, cerr, environment, config);

  function add(target: ObservableResult) {
    const { object, property } = target;
    context.addHandler({
      target: object,
      traps: {
        didApply(o, p, _v) {
          if (Array.isArray(o) && ArrayUpdatingMethods.includes(p)) {
            evaluate();
          }
        },
        didSet(o, p, _v) {
          if (object === o && p === property) {
            evaluate();
          }
        }
      }
    });
  }
  const results: ObservableResult[] = [];
  evalCollect(
    { results, script },
    value => {
      c(value);
      const added: ObservableResult[] = [];
      results.forEach(result => {
        const { object, property } = result;

        // If object/property pair was already added, skip adding another handler.
        // This may happen then observable reference occurs in code more than once.
        if (added.find(found => found.object === object && found.property === property)) {
          return;
        }
        add(result);
        added.push(result);
      });
    },
    cerr,
    environment,
    config
  );
}

const isMemberExpression = (e: ASTNode): e is MemberExpression => e.type === "MemberExpression";

export type ObservableResult = {
  object: any;
  property?: string;
};

/**
 * Will collect variables belonging both to `bottomEnvironment` or top environment.
 * Top environment is calculated from `prev` properties recursively.
 *
 * @param resultsCallback
 * @param bottomEnvironment
 */
export const collectObservableVars = (
  resultsCallback: (result: ObservableResult) => void,
  bottomEnvironment: Environment
): EvaluationListener => {
  let _env: Environment = bottomEnvironment;
  while (_env.prev) {
    _env = _env.prev;
  }
  return ({ e, phase }, graph) => {
    if (phase === "exit") {
      const stack = graph.executionStack;

      // Ignore checking when sitting inside deeper member expression
      if (stack.length > 1 && stack[stack.length - 2].evaluation.e.type === "MemberExpression") {
        return;
      }
      if (isMemberExpression(e)) {
        const property = e.computed ? graph.values.get(e.property) : e.property.name;
        resultsCallback({ object: graph.values.get(e.object), property });
      } else if (e.type === "Identifier") {
        const varEnv = getEnvironmentForValue(bottomEnvironment, e.name);
        if (varEnv) {
          resultsCallback({ object: varEnv.values, property: e.name });
        }
      }
    }
  };
};

export interface VanillinEvaluationConfig extends EvaluationConfig {
  context: ObservableContext;
  vanillin: ReturnType<typeof GetVanillinLib>;
  extra?: (e: HTMLElement, env: Environment, statements: string[]) => void;
}

export function stringToDOM(source: string) {
  const document = new DOMParser().parseFromString(source, "text/html");

  // Also look for head contents.
  // This is how DOMParser works, it pushes <script>s to head.
  const head = document.head.childNodes;
  const body = document.body.childNodes;
  const nodes: any[] = [];
  // @ts-ignore
  nodes.push(...head);
  // @ts-ignore
  nodes.push(...body);

  if (nodes.length === 1) {
    return nodes[0];
  } else {
    return nodes;
  }
}

export function getTemplate({ templateUrl, templateElement, templateString }: ComponentOptions, c, cerr) {
  if (templateUrl) {
    createDOMElementFromURL(templateUrl, c, cerr);
  } else if (templateElement) {
    if (templateElement instanceof NodeList) {
      c(Array.from(templateElement).map(node => node.cloneNode(true)));
    } else {
      c(templateElement.cloneNode(true));
    }
  } else if (templateString) {
    c(stringToDOM(templateString));
  } else {
    c(null);
  }
}

// TODO: should rather rely on browser cache
const templatesCache = new Map<string, any>();

export const createDOMElementFromURL = (templateURL: string, c: Continuation, cerr: ErrorContinuation) =>
  templatesCache.has(templateURL)
    ? c(stringToDOM(templatesCache.get(templateURL)))
    : fetch(templateURL)
        .then(d => d.text())
        .then(htmlString => {
          const cleaned = htmlString.trim();
          templatesCache.set(templateURL, cleaned);
          c(stringToDOM(cleaned));
        })
        .catch(cerr);

export function bindDOM(
  dom: HTMLElement | HTMLElement[] | NodeList | string | undefined,
  c: Continuation,
  cerr: ErrorContinuation,
  env: Environment | object = {},
  config: Partial<VanillinEvaluationConfig> = {}
) {
  if (dom) {
    if (typeof dom === "string") {
      dom = stringToDOM(dom) as NodeList | HTMLElement;
    }
    config.vanillin = { ...GetVanillinLib(), ...config.vanillin };
    config.interpreters = toEnvironment(config.interpreters || VanillinInterpreters);
    if (!config.interpreters.prev) {
      config.interpreters.prev = VanillinInterpreters;
    }
    if (!config.context) {
      config.context = new ObservableContext(env);
    }

    const shouldReplaceOriginalEnviornment = env && "values" in env && "prev" in env;

    vanillinEval(
      dom,
      c,
      cerr,
      shouldReplaceOriginalEnviornment ? (env as Environment) : { values: env, prev: config.context.environment },
      config
    );
  } else {
    c();
  }
  // Useful in case provided dom variable was string, now it's a DOM element
  return dom;
}

export function vanillinEval(
  dom: HTMLElement | HTMLElement[] | NodeList,
  c: Continuation,
  cerr: ErrorContinuation,
  env: Environment,
  config: Partial<VanillinEvaluationConfig> = {}
) {
  if (dom instanceof NodeList || Array.isArray(dom) || dom instanceof HTMLCollection) {
    visitArray(
      (Array.isArray(dom) ? dom : (Array.from(dom) as HTMLElement[])).filter(
        child => child.nodeType === Node.ELEMENT_NODE
      ),
      (element, c, cerr) => VanillinEvaluateElement(element, c, cerr, env, config),
      c,
      cerr
    );
  } else {
    VanillinEvaluateElement(dom, c, cerr, env, config);
  }
}

export function VanillinEvaluateElement(
  element: HTMLElement,
  c: Continuation,
  cerr: ErrorContinuation,
  environment: Environment,
  config: VanillinEvaluationConfig
) {
  const hasAttrs = !!element.attributes.length;
  const statements: string[] = [];
  const nodeName = element.nodeName.toLowerCase();

  if (hasAttrs && element.hasAttribute("callcc")) {
    statements.push("VanillinCallcc");
  } else if (hasAttrs && element.hasAttribute("if")) {
    statements.push("VanillinIf");
  } else if (hasAttrs && element.hasAttribute("for") && nodeName !== "label") {
    statements.push("VanillinFor");
  } else if (nodeName === "function") {
    vanillinFunctionDeclaration(element, environment, config);
  } else if (
    (hasAttrs && element.hasAttribute(COMPONENT_ATTRIBUTE_NAME)) ||
    GetValueSync(nodeName, config.interpreters)
  ) {
    statements.push("VanillinEvaluateComponent");
  } else if (nodeName === "script" && element.textContent) {
    statements.push("VanillinScriptElement");
  } else {
    if (hasAttrs) {
      bindEventHandlers(element, environment, config);

      if (element.hasAttribute("bind")) {
        statements.push("VanillinElementTextContent");
      }
      if (element.hasAttribute("bind-attrs")) {
        statements.push("VanillinElementAttributes");
      }
      if (element.hasAttribute("script")) {
        statements.push("VanillinScriptAttribute");
      }
    }
    if (element.children.length) {
      statements.push("VanillinEvaluateChildren");
    }
    if (config.extra) {
      config.extra(element, environment, statements);
    }
  }

  if (statements.length) {
    config.context.evaluate(
      {
        type: "BlockStatement",
        body: statements.map(type => ({ type, element }))
      },
      c,
      cerr,
      environment,
      { schedule: getTrampoliningScheduler(), ...config }
    );
  } else {
    c(element);
  }
}

function vanillinFunctionDeclaration(element, environment, config: VanillinEvaluationConfig) {
  if (element.hasAttribute("name")) {
    defineComponent(config.interpreters, element.getAttribute("name")!, null, {
      templateElement: element.cloneNode(true),
      closure: environment
    });
    if (element.parentElement) {
      element.parentElement.removeChild(element);
    } else {
      element.style.display = "none";
    }
  } else {
    throw new Error("Missing @name attribute");
  }
}

export function bindEventHandlers(element, environment, config: VanillinEvaluationConfig) {
  const { context } = config;

  for (const attr of element.attributes) {
    if (attr.name.substring(0, 2) !== "on") {
      continue;
    }
    const eventName = attr.name.substring(2); // remove 'on'
    const source = attr.value;

    // delay script creation until event is fired
    let script;

    // Add metaes based event handler body
    element.addEventListener(eventName, async event => {
      try {
        if (!script) {
          script = createScript(source, context.cache);
        }
        const env = {
          values: { event, this: element },
          prev: environment
        };
        context.evaluate(
          script,
          // ignore success value
          undefined,
          error => console.error({ env, source, eventName, event, element, error }),
          env
        );
      } catch (e) {
        console.error({ e, element, source });
      }
    });
    // Remove original handler from element
    element[attr.name] = null;
  }
}
