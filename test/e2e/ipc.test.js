"use strict";

const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const httpProxy = require("http-proxy");
const webpack = require("webpack");
const Server = require("../../lib/Server");
const config = require("../fixtures/client-config/webpack.config");
const runBrowser = require("../helpers/run-browser");
const sessionSubscribe = require("../helpers/session-subscribe");
const port1 = require("../ports-map").ipc;

const webSocketServers = ["ws", "sockjs"];

describe("web socket server URL", () => {
  for (const webSocketServer of webSocketServers) {
    const websocketURLProtocol = webSocketServer === "ws" ? "ws" : "http";

    it(`should work with the "ipc" option using "true" value ("${webSocketServer}")`, async () => {
      const devServerHost = "localhost";
      const proxyHost = devServerHost;
      const proxyPort = port1;

      const compiler = webpack(config);
      const devServerOptions = {
        webSocketServer,
        ipc: true,
      };
      const server = new Server(devServerOptions, compiler);

      await server.start();

      function startProxy(callback) {
        const proxy = httpProxy.createProxyServer({
          target: { socketPath: server.options.ipc },
        });

        const proxyServer = http.createServer((request, response) => {
          // You can define here your custom logic to handle the request
          // and then proxy the request.
          proxy.web(request, response);
        });

        proxyServer.on("upgrade", (request, socket, head) => {
          proxy.ws(request, socket, head);
        });

        return proxyServer.listen(proxyPort, proxyHost, callback);
      }

      const proxy = await new Promise((resolve) => {
        const proxyCreated = startProxy(() => {
          resolve(proxyCreated);
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

        const webSocketRequests = [];

        if (webSocketServer === "ws") {
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
        } else {
          page.on("request", (request) => {
            if (/\/ws\//.test(request.url())) {
              webSocketRequests.push({ url: request.url() });
            }
          });
        }

        await page.goto(`http://${proxyHost}:${proxyPort}/`, {
          waitUntil: "networkidle0",
        });

        const [webSocketRequest] = webSocketRequests;

        expect(webSocketRequest.url).toContain(
          `${websocketURLProtocol}://${devServerHost}:${proxyPort}/ws`,
        );
        expect(
          consoleMessages.map((message) => message.text()),
        ).toMatchSnapshot("console messages");
        expect(pageErrors).toMatchSnapshot("page errors");
      } finally {
        proxy.close();

        await browser.close();
        await server.stop();
      }
    });

    it(`should work with the "ipc" option using "string" value ("${webSocketServer}")`, async () => {
      const isWindows = process.platform === "win32";
      const pipePrefix = isWindows ? "\\\\.\\pipe\\" : os.tmpdir();
      const pipeName = `webpack-dev-server.${process.pid}-1.sock`;
      const ipc = path.join(pipePrefix, pipeName);

      const devServerHost = "localhost";
      const proxyHost = devServerHost;
      const proxyPort = port1;

      const compiler = webpack(config);
      const devServerOptions = {
        webSocketServer,
        ipc,
      };
      const server = new Server(devServerOptions, compiler);

      await server.start();

      function startProxy(callback) {
        const proxy = httpProxy.createProxyServer({
          target: { socketPath: ipc },
        });

        const proxyServer = http.createServer((request, response) => {
          // You can define here your custom logic to handle the request
          // and then proxy the request.
          proxy.web(request, response);
        });

        proxyServer.on("upgrade", (request, socket, head) => {
          proxy.ws(request, socket, head);
        });

        return proxyServer.listen(proxyPort, proxyHost, callback);
      }

      const proxy = await new Promise((resolve) => {
        const proxyCreated = startProxy(() => {
          resolve(proxyCreated);
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

        const webSocketRequests = [];

        if (webSocketServer === "ws") {
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
        } else {
          page.on("request", (request) => {
            if (/\/ws\//.test(request.url())) {
              webSocketRequests.push({ url: request.url() });
            }
          });
        }

        await page.goto(`http://${proxyHost}:${proxyPort}/`, {
          waitUntil: "networkidle0",
        });

        const [webSocketRequest] = webSocketRequests;

        expect(webSocketRequest.url).toContain(
          `${websocketURLProtocol}://${devServerHost}:${proxyPort}/ws`,
        );
        expect(
          consoleMessages.map((message) => message.text()),
        ).toMatchSnapshot("console messages");
        expect(pageErrors).toMatchSnapshot("page errors");
      } finally {
        proxy.close();

        await browser.close();
        await server.stop();
      }
    });

    // TODO un skip after implement new API
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip(`should work with the "ipc" option using "string" value and remove old ("${webSocketServer}")`, async () => {
      const isWindows = process.platform === "win32";
      const localRelative = path.relative(process.cwd(), `${os.tmpdir()}/`);
      const pipePrefix = isWindows ? "\\\\.\\pipe\\" : localRelative;
      const pipeName = `webpack-dev-server.${process.pid}-2.sock`;
      const ipc = path.join(pipePrefix, pipeName);

      const ipcServer = await new Promise((resolve, reject) => {
        // eslint-disable-next-line new-cap
        const server = net.Server();

        server.on("error", (error) => {
          reject(error);
        });

        // eslint-disable-next-line no-promise-executor-return
        return server.listen(ipc, () => {
          resolve();
        });
      });

      const devServerHost = "localhost";
      const proxyHost = devServerHost;
      const proxyPort = port1;

      const compiler = webpack(config);
      const devServerOptions = {
        webSocketServer,
        host: devServerHost,
        ipc,
      };
      const server = new Server(devServerOptions, compiler);

      await server.start();

      function startProxy(callback) {
        const proxy = httpProxy.createProxyServer({
          target: { socketPath: ipc },
        });

        const proxyServer = http.createServer((request, response) => {
          // You can define here your custom logic to handle the request
          // and then proxy the request.
          proxy.web(request, response);
        });

        proxyServer.on("upgrade", (request, socket, head) => {
          proxy.ws(request, socket, head);
        });

        return proxyServer.listen(proxyPort, proxyHost, callback);
      }

      const proxy = await new Promise((resolve) => {
        const proxyCreated = startProxy(() => {
          resolve(proxyCreated);
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

        const webSocketRequests = [];

        if (webSocketServer === "ws") {
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
        } else {
          page.on("request", (request) => {
            if (/\/ws\//.test(request.url())) {
              webSocketRequests.push({ url: request.url() });
            }
          });
        }

        await page.goto(`http://${proxyHost}:${proxyPort}/`, {
          waitUntil: "networkidle0",
        });

        const [webSocketRequest] = webSocketRequests;

        expect(webSocketRequest.url).toContain(
          `${websocketURLProtocol}://${devServerHost}:${proxyPort}/ws`,
        );
        expect(
          consoleMessages.map((message) => message.text()),
        ).toMatchSnapshot("console messages");
        expect(pageErrors).toMatchSnapshot("page errors");
      } finally {
        proxy.close();

        await new Promise((resolve, reject) => {
          ipcServer.close((error) => {
            if (error) {
              reject(error);

              return;
            }

            resolve();
          });
        });
        await browser.close();
        await server.stop();
      }
    });
  }
});
