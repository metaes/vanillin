import { callcc } from "metaes/callcc";
import { GetValueSync } from "metaes/environment";
import { visitArray } from "metaes/evaluate";
import { createScript, parseFunction } from "metaes/metaes";
import { evaluateMetaFunction } from "metaes/metafunction";
import { ExpressionStatement, FunctionNode, Program } from "metaes/nodeTypes";
import { ParseError } from "metaes/parse";
import { Continuation, Environment, ErrorContinuation, MetaesFunction } from "metaes/types";
import { ObservableContext } from "../observable";
import { getTrampoliningScheduler } from "../scheduler";
import { bindDOM, bindEventHandlers, getTemplate, VanillinEvaluationConfig } from "../vanillin-0";
import { newEnvironmentFrom } from "../vanillinEnvironment";

type ComponentConstructorResult = {
  environment?: { [key: string]: any };
  onbind?: () => void;
  onunbind?: () => void;
};

// TODO: Environment shouldn't be a plain object?
export type ComponentConstructorArgs = [HTMLElement, (Node & ChildNode)[], Environment, VanillinEvaluationConfig];
export type ComponentConstructor = (...args: ComponentConstructorArgs) => void | ComponentConstructorResult;

export interface ComponentDefinition {
  name: string;
  constructor?: ComponentConstructor | ((...args: ComponentConstructorArgs) => Promise<ComponentConstructor>) | null;
  options: ComponentOptions;
}

export interface ComponentOptions {
  templateString?: string;
  templateUrl?: string;
  templateElement?: HTMLElement | NodeList;
  closure?: Environment;
  slotSelector?: string;
}

export const COMPONENT_ATTRIBUTE_NAME = "bind-component";

function toObject(prev, next: Attr) {
  prev[next.name] = next.value;
  return prev;
}

function evalMaybeExpression(source: string, c, cerr, closure: Environment, config: VanillinEvaluationConfig) {
  const { context } = config;
  const { cache } = context;

  // TODO: update cache also for failing script
  const evaluate = (wrapped = false, c, cerr) => {
    let script;
    try {
      script = wrapped ? createScript(`(${source})`, cache) : createScript(source, cache);
    } catch (e) {
      return cerr(e);
    }
    context.evaluate(script, c, cerr, closure);
  };

  // First try to parse script with parens around, it's an optimistic case as it's expected for user to pass expressions.
  // For example it's useful when whole script evaluates to object expression - it won't be treated as labeled statement.
  evaluate(true, c, e => {
    if (e.value instanceof ParseError) {
      withoutParens();
    } else {
      console.error({ source, closure, config, e });
      cerr(e);
    }
  });

  // If it didn't parse, means user could have provided a statement. Try to parse it without parens.
  function withoutParens() {
    evaluate(false, c, e => {
      console.error({ source, closure, config, e });
      cerr(e);
    });
  }
}

