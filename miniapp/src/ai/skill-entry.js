// The AI host starts an independent package without executing the main App.
import "../platform/runtime-compat.js";
import snapshot from "../data/bundled-runtime.js";
import { createAiCalculatorService } from "./calculator-service.js";

const service = createAiCalculatorService(snapshot);

export const searchRocoData = (params) => service.searchRocoData(params);
export const calculateRocoDamage = (params) => service.calculateRocoDamage(params);
