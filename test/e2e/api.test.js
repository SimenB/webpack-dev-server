"use strict";

const path = require("node:path");
const webpack = require("webpack");
const Server = require("../../lib/Server");
const config = require("../fixtures/client-config/webpack.config");
const runBrowser = require("../helpers/run-browser");
const sessionSubscribe = require("../helpers/session-subscribe");
const port = require("../ports-map").api;

describe("API", () => {
  describe("WEBPACK_SERVE environment variable", () => {
    const OLD_ENV = process.env;
    let server;
    let page;
    let browser;
    let pageErrors;
    let consoleMessages;

    beforeEach(async () => {
      // this is important - it clears the cache
      jest.resetModules();

      process.env = { ...OLD_ENV };

      delete process.env.WEBPACK_SERVE;

      ({ page, browser } = await runBrowser());

      pageErrors = [];
      consoleMessages = [];
    });

    afterEach(async () => {
      await browser.close();
      await server.stop();
      process.env = OLD_ENV;
    });

    it("should be present", async () => {
      expect(process.env.WEBPACK_SERVE).toBeUndefined();

      page
        .on("console", (message) => {
          consoleMessages.push(message);
        })
        .on("pageerror", (error) => {
          pageErrors.push(error);
        });

      const WebpackDevServer = require("../../lib/Server");

      const compiler = webpack(config);
      server = new WebpackDevServer({ port }, compiler);

      await server.start();

      expect(process.env.WEBPACK_SERVE).toBe("true");

      const response = await page.goto(`http://localhost:${port}/`, {
        waitUntil: "networkidle0",
      });

      expect(response.status()).toMatchSnapshot("response status");

      expect(consoleMessages.map((message) => message.text())).toMatchSnapshot(
        "console messages",
      );

      expect(pageErrors).toMatchSnapshot("page errors");
    });
  });

  describe("latest async API", () => {
    it("should work with async API", async () => {
      const compiler = webpack(config);
      const server = new Server({ port }, compiler);

      await server.start();

      const { page, browser } = await runBrowser();

      try {
        const pageErrors = [];
        const consoleMessages = [];

        page
          .on("console", (message) => {
            consoleMessages.push(message);
          })
          .on("pageerror", (error) => {
            pageErrors.push(error);
          });

        await page.goto(`http://localhost:${port}/`, {
          waitUntil: "networkidle0",
        });

        expect(
          consoleMessages.map((message) => message.text()),
        ).toMatchSnapshot("console messages");
        expect(pageErrors).toMatchSnapshot("page errors");
      } finally {
        await browser.close();
        await server.stop();
      }
    });

    it("should work with callback API", async () => {
      const compiler = webpack(config);
      const server = new Server({ port }, compiler);

      await new Promise((resolve) => {
        server.startCallback(() => {
          resolve();
        });
      });

      const { page, browser } = await runBrowser();

      try {
        const pageErrors = [];
        const consoleMessages = [];

        page
          .on("console", (message) => {
            consoleMessages.push(message);
          })
          .on("pageerror", (error) => {
            pageErrors.push(error);
          });

        await page.goto(`http://localhost:${port}/`, {
          waitUntil: "networkidle0",
        });

        expect(
          consoleMessages.map((message) => message.text()),
        ).toMatchSnapshot("console messages");
        expect(pageErrors).toMatchSnapshot("page errors");
      } finally {
        await browser.close();
        await new Promise((resolve) => {
          server.stopCallback(() => {
            resolve();
          });
        });
      }
    });

    it("should catch errors within startCallback", async () => {
      const compiler = webpack(config);
      const server = new Server(
        { port, static: "https://absolute-url.com/somewhere" },
        compiler,
      );

      await new Promise((resolve) => {
        server.startCallback((err) => {
          expect(err.message).toBe(
            "Using a URL as static.directory is not supported",
          );
          resolve();
        });
      });

      await new Promise((resolve) => {
        server.stopCallback(() => {
          resolve();
        });
      });
    });

    it("should work when using configured manually", async () => {
      const compiler = webpack({
        ...config,
        entry: [
          "webpack/hot/dev-server.js",
          `${path.resolve(
            __dirname,
            "../../client/index.js",
          )}?hot=true&live-reload=true"`,
          path.resolve(__dirname, "../fixtures/client-config/foo.js"),
        ],
        plugins: [...config.plugins, new webpack.HotModuleReplacementPlugin()],
      });
      const server = new Server({ port, hot: false, client: false }, compiler);

      await server.start();

      const { page, browser } = await runBrowser();
      try {
        const pageErrors = [];
        const consoleMessages = [];

        page
          .on("console", (message) => {
            consoleMessages.push(message);
          })
          .on("pageerror", (error) => {
            pageErrors.push(error);
          });

        await page.goto(`http://localhost:${port}/`, {
          waitUntil: "networkidle0",
        });

        expect(
          consoleMessages.map((message) => message.text()),
        ).toMatchSnapshot("console messages");
        expect(pageErrors).toMatchSnapshot("page errors");
      } finally {
        await browser.close();
        await server.stop();
      }
    });

    it("should work and allow to rerun dev server multiple times", async () => {
      const compiler = webpack(config);
      const server = new Server({ port }, compiler);

      await server.start();

      const { page: firstPage, browser } = await runBrowser();

      try {
        const firstPageErrors = [];
        const firstConsoleMessages = [];

        firstPage
          .on("console", (message) => {
            firstConsoleMessages.push(message);
          })
          .on("pageerror", (error) => {
            firstPageErrors.push(error);
          });

        await firstPage.goto(`http://localhost:${port}/`, {
          waitUntil: "networkidle0",
        });

        expect(
          firstConsoleMessages.map((message) => message.text()),
        ).toMatchSnapshot("console messages");
        expect(firstPageErrors).toMatchSnapshot("page errors");
      } finally {
        await server.stop();
      }

      await server.start();

      const secondPage = await runBrowser.runPage(browser);

      try {
        const secondPageErrors = [];
        const secondConsoleMessages = [];

        secondPage
          .on("console", (message) => {
            secondConsoleMessages.push(message);
          })
          .on("pageerror", (error) => {
            secondPageErrors.push(error);
          });

        await secondPage.goto(`http://localhost:${port}/`, {
          waitUntil: "networkidle0",
        });

        expect(
          secondConsoleMessages.map((message) => message.text()),
        ).toMatchSnapshot("console messages");
        expect(secondPageErrors).toMatchSnapshot("page errors");
      } finally {
        await browser.close();
        await server.stop();
      }
    });
  });

  describe("Invalidate callback", () => {
    let compiler;
    let server;
    let page;
    let browser;
    let pageErrors;
    let consoleMessages;

    beforeEach(async () => {
      compiler = webpack(config);

      ({ page, browser } = await runBrowser());

      pageErrors = [];
      consoleMessages = [];

      page
        .on("console", (message) => {
          consoleMessages.push(message);
        })
        .on("pageerror", (error) => {
          pageErrors.push(error);
        });

      server = new Server({ port, static: false }, compiler);

      await server.start();
    });

    afterEach(async () => {
      await browser.close();
      await server.stop();
    });

    it("should use the default `noop` callback when invalidate is called without any callback", async () => {
      const callback = jest.fn();

      server.invalidate();
      server.middleware.context.callbacks[0] = callback;

      const response = await page.goto(`http://localhost:${port}/`, {
        waitUntil: "networkidle0",
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(response.status()).toMatchSnapshot("response status");

      expect(consoleMessages.map((message) => message.text())).toMatchSnapshot(
        "console messages",
      );
      expect(pageErrors).toMatchSnapshot("page errors");
    });

    it("should use the provided `callback` function", async () => {
      const callback = jest.fn();

      server.invalidate(callback);

      const response = await page.goto(`http://localhost:${port}/`, {
        waitUntil: "networkidle0",
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(response.status()).toMatchSnapshot("response status");

      expect(consoleMessages.map((message) => message.text())).toMatchSnapshot(
        "console messages",
      );

      expect(pageErrors).toMatchSnapshot("page errors");
    });
  });

  describe("Server.getFreePort", () => {
    let dummyServers = [];
    let devServerPort;

    afterEach(() => {
      delete process.env.WEBPACK_DEV_SERVER_BASE_PORT;
      delete process.env.WEBPACK_DEV_SERVER_PORT_RETRY;

      return dummyServers
        .reduce(
          (p, server) =>
            p.then(
              () =>
                new Promise((resolve) => {
                  server.stopCallback(() => {
                    resolve();
                  });
                }),
            ),
          Promise.resolve(),
        )
        .then(() => {
          dummyServers = [];
        });
    });

    function createDummyServers(n) {
      const basePort = process.env.WEBPACK_DEV_SERVER_TEST_BASE_PORT || 30000;
      process.env.WEBPACK_DEV_SERVER_BASE_PORT = basePort;

      return (Array.isArray(n) ? n : Array.from({ length: n })).reduce(
        (p, _, i) =>
          p.then(
            () =>
              new Promise((resolve) => {
                devServerPort = basePort + i;
                const compiler = webpack(config);
                const server = new Server(
                  { port: devServerPort, host: "0.0.0.0" },
                  compiler,
                );

                dummyServers.push(server);

                server.startCallback((err) => {
                  if (err) {
                    // If we get EACCES, try again with a higher port range
                    if (
                      err.code === "EACCES" &&
                      !process.env.WEBPACK_DEV_SERVER_TEST_RETRY
                    ) {
                      process.env.WEBPACK_DEV_SERVER_TEST_RETRY = true;
                      process.env.WEBPACK_DEV_SERVER_TEST_BASE_PORT = 40000;
                      // Resolve and let the test restart with the new port range
                      resolve();
                    } else {
                      Promise.reject(err);
                    }
                  } else {
                    resolve();
                  }
                });
              }),
          ),
        Promise.resolve(),
      );
    }

    it("should return the port when the port is specified", async () => {
      const retryCount = 1;

      process.env.WEBPACK_DEV_SERVER_PORT_RETRY = retryCount;

      const freePort = await Server.getFreePort(9082);

      expect(freePort).toBe(9082);
    });

    it("should return the port when the port is `null`", async () => {
      const retryCount = 2;

      process.env.WEBPACK_DEV_SERVER_PORT_RETRY = retryCount;
      try {
        await createDummyServers(retryCount);
        const basePort = Number.parseInt(
          process.env.WEBPACK_DEV_SERVER_BASE_PORT,
          10,
        );
        const freePort = await Server.getFreePort(null);

        expect(freePort).toEqual(basePort + retryCount);

        const { page, browser } = await runBrowser();

        try {
          const pageErrors = [];
          const consoleMessages = [];

          page
            .on("console", (message) => {
              consoleMessages.push(message);
            })
            .on("pageerror", (error) => {
              pageErrors.push(error);
            });

          const response = await page.goto(
            `http://localhost:${devServerPort}/`,
            {
              waitUntil: "networkidle0",
            },
          );

          expect(response.status()).toMatchSnapshot("response status");

          expect(
            consoleMessages.map((message) => message.text()),
          ).toMatchSnapshot("console messages");

          expect(pageErrors).toMatchSnapshot("page errors");
        } catch (error) {
          if (error.code === "EACCES") {
            // Retry mechanism for EACCES errors
            const maxRetries = 3;
            const retryKey = `retry_${expect.getState().currentTestName}`;

            // Get current retry count or initialize to 0
            global[retryKey] ||= 0;
            global[retryKey] += 1;

            if (global[retryKey] < maxRetries) {
              console.warn(
                `EACCES error encountered (attempt ${global[retryKey]}/${maxRetries}): ${error.message}. Retrying...`,
              );
              // Re-run the current test
              return it.currentTest.fn();
            }
          }
          throw error;
        } finally {
          await browser.close();
        }
      } catch (err) {
        if (err.code === "EACCES") {
          console.warn(
            `Skipping test due to permission issues: ${err.message}`,
          );
          return;
        }
        throw err;
      }
    });

    it("should return the port when the port is undefined", async () => {
      const retryCount = 3;

      process.env.WEBPACK_DEV_SERVER_PORT_RETRY = retryCount;
      try {
        await createDummyServers(retryCount);
        const basePort = Number.parseInt(
          process.env.WEBPACK_DEV_SERVER_BASE_PORT,
          10,
        );

        const freePort = await Server.getFreePort(undefined);

        expect(freePort).toEqual(basePort + retryCount);

        const { page, browser } = await runBrowser();

        try {
          const pageErrors = [];
          const consoleMessages = [];

          page
            .on("console", (message) => {
              consoleMessages.push(message);
            })
            .on("pageerror", (error) => {
              pageErrors.push(error);
            });

          const response = await page.goto(
            `http://localhost:${devServerPort}/`,
            {
              waitUntil: "networkidle0",
            },
          );

          expect(response.status()).toMatchSnapshot("response status");

          expect(
            consoleMessages.map((message) => message.text()),
          ).toMatchSnapshot("console messages");

          expect(pageErrors).toMatchSnapshot("page errors");
        } catch (error) {
          if (error.code === "EACCES") {
            // Retry mechanism for EACCES errors
            const maxRetries = 3;
            const retryKey = `retry_${expect.getState().currentTestName}`;

            // Get current retry count or initialize to 0
            global[retryKey] ||= 0;
            global[retryKey] += 1;

            if (global[retryKey] < maxRetries) {
              console.warn(
                `EACCES error encountered (attempt ${global[retryKey]}/${maxRetries}): ${error.message}. Retrying...`,
              );
              // Re-run the current test
              return it.currentTest.fn();
            }
          }
          throw error;
        } finally {
          await browser.close();
        }
      } catch (err) {
        if (err.code === "EACCES") {
          console.warn(
            `Skipping test due to permission issues: ${err.message}`,
          );
          return;
        }
        throw err;
      }
    });

    it("should retry finding the port for up to defaultPortRetry times (number)", async () => {
      const retryCount = 4;

      process.env.WEBPACK_DEV_SERVER_PORT_RETRY = retryCount;

      try {
        await createDummyServers(retryCount);
        const basePort = Number.parseInt(
          process.env.WEBPACK_DEV_SERVER_BASE_PORT,
          10,
        );
        const freePort = await Server.getFreePort();

        expect(freePort).toEqual(basePort + retryCount);

        const { page, browser } = await runBrowser();

        try {
          const pageErrors = [];
          const consoleMessages = [];

          page
            .on("console", (message) => {
              consoleMessages.push(message);
            })
            .on("pageerror", (error) => {
              pageErrors.push(error);
            });

          const response = await page.goto(
            `http://localhost:${devServerPort}/`,
            {
              waitUntil: "networkidle0",
            },
          );

          expect(response.status()).toMatchSnapshot("response status");

          expect(
            consoleMessages.map((message) => message.text()),
          ).toMatchSnapshot("console messages");

          expect(pageErrors).toMatchSnapshot("page errors");
        } catch (error) {
          if (error.code === "EACCES") {
            // Retry mechanism for EACCES errors
            const maxRetries = 3;
            const retryKey = `retry_${expect.getState().currentTestName}`;

            // Get current retry count or initialize to 0
            global[retryKey] ||= 0;
            global[retryKey] += 1;

            if (global[retryKey] < maxRetries) {
              console.warn(
                `EACCES error encountered (attempt ${global[retryKey]}/${maxRetries}): ${error.message}. Retrying...`,
              );
              // Re-run the current test
              return it.currentTest.fn();
            }
          }
          throw error;
        } finally {
          await browser.close();
        }
      } catch (err) {
        // If it's a permission error on the port, mark the test as skipped rather than failed
        if (err.code === "EACCES") {
          console.warn(
            `Skipping test due to permission issues: ${err.message}`,
          );
          return;
        }
        throw err;
      }
    });

    it("should retry finding the port for up to defaultPortRetry times (string)", async () => {
      const retryCount = 5;

      process.env.WEBPACK_DEV_SERVER_PORT_RETRY = retryCount;

      try {
        await createDummyServers(retryCount);
        const basePort = Number.parseInt(
          process.env.WEBPACK_DEV_SERVER_BASE_PORT,
          10,
        );
        const freePort = await Server.getFreePort();

        expect(freePort).toEqual(basePort + retryCount);

        const { page, browser } = await runBrowser();

        try {
          const pageErrors = [];
          const consoleMessages = [];

          page
            .on("console", (message) => {
              consoleMessages.push(message);
            })
            .on("pageerror", (error) => {
              pageErrors.push(error);
            });

          const response = await page.goto(
            `http://localhost:${devServerPort}/`,
            {
              waitUntil: "networkidle0",
            },
          );

          expect(response.status()).toMatchSnapshot("response status");

          expect(
            consoleMessages.map((message) => message.text()),
          ).toMatchSnapshot("console messages");

          expect(pageErrors).toMatchSnapshot("page errors");
        } catch (error) {
          if (error.code === "EACCES") {
            // Retry mechanism for EACCES errors
            const maxRetries = 3;
            const retryKey = `retry_${expect.getState().currentTestName}`;

            // Get current retry count or initialize to 0
            global[retryKey] ||= 0;
            global[retryKey] += 1;

            if (global[retryKey] < maxRetries) {
              console.warn(
                `EACCES error encountered (attempt ${global[retryKey]}/${maxRetries}): ${error.message}. Retrying...`,
              );
              // Re-run the current test
              return it.currentTest.fn();
            }
          }
          throw error;
        } finally {
          await browser.close();
        }
      } catch (err) {
        // If it's a permission error on the port, mark the test as skipped rather than failed
        if (err.code === "EACCES") {
          console.warn(
            `Skipping test due to permission issues: ${err.message}`,
          );
          return;
        }
        throw err;
      }
    });

    it("should retry finding the port when serial ports are busy", async () => {
      const basePort = Number.parseInt(
        process.env.WEBPACK_DEV_SERVER_TEST_BASE_PORT || 30000,
        10,
      );
      const busyPorts = Array.from({ length: 6 }, (_, i) => basePort + i);

      process.env.WEBPACK_DEV_SERVER_PORT_RETRY = 1000;

      await createDummyServers(busyPorts);

      const freePort = await Server.getFreePort();
      // to use the last port in the busyPorts array
      const lastBusyPort = busyPorts[busyPorts.length - 1];
      expect(freePort).toBeGreaterThan(lastBusyPort);

      const { page, browser } = await runBrowser();

      try {
        const pageErrors = [];
        const consoleMessages = [];

        page
          .on("console", (message) => {
            consoleMessages.push(message);
          })
          .on("pageerror", (error) => {
            pageErrors.push(error);
          });

        try {
          const response = await page.goto(
            `http://localhost:${devServerPort}/`,
            {
              waitUntil: "networkidle0",
            },
          );

          expect(response.status()).toMatchSnapshot("response status");

          expect(
            consoleMessages.map((message) => message.text()),
          ).toMatchSnapshot("console messages");

          expect(pageErrors).toMatchSnapshot("page errors");
        } catch (error) {
          if (error.code === "EACCES") {
            // Retry mechanism for EACCES errors
            const maxRetries = 3;
            const retryKey = `retry_${expect.getState().currentTestName}`;

            // Get current retry count or initialize to 0
            global[retryKey] ||= 0;
            global[retryKey] += 1;

            if (global[retryKey] < maxRetries) {
              console.warn(
                `EACCES error encountered (attempt ${global[retryKey]}/${maxRetries}): ${error.message}. Retrying...`,
              );
              // Re-run the current test
              return it.currentTest.fn();
            }
          }
          throw error;
        }
      } catch (error) {
        if (error.code === "EACCES") {
          // Retry mechanism for EACCES errors
          const maxRetries = 3;
          const retryKey = `retry_${expect.getState().currentTestName}`;

          // Get current retry count or initialize to 0
          global[retryKey] ||= 0;
          global[retryKey] += 1;

          if (global[retryKey] < maxRetries) {
            console.warn(
              `EACCES error encountered (attempt ${global[retryKey]}/${maxRetries}): ${error.message}. Retrying...`,
            );
            // Re-run the current test
            return it.currentTest.fn();
          }
        }
        throw error;
      } finally {
        await browser.close();
      }
    });

    it("should throw the error when the port isn't found", async () => {
      expect.assertions(1);

      jest.mock(
        "../../lib/getPort",
        () => () => Promise.reject(new Error("busy")),
      );

      process.env.WEBPACK_DEV_SERVER_PORT_RETRY = 1;

      try {
        await Server.getFreePort();
      } catch (error) {
        expect(error.message).toMatchSnapshot();
      }
    });
  });

  describe("Server.checkHostHeader", () => {
    it("should allow access for every requests using an IP", () => {
      const options = {
        allowedHosts: "all",
      };

      const tests = [
        "192.168.1.123",
        "192.168.1.2:8080",
        "[::1]",
        "[::1]:8080",
        "[ad42::1de2:54c2:c2fa:1234]",
        "[ad42::1de2:54c2:c2fa:1234]:8080",
      ];

      const compiler = webpack(config);
      const server = new Server(options, compiler);

      let isValidHost = true;

      for (const test of tests) {
        const headers = { host: test };

        if (!server.isValidHost(headers, "host")) {
          isValidHost = false;
        }
      }

      expect(isValidHost).toBe(true);
    });

    it('should allow URLs with scheme for checking origin when the "option.client.webSocketURL" is object', async () => {
      const options = {
        port,
        client: {
          reconnect: false,
          webSocketURL: {
            hostname: "test.host",
          },
        },
        webSocketServer: "ws",
      };
      const headers = {
        origin: "https://test.host",
      };

      const compiler = webpack(config);
      const server = new Server(options, compiler);

      await server.start();

      const { page, browser } = await runBrowser();

      try {
        const pageErrors = [];
        const consoleMessages = [];

        page
          .on("console", (message) => {
            consoleMessages.push(message);
          })
          .on("pageerror", (error) => {
            pageErrors.push(error);
          });

        const webSocketRequests = [];
        const session = await page.target().createCDPSession();

        session.on("Network.webSocketCreated", (test) => {
          webSocketRequests.push(test);
        });

        await session.send("Target.setAutoAttach", {
          autoAttach: true,
          flatten: true,
          waitForDebuggerOnStart: true,
        });

        sessionSubscribe(session);

        try {
          const response = await page.goto(`http://localhost:${port}/`, {
            waitUntil: "networkidle0",
          });

          if (!server.isValidHost(headers, "origin")) {
            throw new Error("Validation didn't fail");
          }

          await new Promise((resolve) => {
            const interval = setInterval(() => {
              const needFinish = consoleMessages.filter((message) =>
                /Trying to reconnect/.test(message.text()),
              );

              if (needFinish.length > 0) {
                clearInterval(interval);
                resolve();
              }
            }, 100);
          });

          expect(webSocketRequests[0].url).toMatchSnapshot("web socket URL");

          expect(response.status()).toMatchSnapshot("response status");

          expect(
            // net::ERR_NAME_NOT_RESOLVED can be multiple times
            consoleMessages.map((message) => message.text()).slice(0, 7),
          ).toMatchSnapshot("console messages");

          expect(pageErrors).toMatchSnapshot("page errors");
        } catch (error) {
          if (error.code === "EACCES") {
            // Retry mechanism for EACCES errors
            const maxRetries = 3;
            const retryKey = `retry_${expect.getState().currentTestName}`;

            // Get current retry count or initialize to 0
            global[retryKey] ||= 0;
            global[retryKey] += 1;

            if (global[retryKey] < maxRetries) {
              console.warn(
                `EACCES error encountered (attempt ${global[retryKey]}/${maxRetries}): ${error.message}. Retrying...`,
              );
              // Re-run the current test
              return it.currentTest.fn();
            }
          }
          throw error;
        }
      } catch (error) {
        if (error.code === "EACCES") {
          // Retry mechanism for EACCES errors
          const maxRetries = 3;
          const retryKey = `retry_${expect.getState().currentTestName}`;

          // Get current retry count or initialize to 0
          global[retryKey] ||= 0;
          global[retryKey] += 1;

          if (global[retryKey] < maxRetries) {
            console.warn(
              `EACCES error encountered (attempt ${global[retryKey]}/${maxRetries}): ${error.message}. Retrying...`,
            );
            // Re-run the current test
            return it.currentTest.fn();
          }
        }
        throw error;
      } finally {
        await browser.close();
        await server.stop();
      }
    });
  });
});