export function VanillinEvaluateComponent(
  { element },
  c: Continuation,
  cerr: ErrorContinuation,
  closureEnvironment: Environment,
  config: VanillinEvaluationConfig
) {
  // TODO: create new registry for new component
  const { interpreters, context } = config;

  const byAttribute = element.hasAttribute(COMPONENT_ATTRIBUTE_NAME);
  const componentName = byAttribute ? element.getAttribute(COMPONENT_ATTRIBUTE_NAME)! : element.nodeName.toLowerCase();
  const definition: ComponentDefinition = GetValueSync(componentName, interpreters);
  if (!definition) {
    cerr(new Error(`Can't find "${componentName}" component`));
    return;
  }
  const {
    options: { templateUrl, templateElement, templateString, slotSelector },
    constructor
  } = definition;

  // Convert children to array to keep DOM elements references alive
  const slottedElements = Array.from(element.children) as HTMLElement[];

  let usesTemplate = false;

  if (templateElement || templateString || templateUrl) {
    /**
     * Remove children arguments from DOM.
     * They should be attached by component in onbind method.
     * If no slotSelector is defined not components body doesn't append them,
     * DOM arguments won't be be attached.
     */
    element.innerHTML = "";
    usesTemplate = true;
  }

  const state: {
    /**
     * Children environment. Children are HTML elements passed in during component instantiation.
     * In worst case component DOM children have access only to component instance environment.
     * Attribute arguments shouldn't be available here.
     */
    childrenEnv: Environment;

    /**
     * Body environment. Body is a HTML contained in component's template.
     *
     * In worst case component body has no environment avialable or only values coming from arguments attribute.
     * Or if it has defined closure in options, it means component was produced from inline HTML. Use it as a base.
     * Values in arguments will override closure, just like in ECMAScript functions.
     */
    bodyEnv?: Environment;

    bodyDOM?: HTMLElement | NodeList | HTMLElement[] | Node[] | Node;

    // Maybe wait for constructor onbind method being assigned and run it at the end if avaiable.
    onbind?: () => void;
  } = { childrenEnv: closureEnvironment };

  function handleTemplate(template: undefined | typeof state.bodyDOM) {
    if (template) {
      let templateAttrs;
      if (template instanceof HTMLElement && template.nodeName.toLowerCase() === "function") {
        templateAttrs = template.attributes;
        template = template.childNodes;
      }
      // Immediately add template to component element
      if (template instanceof NodeList || Array.isArray(template)) {
        Array.from(template).forEach(child => element.appendChild(child));
      } else {
        element.appendChild(template);
      }
      state.bodyDOM = element.childNodes;
      return { templateAttrs, bodyDOM: element.childNodes };
    }
    return {};
  }

  function evalParamsAndArgs(templateAttributes: NamedNodeMap | null, c, cerr) {
    const declaredParams = Array.from(templateAttributes || [])
      .filter(attr => attr.name !== "name")
      .reduce(toObject, {});
    const providedArguments = Array.from(element.attributes)
      .filter((attr: Attr) => declaredParams.hasOwnProperty(attr.name))
      .reduce(toObject, {});

    visitArray(
      Object.keys(declaredParams),
      (key, c, cerr) =>
        evalMaybeExpression(
          providedArguments[key] || declaredParams[key],
          value => c({ name: key, value }),
          cerr,
          closureEnvironment,
          config
        ),
      namedArguments => {
        namedArguments = namedArguments.reduce(toObject, {});
        element.hasAttribute("arguments")
          ? evalMaybeExpression(
              element.getAttribute("arguments"),
              argumentsAttrObject => c({ argumentsAttrObject, namedArguments }),
              cerr,
              closureEnvironment,
              config
            )
          : c({ namedArguments });
      },
      cerr
    );
  }

  function onArguments({ argumentsAttrObject, namedArguments }, c, cerr) {
    state.bodyEnv = newEnvironmentFrom(
      {
        arguments: { ...argumentsAttrObject, ...namedArguments },
        ...namedArguments,
        slottedElements
      },
      definition.options.closure || { values: {} }
    );

    /**
     * inlineEnv shouldn't happen when closure is defined. It would mean that component was both
     * inline and defined in registry.
     */
    let inlineEnv;

    if (constructor) {
      if (!(context instanceof ObservableContext)) {
        throw new Error("Handle case when context is not observable");
      }
      const ctorArguments: ComponentConstructorArgs = [
        element,
        slottedElements,
        state.bodyEnv,
        // New registry environment for each component instance. It's like a function call.
        { ...config, ...{ interpreters: { values: {}, prev: config.interpreters } } }
      ];
      const constructorResult = constructor(...ctorArguments);

      function resultReady(constructorResult?) {
        if (constructorResult) {
          state.onbind = constructorResult.onbind;
          // TODO: this environment should can be both full environment or only 'values' field
          inlineEnv = constructorResult.environment;
        }
        if (inlineEnv) {
          state.bodyEnv = newEnvironmentFrom(argumentsAttrObject, { values: inlineEnv, prev: state.bodyEnv });
        }
        c(inlineEnv);
      }
      if (constructorResult) {
        if (constructorResult instanceof Promise) {
          constructorResult.then(ctor => resultReady(ctor(...ctorArguments))).catch(cerr);
        } else {
          resultReady(constructorResult);
        }
      } else {
        resultReady();
      }
    } else {
      c(inlineEnv);
    }
  }

  const getChildrenEnv = (inlineEnv: Environment, c, cerr) =>
    element.hasAttribute("closure")
      ? evalMaybeExpression(
          element.getAttribute("closure"),
          closureAttributeValue => {
            if (closureAttributeValue) {
              // closure of component body and component arguments are not included here,
              // only closure with values evaluated from `closure` attribute.
              state.childrenEnv = { values: closureAttributeValue, prev: closureEnvironment };
            }
            c();
          },
          cerr,
          {
            values: inlineEnv,
            prev: closureEnvironment
          },
          config
        )
      : c();

  /**
   * Loaded template has access only to component arguments and body values.
   * It represents concept of static reference biding.
   * It shouldn't see runtime surrounding values (a.k.a. dynamic binding).
   */
  const bindBodyDOM = (bodyDOM, c, cerr) => bindDOM(bodyDOM, c, cerr, state.bodyEnv, config);

  /**
   * Run component passed in children DOM arguments only with surrounding component closure
   * plus `closure` attribute evaluated value which extracts values from JavaScript part.
   * It mutates children environment in a controlled way.
   */
  const bindChildrenElements = (_, c, cerr) => bindDOM(slottedElements, c, cerr, state.childrenEnv, config);

  /**
   * body is just a JavaScript vanilla function, run it.
   * It's important to run it at the end, because body function
   * can attach children to template which will destroy execution order.
   * Don't await, it should be always synchronous code.
   */
  function onbindCall() {
    if (usesTemplate && slotSelector) {
      const slot = slotSelector ? element.querySelector(slotSelector) : element;
      if (slot) {
        slottedElements.forEach(child => slot.appendChild(child));
      } else {
        throw new Error("Can't find slot for children.");
      }
    }
    if (state.onbind) {
      state.onbind();
    }
    bindEventHandlers(element, closureEnvironment, config);
  }

  function runner(
    _await,
    handleTemplate,
    evalParamsAndArgs,
    onArguments,
    getChildrenEnv,
    bindBodyDOM,
    bindChildrenElements,
    onbindCall,
    options,
    getTemplate
  ) {
    const template = _await(getTemplate, options);
    const { templateAttrs, bodyDOM } = handleTemplate(template);
    const args = _await(evalParamsAndArgs, templateAttrs);
    const inlineEnv = _await(onArguments, args);
    _await(getChildrenEnv, inlineEnv);
    _await(bindBodyDOM, bodyDOM);
    _await(bindChildrenElements);
    onbindCall();
  }
  const runnerMetaesFunction: MetaesFunction = {
    e: ((parseFunction(runner, config.context.cache) as Program).body[0] as ExpressionStatement)
      .expression as FunctionNode,
    closure: closureEnvironment,
    config: { schedule: getTrampoliningScheduler(), ...config }
  };
  const args = [
    callcc,
    handleTemplate,
    evalParamsAndArgs,
    onArguments,
    getChildrenEnv,
    bindBodyDOM,
    bindChildrenElements,
    onbindCall,
    definition.options,
    getTemplate
  ];
  let finished = false;
  evaluateMetaFunction(
    runnerMetaesFunction,
    value => {
      if (!finished) {
        c(value);
        finished = true;
      }
    },
    cerr,
    undefined,
    args
  );

  if (element.hasAttribute("async")) {
    finished = true;
    c();
  }
}
