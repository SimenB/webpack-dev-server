/* global __resourceQuery, __webpack_hash__ */
/// <reference types="webpack/module" />
import webpackHotLog from "webpack/hot/log.js";
import stripAnsi from "./utils/stripAnsi.js";
import parseURL from "./utils/parseURL.js";
import socket from "./socket.js";
import { formatProblem, createOverlay } from "./overlay.js";
import { log, logEnabledFeatures, setLogLevel } from "./utils/log.js";
import sendMessage from "./utils/sendMessage.js";
import reloadApp from "./utils/reloadApp.js";
import createSocketURL from "./utils/createSocketURL.js";
import { isProgressSupported, defineProgressElement } from "./progress.js";

/**
 * @typedef {Object} OverlayOptions
 * @property {boolean | (error: Error) => boolean} [warnings]
 * @property {boolean | (error: Error) => boolean} [errors]
 * @property {boolean | (error: Error) => boolean} [runtimeErrors]
 * @property {string} [trustedTypesPolicyName]
 */

/**
 * @typedef {Object} Options
 * @property {boolean} hot
 * @property {boolean} liveReload
 * @property {boolean} progress
 * @property {boolean | OverlayOptions} overlay
 * @property {string} [logging]
 * @property {number} [reconnect]
 */

/**
 * @typedef {Object} Status
 * @property {boolean} isUnloading
 * @property {string} currentHash
 * @property {string} [previousHash]
 */

/**
 * @param {boolean | { warnings?: boolean | string; errors?: boolean | string; runtimeErrors?: boolean | string; }} overlayOptions
 */
const decodeOverlayOptions = (overlayOptions) => {
  if (typeof overlayOptions === "object") {
    ["warnings", "errors", "runtimeErrors"].forEach((property) => {
      if (typeof overlayOptions[property] === "string") {
        const overlayFilterFunctionString = decodeURIComponent(
          overlayOptions[property],
        );

        // eslint-disable-next-line no-new-func
        const overlayFilterFunction = new Function(
          "message",
          `var callback = ${overlayFilterFunctionString}
        return callback(message)`,
        );

        overlayOptions[property] = overlayFilterFunction;
      }
    });
  }
};

/**
 * @type {Status}
 */
const status = {
  isUnloading: false,
  // eslint-disable-next-line camelcase
  currentHash: __webpack_hash__,
};

/** @type {Options} */
const options = {
  hot: false,
  liveReload: false,
  progress: false,
  overlay: false,
};
const parsedResourceQuery = parseURL(__resourceQuery);

const enabledFeatures = {
  "Hot Module Replacement": false,
  "Live Reloading": false,
  Progress: false,
  Overlay: false,
};

if (parsedResourceQuery.hot === "true") {
  options.hot = true;
  enabledFeatures["Hot Module Replacement"] = true;
}

if (parsedResourceQuery["live-reload"] === "true") {
  options.liveReload = true;
  enabledFeatures["Live Reloading"] = true;
}

if (parsedResourceQuery.progress === "true") {
  options.progress = true;
  enabledFeatures.Progress = true;
}

if (parsedResourceQuery.overlay) {
  try {
    options.overlay = JSON.parse(parsedResourceQuery.overlay);
  } catch (e) {
    log.error("Error parsing overlay options from resource query:", e);
  }

  // Fill in default "true" params for partially-specified objects.
  if (typeof options.overlay === "object") {
    options.overlay = {
      errors: true,
      warnings: true,
      runtimeErrors: true,
      ...options.overlay,
    };

    decodeOverlayOptions(options.overlay);
  }
  enabledFeatures.Overlay = true;
}

if (parsedResourceQuery.logging) {
  options.logging = parsedResourceQuery.logging;
}

if (typeof parsedResourceQuery.reconnect !== "undefined") {
  options.reconnect = Number(parsedResourceQuery.reconnect);
}

/**
 * @param {string} level
 */
function setAllLogLevel(level) {
  // This is needed because the HMR logger operate separately from dev server logger
  webpackHotLog.setLogLevel(
    level === "verbose" || level === "log" ? "info" : level,
  );
  setLogLevel(level);
}

if (options.logging) {
  setAllLogLevel(options.logging);
}

logEnabledFeatures(enabledFeatures);

self.addEventListener("beforeunload", () => {
  status.isUnloading = true;
});

const overlay =
  typeof window !== "undefined"
    ? createOverlay(
        typeof options.overlay === "object"
          ? {
              trustedTypesPolicyName: options.overlay.trustedTypesPolicyName,
              catchRuntimeError: options.overlay.runtimeErrors,
            }
          : {
              trustedTypesPolicyName: false,
              catchRuntimeError: options.overlay,
            },
      )
    : { send: () => {} };

