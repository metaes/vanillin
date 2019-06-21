import { ObservableContext } from "./observable";
import { bindDOM } from "./vanillin-0";
import { load } from "./vanillin-loader";
import { defineComponent } from "./vanillinEnvironment";
import { getTrampoliningScheduler } from "./scheduler";

export const GetVanillinLib = () => ({
  bindDOM,
  ObservableContext,
  load,
  defineComponent,
  getTrampoliningScheduler
});
