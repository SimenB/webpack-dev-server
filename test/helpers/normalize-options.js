"use strict";

/**
 * @param {import("https").ServerOptions} options server options
 * @returns {Record<string, string | string[] | boolean>} normalized server options
 */
function normalizeOptions(options) {
  const normalizedOptions = {};

  for (const propertyName in options) {
    let value = options[propertyName];

    if (Array.isArray(value)) {
      value = value.map((item) => {
        if (Buffer.isBuffer(item)) {
          return "<Buffer>";
        } else if (
          typeof item.pem !== "undefined" &&
          Buffer.isBuffer(item.pem)
        ) {
          item.pem = "<Buffer>";
        } else if (
          typeof item.buf !== "undefined" &&
          Buffer.isBuffer(item.buf)
        ) {
          item.buf = "<Buffer>";
        }

        return item;
      });
    } else if (Buffer.isBuffer(value)) {
      value = "<Buffer>";
    }

    normalizedOptions[propertyName] = value;
  }

  return normalizedOptions;
}

module.exports = normalizeOptions;