const onSocketMessage = {
  hot() {
    if (parsedResourceQuery.hot === "false") {
      return;
    }

    options.hot = true;
  },
  liveReload() {
    if (parsedResourceQuery["live-reload"] === "false") {
      return;
    }

    options.liveReload = true;
  },
  invalid() {
    log.info("App updated. Recompiling...");

    // Fixes #1042. overlay doesn't clear if errors are fixed but warnings remain.
    if (options.overlay) {
      overlay.send({ type: "DISMISS" });
    }

    sendMessage("Invalid");
  },
  /**
   * @param {string} hash
   */
  hash(hash) {
    status.previousHash = status.currentHash;
    status.currentHash = hash;
  },
  logging: setAllLogLevel,
  /**
   * @param {boolean} value
   */
  overlay(value) {
    if (typeof document === "undefined") {
      return;
    }

    options.overlay = value;
    decodeOverlayOptions(options.overlay);
  },
  /**
   * @param {number} value
   */
  reconnect(value) {
    if (parsedResourceQuery.reconnect === "false") {
      return;
    }

    options.reconnect = value;
  },
  /**
   * @param {boolean} value
   */
  progress(value) {
    options.progress = value;
  },
  /**
   * @param {{ pluginName?: string, percent: number, msg: string }} data
   */
  "progress-update": function progressUpdate(data) {
    if (options.progress) {
      log.info(
        `${data.pluginName ? `[${data.pluginName}] ` : ""}${data.percent}% - ${
          data.msg
        }.`,
      );
    }

    if (isProgressSupported()) {
      if (typeof options.progress === "string") {
        let progress = document.querySelector("wds-progress");
        if (!progress) {
          defineProgressElement();
          progress = document.createElement("wds-progress");
          document.body.appendChild(progress);
        }
        progress.setAttribute("progress", data.percent);
        progress.setAttribute("type", options.progress);
      }
    }

    sendMessage("Progress", data);
  },
  "still-ok": function stillOk() {
    log.info("Nothing changed.");

    if (options.overlay) {
      overlay.send({ type: "DISMISS" });
    }

    sendMessage("StillOk");
  },
  ok() {
    sendMessage("Ok");

    if (options.overlay) {
      overlay.send({ type: "DISMISS" });
    }

    reloadApp(options, status);
  },
  /**
   * @param {string} file
   */
  "static-changed": function staticChanged(file) {
    log.info(
      `${
        file ? `"${file}"` : "Content"
      } from static directory was changed. Reloading...`,
    );

    self.location.reload();
  },
  /**
   * @param {Error[]} warnings
   * @param {any} params
   */
  warnings(warnings, params) {
    log.warn("Warnings while compiling.");

    const printableWarnings = warnings.map((error) => {
      const { header, body } = formatProblem("warning", error);

      return `${header}\n${stripAnsi(body)}`;
    });

    sendMessage("Warnings", printableWarnings);

    for (let i = 0; i < printableWarnings.length; i++) {
      log.warn(printableWarnings[i]);
    }

    const overlayWarningsSetting =
      typeof options.overlay === "boolean"
        ? options.overlay
        : options.overlay && options.overlay.warnings;

    if (overlayWarningsSetting) {
      const warningsToDisplay =
        typeof overlayWarningsSetting === "function"
          ? warnings.filter(overlayWarningsSetting)
          : warnings;

      if (warningsToDisplay.length) {
        overlay.send({
          type: "BUILD_ERROR",
          level: "warning",
          messages: warnings,
        });
      }
    }

    if (params && params.preventReloading) {
      return;
    }

    reloadApp(options, status);
  },
  /**
   * @param {Error[]} errors
   */
  errors(errors) {
    log.error("Errors while compiling. Reload prevented.");

    const printableErrors = errors.map((error) => {
      const { header, body } = formatProblem("error", error);

      return `${header}\n${stripAnsi(body)}`;
    });

    sendMessage("Errors", printableErrors);

    for (let i = 0; i < printableErrors.length; i++) {
      log.error(printableErrors[i]);
    }

    const overlayErrorsSettings =
      typeof options.overlay === "boolean"
        ? options.overlay
        : options.overlay && options.overlay.errors;

    if (overlayErrorsSettings) {
      const errorsToDisplay =
        typeof overlayErrorsSettings === "function"
          ? errors.filter(overlayErrorsSettings)
          : errors;

      if (errorsToDisplay.length) {
        overlay.send({
          type: "BUILD_ERROR",
          level: "error",
          messages: errors,
        });
      }
    }
  },
  /**
   * @param {Error} error
   */
  error(error) {
    log.error(error);
  },
  close() {
    log.info("Disconnected!");

    if (options.overlay) {
      overlay.send({ type: "DISMISS" });
    }

    sendMessage("Close");
  },
};

const socketURL = createSocketURL(parsedResourceQuery);

socket(socketURL, onSocketMessage, options.reconnect);
