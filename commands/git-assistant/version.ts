import pkg from "./package.json" with { type: "json" };
import { parse } from "semver";

export const getVersion = () => {
  return {
    version: pkg.version,
    versionPart: parse(pkg.version),
  };
};
