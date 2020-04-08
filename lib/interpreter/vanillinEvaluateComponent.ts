import { liftedAll } from "metaes/callcc";
import { GetValue } from "metaes/environment";
import { visitArray } from "metaes/evaluate";
import { createScript, parseFunction } from "metaes/metaes";
import { evaluateMetaFunction } from "metaes/metafunction";
import { toException } from "metaes/exceptions";
import { ExpressionStatement, FunctionNode, Program } from "metaes/nodeTypes";
import { ParseError } from "metaes/parse";
import { Continuation, Environment, ErrorContinuation, MetaesFunction } from "metaes/types";
import { getTrampoliningScheduler } from "../scheduler";
import { bindDOM, bindEventHandlers, getTemplate, VanillinEvaluationConfig } from "../vanillin-0";
import { newEnvironmentFrom } from "../vanillinEnvironment";

type ComponentConstructorResult = {
  environment?: { [key: string]: any };
  onbind?: () => void;
  onunbind?: () => void;
};

export type ComponentConstructorArgs = [HTMLElement, (Node & ChildNode)[], Environment, VanillinEvaluationConfig];
export type ComponentConstructor = (...args: ComponentConstructorArgs) => void | ComponentConstructorResult;

export interface ComponentDefinition {
  name: string;
  options: ComponentOptions;
}

export type ComponentOptions = {
  ctor?: ComponentConstructor | ((...args: ComponentConstructorArgs) => Promise<ComponentConstructor>) | null;
  templateString?: string;
  templateUrl?: string;
  templateNode?: Node | NodeList;
  closure?: Environment;
  slotSelector?: string;
};

export const COMPONENT_ATTRIBUTE_NAME = "bind-component";

function evalAttributeScript(source: string, c, cerr, closure: Environment, config: VanillinEvaluationConfig) {
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
  evaluate(true, c, (e) => {
    if (e.value instanceof ParseError) {
      withoutParens();
    } else {
      console.error({ source, closure, config, e });
      cerr(e);
    }
  });

  // If it didn't parse, means user could have provided a statement. Try to parse it without parens.
  function withoutParens() {
    evaluate(false, c, (e) => {
      console.error({ source, closure, config, e });
      cerr(e);
    });
  }
}

function isComponentDefinition(value?: any): value is ComponentDefinition {
  return value?.name && value?.options;
}

let runnerAST: FunctionNode;

