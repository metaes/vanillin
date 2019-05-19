import { GetVanillinLib } from "./vanillin-lib";
window.vanillin = { ...window.vanillin, ...GetVanillinLib() };
