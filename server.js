import { createServer } from "node:http";

import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const IMAGE_URL =
  "https://wrcdd.github.io/mash-stickers/assets/M01.png";

const RESOURCE_URI =
  "ui://mash-sticker/m01-test-v1.html";

const WIDGET_DOMAIN =
  process.env.WIDGET_DOMAIN?.trim() || undefined;


/*
 * 第一阶段测试组件：
 * 不生成图片。
 * 不读取 Cookie。
 * 不读取聊天记录。
 * 只显示 GitHub Pages 上已经存在的 M01.png。
 */
const widgetHtml = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <style>
    html,
    body {
      margin: 0;
      padding: 0;
      background: transparent;
    }

    body {
      display: flex;
      justify-content: flex-start;
      align-items: flex-start;
      overflow: hidden;
    }

    img {
      display: block;
      width: 120px;
      height: auto;
      object-fit: contain;
    }
  </style>
</head>

<body>
  <img
    src="${IMAGE_URL}"
    alt="Mash M01 sticker"
  >
</body>
</html>
`;


function createMashServer() {
  const server = new McpServer({
    name: "mash-sticker-mcp",
    version: "0.1.0",
  });


  /*
   * 注册图片卡片 UI。
   */
  registerAppResource(
    server,
    "mash-m01-widget",
    RESOURCE_URI,
    {},
    async () => ({
      contents: [
        {
          uri: RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,

          _meta: {
            ui: {
              prefersBorder: false,

              ...(WIDGET_DOMAIN
                ? { domain: WIDGET_DOMAIN }
                : {}),

              csp: {
                connectDomains: [],
                resourceDomains: [
                  "https://wrcdd.github.io"
                ],
              },
            },
          },
        },
      ],
    })
  );


  /*
   * 注册 ChatGPT 能调用的工具。
   */
  registerAppTool(
    server,
    "show_mash_m01",
    {
      title: "Show Mash M01 sticker",

      description:
        "Displays the existing Mash M01 transparent PNG as an inline image card. " +
        "Use this tool when the user explicitly asks to test or display the M01 Mash sticker.",

      inputSchema: {},

      _meta: {
        ui: {
          resourceUri: RESOURCE_URI,
        },
      },
    },

    async () => ({
      content: [
        {
          type: "text",
          text: "M01 sticker card displayed.",
        },
      ],

      structuredContent: {
        sticker: "M01",
        imageUrl: IMAGE_URL,
      },
    })
  );


  return server;
}


const port = Number(process.env.PORT ?? 8787);

const MCP_PATH = "/mcp";


const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }


  const url = new URL(
    req.url,
    `http://${req.headers.host ?? "localhost"}`
  );


  /*
   * Render 的健康检查和人工测试页面。
   */
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
    });

    res.end("Mash Sticker MCP server is running.");
    return;
  }


  /*
   * MCP CORS 预检。
   */
  if (
    req.method === "OPTIONS" &&
    url.pathname === MCP_PATH
  ) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",

      "Access-Control-Allow-Methods":
        "POST, GET, DELETE, OPTIONS",

      "Access-Control-Allow-Headers":
        "content-type, mcp-session-id, mcp-protocol-version",

      "Access-Control-Expose-Headers":
        "Mcp-Session-Id",
    });

    res.end();
    return;
  }


  /*
   * MCP endpoint。
   */
  const MCP_METHODS =
    new Set(["POST", "GET", "DELETE"]);


  if (
    url.pathname === MCP_PATH &&
    req.method &&
    MCP_METHODS.has(req.method)
  ) {
    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Access-Control-Expose-Headers",
      "Mcp-Session-Id"
    );


    const server = createMashServer();


    /*
     * 无登录、无 session 的最小测试模式。
     */
    const transport =
      new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });


    res.on("close", () => {
      transport.close();
      server.close();
    });


    try {
      await server.connect(transport);

      await transport.handleRequest(
        req,
        res
      );
    } catch (error) {
      console.error(
        "Error handling MCP request:",
        error
      );


      if (!res.headersSent) {
        res
          .writeHead(500)
          .end(
            "Internal server error"
          );
      }
    }

    return;
  }


  res.writeHead(404).end("Not Found");
});


httpServer.listen(
  port,
  "0.0.0.0",
  () => {
    console.log(
      `Mash Sticker MCP server listening on port ${port}`
    );
  }
);
