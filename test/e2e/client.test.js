"use strict";

const webpack = require("webpack");
const Server = require("../../lib/Server");
const config = require("../fixtures/simple-config-other/webpack.config");
const runBrowser = require("../helpers/run-browser");
const port = require("../ports-map")["client-option"];

describe("client option", () => {
  describe("default behaviour", () => {
    let compiler;
    let server;
    let page;
    let browser;
    let pageErrors;
    let consoleMessages;

    beforeEach(async () => {
      compiler = webpack(config);

      server = new Server(
        {
          client: {
            webSocketTransport: "sockjs",
          },
          webSocketServer: "sockjs",
          port,
        },
        compiler,
      );

      await server.start();

      ({ page, browser } = await runBrowser());

      pageErrors = [];
      consoleMessages = [];
    });

    afterEach(async () => {
      await browser.close();
      await server.stop();
    });

    it("responds with a 200 status code for /ws path", async () => {
      page
        .on("console", (message) => {
          consoleMessages.push(message);
        })
        .on("pageerror", (error) => {
          pageErrors.push(error);
        });

      const response = await page.goto(`http://localhost:${port}/ws`, {
        waitUntil: "networkidle0",
      });

      // overlay should be true by default
      expect(server.options.client.overlay).toBe(true);

      expect(response.status()).toMatchSnapshot("response status");

      expect(consoleMessages.map((message) => message.text())).toMatchSnapshot(
        "console messages",
      );

      expect(pageErrors).toMatchSnapshot("page errors");
    });
  });

  describe("should respect path option", () => {
    let compiler;
    let server;
    let page;
    let browser;
    let pageErrors;
    let consoleMessages;

    beforeEach(async () => {
      compiler = webpack(config);

      server = new Server(
        {
          client: {
            webSocketTransport: "sockjs",
          },
          webSocketServer: {
            type: "sockjs",
            options: {
              host: "localhost",
              port,
              path: "/foo/test/bar",
            },
          },
          port,
        },
        compiler,
      );

      await server.start();

      ({ page, browser } = await runBrowser());

      pageErrors = [];
      consoleMessages = [];
    });

    afterEach(async () => {
      await browser.close();
      await server.stop();
    });

    it("responds with a 200 status code for /foo/test/bar path", async () => {
      page
        .on("console", (message) => {
          consoleMessages.push(message);
        })
        .on("pageerror", (error) => {
          pageErrors.push(error);
        });

      const response = await page.goto(
        `http://localhost:${port}/foo/test/bar`,
        {
          waitUntil: "networkidle0",
        },
      );

      expect(response.status()).toMatchSnapshot("response status");

      expect(consoleMessages.map((message) => message.text())).toMatchSnapshot(
        "console messages",
      );

      expect(pageErrors).toMatchSnapshot("page errors");
    });
  });

  describe("configure client entry", () => {
    let compiler;
    let server;
    let page;
    let browser;
    let pageErrors;
    let consoleMessages;

    beforeEach(async () => {
      compiler = webpack(config);

      server = new Server(
        {
          client: false,
          port,
        },
        compiler,
      );

      await server.start();

      ({ page, browser } = await runBrowser());

      pageErrors = [];
      consoleMessages = [];
    });

    afterEach(async () => {
      await browser.close();
      await server.stop();
    });

    it("should disable client entry", async () => {
      page
        .on("console", (message) => {
          consoleMessages.push(message);
        })
        .on("pageerror", (error) => {
          pageErrors.push(error);
        });

      const response = await page.goto(`http://localhost:${port}/main.js`, {
        waitUntil: "networkidle0",
      });

      expect(response.status()).toMatchSnapshot("response status");

      expect(await response.text()).not.toMatch(/client\/index\.js/);

      expect(consoleMessages.map((message) => message.text())).toMatchSnapshot(
        "console messages",
      );

      expect(pageErrors).toMatchSnapshot("page errors");
    });
  });

  describe("override client entry", () => {
    let compiler;
    let server;
    let page;
    let browser;

    class OverrideServer extends Server {
      getClientEntry() {
        return require.resolve(
          "../fixtures/custom-client/CustomClientEntry.js",
        );
      }

      getClientHotEntry() {
        return require.resolve(
          "../fixtures/custom-client/CustomClientHotEntry.js",
        );
      }
    }

    beforeEach(async () => {
      compiler = webpack(config);

      server = new OverrideServer(
        {
          port,
        },
        compiler,
      );

      await server.start();

      ({ page, browser } = await runBrowser());
    });

    afterEach(async () => {
      await browser.close();
      await server.stop();
    });

    it("should disable client entry", async () => {
      const response = await page.goto(`http://localhost:${port}/main.js`, {
        waitUntil: "networkidle0",
      });

      expect(response.status()).toMatchSnapshot("response status");

      const content = await response.text();
      expect(content).toContain("CustomClientEntry.js");
      expect(content).toContain("CustomClientHotEntry.js");
    });
  });

  describe("webSocketTransport", () => {
    const clientModes = [
      {
        title: 'as a string ("sockjs")',
        client: {
          webSocketTransport: "sockjs",
        },
        webSocketServer: "sockjs",
        shouldThrow: false,
      },
      {
        title: 'as a string ("ws")',
        client: {
          webSocketTransport: "ws",
        },
        webSocketServer: "ws",
        shouldThrow: false,
      },
      {
        title: 'as a path ("sockjs")',
        client: {
          webSocketTransport: require.resolve(
            "../../client-src/clients/SockJSClient",
          ),
        },
        webSocketServer: "sockjs",
        shouldThrow: false,
      },
      {
        title: 'as a path ("ws")',
        client: {
          webSocketTransport: require.resolve(
            "../../client-src/clients/WebSocketClient",
          ),
        },
        webSocketServer: "ws",
        shouldThrow: false,
      },
      {
        title: "as a nonexistent path (sockjs)",
        client: {
          webSocketTransport: "/bad/path/to/implementation",
        },
        webSocketServer: "sockjs",
        shouldThrow: true,
      },
      {
        title: "as a nonexistent path (ws)",
        client: {
          webSocketTransport: "/bad/path/to/implementation",
        },
        webSocketServer: "ws",
        shouldThrow: true,
      },
    ];

    describe("passed to server", () => {
      for (const data of clientModes) {
        it(`${data.title} ${
          data.shouldThrow ? "should throw" : "should not throw"
        }`, async () => {
          const compiler = webpack(config);

          const server = new Server(
            {
              client: data.client,
              port,
            },
            compiler,
          );

          let thrownError;

          try {
            await server.start();
          } catch (error) {
            thrownError = error;
          }

          if (data.shouldThrow) {
            expect(thrownError.message).toMatch(
              /client\.webSocketTransport must be a string/,
            );
          }

          await server.stop();
        });
      }
    });
  });
});
