import { Failure } from "./fault";
import type { Source } from "./io";
import { JsonError, parseJson } from "./jparse";
import type { JValue } from "./jvalue";

export function loadDocument(source: Source): JValue {
  try {
    return parseJson(source.text);
  } catch (error) {
    if (!(error instanceof JsonError)) {
      throw error;
    }
    if (error.reason === "deep") {
      throw new Failure(`${source.display}: nested too deeply`);
    }
    if (error.reason === "text") {
      throw new Failure(`${source.display}: invalid text`);
    }
    throw new Failure(`${source.display}: not valid JSON`);
  }
}
