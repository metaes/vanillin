import { uncps } from "metaes";
import { SetValue } from "metaes/environment";
import { Environment } from "metaes/types";
import { ComponentOptions } from "./interpreter/vanillinEvaluateComponent";

export function newEnvironmentFrom(values: any, prev: Environment): Environment {
  return values ? { values, prev } : prev;
}

export const defineComponent = (environment: Environment, name: string, options: ComponentOptions = {}) =>
  uncps(SetValue)({ name, value: { name, options }, isDeclaration: true }, environment);
