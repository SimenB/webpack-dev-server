"use strict";

const { normalizeStderr, testBin } = require("../helpers/test-bin");
const port = require("../ports-map")["cli-port-option"];

describe('"port" CLI option', () => {
  it('should work using "--port <string>"', async () => {
    const { exitCode, stderr } = await testBin(["--port", port]);

    expect(exitCode).toBe(0);
    expect(normalizeStderr(stderr, { ipv6: true })).toMatchSnapshot("stderr");
  });

  it('should work using "--port auto"', async () => {
    const { exitCode, stderr } = await testBin(["--port", "auto"]);

    expect(exitCode).toBe(0);
    expect(normalizeStderr(stderr, { ipv6: true })).toMatchSnapshot("stderr");
  });
});