export function VanillinEvaluateComponent(
  { element },
  c: Continuation,
  cerr: ErrorContinuation,
  closureEnvironment: Environment,
  config: VanillinEvaluationConfig
) {
  const {
    window: { DocumentFragment, HTMLElement, NodeList }
  } = config;

  const bindComponentAttrValue = element.getAttribute(COMPONENT_ATTRIBUTE_NAME);

  if (bindComponentAttrValue) {
    GetValue(
      { name: bindComponentAttrValue },
      getComponentByName,
      () => evalAttributeScript(bindComponentAttrValue, getComponentByName, cerr, closureEnvironment, config),
      closureEnvironment,
      config
    );
  } else {
    getComponentByName(element.nodeName.toLowerCase());
  }

  function getComponentByName(value: string | any) {
    if (typeof value === "string") {
      GetValue(
        { name: value },
        (definition) =>
          definition ? onComponentFound(definition) : cerr(new Error(`Can't find "${value}" component`)),
        cerr,
        closureEnvironment
      );
    } else if (isComponentDefinition(value)) {
      onComponentFound(value);
    } else {
      cerr(toException(new Error(`${value} is not a valid component definition.`), value));
    }
  }

  function onComponentFound(definition: ComponentDefinition) {
    const {
      options: { templateUrl, templateNode, templateString, slotSelector, ctor }
    } = definition;

    // Convert children to array to keep DOM elements references alive
    const children = Array.from(element.children) as HTMLElement[];

    for (const element of children) {
      if (element.hasAttribute("name")) {
        children[element.getAttribute("name")] = element;
      }
    }

    let usesTemplate = false;

    if (templateNode || templateString || templateUrl) {
      /**
       * Remove children arguments from DOM.
       * They should be attached by component in onbind method.
       * If no slotSelector is defined not components body doesn't append them,
       * DOM arguments won't be be attached.
       */
      element.innerHTML = "";
      usesTemplate = true;
    }

    type State = {
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
    };
    const state: State = { childrenEnv: closureEnvironment };

    function templateToState(template: undefined | typeof state.bodyDOM) {
      if (template) {
        let templateAttrs;
        if (template instanceof DocumentFragment) {
          if (template.childNodes.length === 1) {
            return templateToState(template.childNodes[0]);
          } else {
            return templateToState(template.childNodes);
          }
        } else if (template instanceof HTMLElement && template.nodeName.toLowerCase() === "function") {
          templateAttrs = template.attributes;
          template = template.childNodes;
        }
        // Immediately add template to component element
        if (template instanceof NodeList || Array.isArray(template)) {
          Array.from(template).forEach((child) => element.appendChild(child));
        } else {
          element.appendChild(template);
        }
        state.bodyDOM = element.childNodes;
        return { templateAttrs, bodyDOM: element.childNodes };
      }
      return {};
    }

    function evalParamsAndArgs([templateAttributes]: [NamedNodeMap | null], c, cerr) {
      function assignAttrValue(prev, next: Attr) {
        prev[next.name] = next.value;
        return prev;
      }
      const declaredParams = Array.from(templateAttributes || [])
        .filter((attr) => attr.name !== "name")
        .reduce(assignAttrValue, {});
      const providedArguments = Array.from(element.attributes)
        .filter((attr: Attr) => declaredParams.hasOwnProperty(attr.name))
        .reduce(assignAttrValue, {});

      visitArray(
        Object.keys(declaredParams),
        (key, c, _cerr) =>
          evalAttributeScript(
            providedArguments[key] || declaredParams[key],
            (value) => c({ name: key, value }),
            // if default value is not provided - couldn't have been parsed - use undefined
            (_error) => c({ name: key }),
            closureEnvironment,
            config
          ),
        function (namedArguments) {
          namedArguments = namedArguments.reduce(assignAttrValue, {});
          element.hasAttribute("arguments")
            ? evalAttributeScript(
                element.getAttribute("arguments"),
                (argumentsAttrObject) => c({ argumentsAttrObject, namedArguments }),
                cerr,
                closureEnvironment,
                config
              )
            : c({ namedArguments });
        },
        cerr
      );
    }

    function getInlineEnvironment([{ argumentsAttrObject, namedArguments }], c, cerr) {
      state.bodyEnv = newEnvironmentFrom(
        {
          arguments: { ...argumentsAttrObject, ...namedArguments },
          ...namedArguments,
          children
        },
        definition.options.closure || { values: {} }
      );

      /**
       * inlineEnv shouldn't happen when closure is defined. It would mean that component was both
       * inline and defined in registry.
       */
      let inlineEnv;

      if (ctor) {
        const ctorArguments: ComponentConstructorArgs = [element, children, state.bodyEnv, config];
        const constructorResult = ctor(...ctorArguments);

        function resultReady(constructorResult?) {
          if (constructorResult) {
            state.onbind = constructorResult.onbind;
            // TODO: this environment should be able to be both full environment or only 'values' field
            inlineEnv = constructorResult.environment;
          }
          if (inlineEnv) {
            state.bodyEnv = newEnvironmentFrom(argumentsAttrObject, {
              values: inlineEnv,
              prev: state.bodyEnv
            });
          }
          c(inlineEnv);
        }

        if (constructorResult) {
          if (constructorResult instanceof Promise) {
            constructorResult.then((ctor) => resultReady(ctor(...ctorArguments))).catch(cerr);
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

    function inlineEnvironmentToState([inlineEnv]: [Environment], c, cerr) {
      if (element.hasAttribute("closure")) {
        evalAttributeScript(
          element.getAttribute("closure"),
          (closureAttributeValue) => {
            if (closureAttributeValue) {
              // closure of component body and component arguments are not included here,
              // only closure with values evaluated from `closure` attribute.
              state.childrenEnv = {
                values: closureAttributeValue,
                prev: closureEnvironment
              };
            }
            c();
          },
          cerr,
          {
            values: inlineEnv,
            prev: closureEnvironment
          },
          config
        );
      } else {
        c();
      }
    }

    /**
     * Loaded template has access only to component arguments and body values.
     * It represents concept of static reference biding.
     * It shouldn't see runtime surrounding values (a.k.a. dynamic binding).
     */
    function bindBodyDOM([bodyDOM], c, cerr) {
      return bindDOM(bodyDOM, c, cerr, state.bodyEnv, config);
    }

    /**
     * Run component passed in children DOM arguments only with surrounding component closure
     * plus `closure` attribute evaluated value which extracts values from JavaScript part.
     * It mutates children environment in a controlled way.
     */
    function bindChildrenElements(_, c, cerr) {
      function run() {
        // This environment is used to capture bindings happening in children passed in to component.
        // It's useful for capturing named <function name="" /> and passing it in to component body.
        const captureEnv: Environment = { values: {}, prev: state.childrenEnv };
        bindDOM(
          children,
          function (value) {
            state.bodyEnv = { values: captureEnv.values, prev: state.bodyEnv };
            c(value);
          },
          cerr,
          captureEnv,
          config
        );
      }
      if (usesTemplate && slotSelector) {
        const slot = slotSelector ? element.querySelector(slotSelector) : element;
        if (slot) {
          children.forEach((child) => slot.appendChild(child));
          run();
        } else {
          cerr(new Error("Can't find slot for children."));
        }
      } else {
        run();
      }
    }

    /**
     * body is just a JavaScript vanilla function, run it.
     * It's important to run it at the end, because body function
     * can attach children to template which will destroy execution order.
     * Don't await, it should be always synchronous code.
     */
    function callOnBind() {
      if (state.onbind) {
        state.onbind();
      }
      bindEventHandlers(element, closureEnvironment, config);
    }

    function runner(
      templateToState,
      callOnBind,
      options,
      evalParamsAndArgs,
      getInlineEnvironment,
      getTemplate,
      inlineEnvironmentToState,
      bindBodyDOM,
      bindChildrenElements
    ) {
      const { templateAttrs, bodyDOM } = templateToState(getTemplate(options));
      inlineEnvironmentToState(getInlineEnvironment(evalParamsAndArgs(templateAttrs)));
      bindChildrenElements();
      bindBodyDOM(bodyDOM);
      callOnBind();
    }
    const runner_MetaesFunction: MetaesFunction = {
      e:
        runnerAST ||
        (runnerAST = ((parseFunction(runner, config.context.cache) as Program).body[0] as ExpressionStatement)
          .expression as FunctionNode),
      closure: closureEnvironment,
      config: { ...config, schedule: getTrampoliningScheduler() }
    };

    let finished = false;
    evaluateMetaFunction(
      runner_MetaesFunction,
      (value) => {
        if (!finished) {
          c(value);
          finished = true;
        }
      },
      cerr,
      undefined,
      [templateToState, callOnBind, definition.options].concat(
        Object.values(
          liftedAll({
            evalParamsAndArgs,
            getInlineEnvironment,
            getTemplate,
            inlineEnvironmentToState,
            bindBodyDOM,
            bindChildrenElements
          })
        )
      )
    );

    if (element.hasAttribute("async")) {
      finished = true;
      c();
    }
  }
}
