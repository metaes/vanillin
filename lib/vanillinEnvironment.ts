import { SetValue } from "metaes/environment";
import { Environment } from "metaes/types";
import { ComponentConstructor, ComponentOptions } from "./interpreter/vanillinEvaluateComponent";

export function setValueSync(env: Environment, name: string, value: any, isDeclaration: boolean) {
  let result, error;
  SetValue({ name, value, isDeclaration }, c => (result = c), e => (error = e), env);
  if (error) {
    throw error;
  }
  return result;
}

export function newEnvironmentFrom(values: any, prev: Environment): Environment {
  return values ? { values, prev } : prev;
}

export function defineComponent(
  environment: Environment,
  name: string,
  constructor?: Promise<ComponentConstructor> | ComponentConstructor | null,
  options: ComponentOptions = {}
) {
  setValueSync(environment, name, { name, constructor, options }, true);
}
