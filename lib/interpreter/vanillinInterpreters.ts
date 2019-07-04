import { NotImplementedException } from "metaes/exceptions";
import { ECMAScriptInterpreters } from "metaes/interpreters";
import { createScript } from "metaes/metaes";
import { Continuation, Environment, ErrorContinuation } from "metaes/types";
import { evalCollectObserve, vanillinEval, VanillinEvaluateElement, VanillinEvaluationConfig } from "../vanillin-0";
import { VanillinEvaluateComponent } from "./vanillinEvaluateComponent";
import { VanillinFor } from "./vanillinFor";
import { defaultScheduler } from "metaes/evaluate";

export function VanillinScriptElement({ element }, c, cerr, environment, config: VanillinEvaluationConfig) {
  const source = element.textContent;
  const script = createScript(source, config.context.cache);
  if (element.hasAttribute("observe")) {
    let done = false;
    evalCollectObserve(
      script,
      () => {
        if (!done) {
          done = true;
          c();
        }
      },
      e => {
        console.error({ element, e, source: element.textContent, environment });
        cerr(e);
      },
      environment,
      config
    );
  } else {
    config.context.evaluate(
      script,
      c,
      e => {
        console.error({ element, source, environment, ...e });
        cerr(e);
      },
      environment,
      { ...config, schedule: defaultScheduler }
    );
  }
}

export function VanillinScriptAttribute({ element }, c, cerr, environment, config: VanillinEvaluationConfig) {
  const source = element.getAttribute("script")!;
  const script = createScript(source, config.context.cache);
  const env = { values: { this: element }, prev: environment };

  let done = false;
  evalCollectObserve(
    script,
    () => {
      if (!done) {
        done = true;
        c();
      }
    },
    e => {
      console.error({ element, e, source: element.textContent, env });
      cerr(e);
    },
    env,
    config
  );
}

export function VanillinElementTextContent({ element }, c, cerr, environment, config: VanillinEvaluationConfig) {
  let done = false;
  try {
    const value = element.getAttribute("bind");
    if (!value && element.textContent) {
      const source = element.textContent;
      const script = createScript(source, config.context.cache);
      const onError = (cerr, e) => {
        console.error({ element, e, source, environment });
        if (!done) {
          done = true;
          cerr(e);
        }
      };
      if (element.hasAttribute("async")) {
        // TODO: remember to collect and repeat here as well
        // Schedule execution and run whenever there is time for it
        config.context.evaluate(script, r => (element.textContent = r), onError.bind(null, cerr), environment, {
          ...config,
          script
        });
        // and continue anyway
        c();
      } else {
        evalCollectObserve(
          script,
          value => {
            element.textContent = value;
            if (!done) {
              done = true;
              c(value);
            }
          },
          onError.bind(null, cerr),
          environment,
          config
        );
      }
    } else {
      // TODO: run function code in @bind?
      cerr(NotImplementedException(`Empty textContent with enabled @bind attribute is not supported yet.`));
    }
  } catch (e) {
    cerr(e);
  }
}

export function VanillinElementAttributes({ element }, c, _cerr, environment, config: VanillinEvaluationConfig) {
  const boundAttrs = element.getAttribute("bind-attrs").split(",");

  boundAttrs.forEach(function(attrName) {
    const attrNameCleaned = attrName.trim();
    const source = element.getAttribute(attrNameCleaned);
    const script = createScript(source, config.context.cache);

    evalCollectObserve(
      script,
      value => (element[attrNameCleaned] = value),
      e => console.error({ element, e, source, environment }),
      environment,
      config
    );
  });
  c();
}

export function VanillinIf({ element }, c, cerr, environment, config: VanillinEvaluationConfig) {
  // TODO: it should be handled by success continuation when script evaluates for the first time
  let done = false;
  const source = element.getAttribute("if");
  // previousElSibling should be resolved immediately before inserting element to DOM
  const previousElSibling = element.previousElementSibling;
  const parent = element.parentNode as HTMLElement;
  if (!parent) {
    cerr(new Error("Can't use @if attribute on orphaned element. Add it to a parent element first."));
    return;
  }
  const template = element.cloneNode(true);
  template.removeAttribute("if");
  parent.removeChild(element);

  let consequentElement;

  evalCollectObserve(
    createScript(source, config.context.cache),
    test => {
      if (test) {
        if (!consequentElement) {
          consequentElement = template.cloneNode(true);
          if (previousElSibling) {
            previousElSibling.insertAdjacentElement("afterend", consequentElement);
          } else {
            parent.prepend(consequentElement);
          }
          VanillinEvaluateElement(
            consequentElement,
            () => {
              if (!done) {
                done = true;
                c();
              }
            },
            cerr,
            environment,
            config
          );
        }
      } else {
        if (consequentElement) {
          // TODO: unbind()
          consequentElement.parentNode.removeChild(consequentElement);
          consequentElement = null;
        }
        if (!done) {
          done = true;
          c();
        }
      }
    },
    e => {
      console.error({ element, source, environment, ...e });
      cerr(e);
    },
    environment,
    config
  );
}

export function VanillinEvaluateChildren(
  { element }: { element: HTMLElement },
  c: Continuation,
  cerr: ErrorContinuation,
  environment: Environment,
  config: VanillinEvaluationConfig
) {
  if (element.children.length) {
    vanillinEval(
      Array.from(element.children).filter(child => child.nodeType === Node.ELEMENT_NODE) as HTMLElement[],
      c,
      cerr,
      environment,
      config
    );
  } else {
    c(element);
  }
}

export function VanillinCallcc({ element }, c, cerr, env, config: VanillinEvaluationConfig) {
  const receiverSource = element.getAttribute("callcc");
  element.removeAttribute("callcc");
  config.context.evaluate(
    createScript(receiverSource, config.context.cache),
    function(receiver) {
      if (element.hasAttribute("async")) {
        receiver(
          element,
          // if element has @async prop then upon returning to evaluation the only thing you care about
          // is rendering this element and its descendants. Don't care about further evaluation, i.e. of adjacent elements.
          () => VanillinEvaluateElement(element, console.log, console.error, env, config),
          cerr,
          env,
          config
        );
        // continue evaluation right away
        c(element);
      } else {
        // @async is not present. Stop everything and wait for receiver to resume.
        receiver(element, c, cerr);
      }
    },
    cerr,
    env,
    config
  );
}

export const VanillinInterpreters: Environment = {
  values: {
    VanillinCallcc,
    VanillinIf,
    VanillinFor,
    VanillinEvaluateChildren,
    VanillinEvaluateComponent,
    VanillinScriptElement,
    VanillinScriptAttribute,
    VanillinElementTextContent,
    VanillinElementAttributes
  },
  prev: ECMAScriptInterpreters
};
