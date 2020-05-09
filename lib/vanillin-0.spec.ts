import { expect } from "chai";
import { createScript, noop } from "metaes/metaes";
import { describe, it } from "mocha";
import { ObservableContext } from "./observable";
import { collectObservableVars, evalCollectObserve, ObservableResult, VanillinEvaluationConfig } from "./vanillin-0";
import { Environment } from "metaes/types";

describe.skip("Collecting observable variables", () => {
  it("should collect only observable variables", async () => {
    const global = { a: 1 };
    const ctx = new ObservableContext(global);
    const results: ObservableResult[] = [];

    const evaluate = (source, env?: Environment) => {
      results.length = 0;
      const listener = collectObservableVars((result) => results.push(result), env || ctx.environment);
      ctx.addListener(listener);
      ctx.evaluate(source, undefined, undefined, env);
      ctx.removeListener(listener);
    };

    evaluate("a;");
    expect(results.length).to.equal(1);

    evaluate("self.a");
    expect(results.length).to.equal(1);

    evaluate("(function(){var x; x;})()");
    expect(results.length).to.equal(0);

    evaluate("foo", { values: { foo: 1 }, prev: ctx.environment });
    expect(results.length).to.equal(1);

    evaluate("task.name", { values: { task: { name: "foo" } }, prev: ctx.environment });
    expect(results.length).to.equal(1);

    evaluate("self.a; a;", { values: { task: { name: "foo" } }, prev: ctx.environment });
    expect(results.length).to.equal(2);

    evaluate("self.a; a; var b; b;", { values: { task: { name: "foo" } }, prev: ctx.environment });
    expect(results.length).to.equal(3);
  });

  it("should create handlers for variables", () => {
    const global = { value: 1 };
    const ctx = new ObservableContext(global);
    const observables: ObservableResult[] = [];

    const listener = collectObservableVars((result) => observables.push(result), ctx.environment);
    ctx.addListener(listener);
    ctx.evaluate("value");
    ctx.removeListener(listener);

    evalCollectObserve(
      createScript("[self.value, value, self.value2]"),
      noop,
      console.log,
      ctx.environment,
      // enforce type knowing it's not complete value
      {
        context: ctx
      } as VanillinEvaluationConfig
    );

    const handlers = Array.from(ctx.handlers)
      // get only key
      .map(([k]) => k);

    expect(observables).to.deep.equal([{ object: global, property: "value" }]);
    expect(handlers).to.deep.equal([global]);
  });

  it("should trigger trap for observed variables in global space using both `self` and identifier", () => {
    const global = { value: 1 };
    const ctx = new ObservableContext(global);
    evalCollectObserve(
      createScript("value"),
      noop,
      console.log,
      ctx.environment, // enforce type knowing it's not complete value
      {
        context: ctx
      } as VanillinEvaluationConfig
    );
    const results: any[] = [];
    ctx.addHandler({
      target: global,
      traps: {
        didSet() {
          results.push([...arguments]);
        }
      }
    });
    ctx.evaluate("value=1", noop, console.log);
    expect(results.length).to.equal(1);

    results.length = 0;
    ctx.evaluate("self.value=1", noop, console.log);
    expect(results.length).to.equal(1);
  });

  it("should trigger trap for observed variables in global space using member expression", async () => {
    const global = { task: { name: "Task 1" } };
    const ctx = new ObservableContext(global);
    evalCollectObserve(
      createScript("task.name"),
      noop,
      console.log,
      ctx.environment, // enforce type knowing it's not complete value
      {
        context: ctx
      } as VanillinEvaluationConfig
    );
    expect(ctx.handlers.size).to.equal(1);
    const results: any[] = [];
    ctx.addHandler({
      target: Array.from(ctx.handlers.keys())[0],
      traps: {
        didSet() {
          results.push([...arguments]);
        }
      }
    });
    ctx.evaluate(`task.name='another name'`);
    expect(results).to.deep.equal([[global.task, "name", "another name"]]);
  });

  it("should trigger trap for observed variables in local space", () => {
    const global = { a: 1 };
    const ctx = new ObservableContext(global);

    const localEnv = { values: { localValue: 1 }, prev: ctx.environment };

    const results: any[] = [];
    const listener = collectObservableVars((result) => results.push(result), localEnv);
    ctx.addListener(listener);
    ctx.evaluate("a, localValue", noop, console.error, localEnv);
    ctx.removeListener(listener);

    expect(results.length).to.equal(2);
    expect(results).to.deep.equal([
      { object: global, property: "a" },
      { object: localEnv.values, property: "localValue" }
    ]);

    ctx.addHandler({
      target: localEnv.values,
      traps: {
        didSet() {
          results.push([...arguments]);
        }
      }
    });

    results.length = 0;
    ctx.evaluate("localValue=true", noop, console.error, localEnv);
    expect(results[0]).to.deep.equal([localEnv.values, "localValue", true]);
  });
});
