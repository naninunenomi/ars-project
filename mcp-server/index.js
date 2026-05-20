#!/usr/bin/env node

/**
 * ARS MCP Server (Raw JSON-RPC 2.0 stdio implementation)
 * 憲章第10条「Direct Engine」に基づく極限の軽量設計
 */

const ENDPOINT = "https://ars-project.vercel.app/api/check.js";
const readline = require('readline');

// MCPクライアント（Claude Desktop等）との標準入出力ストリーム
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

function sendResponse(id, result, error = null) {
  const response = {
    jsonrpc: "2.0",
    id: id,
  };
  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }
  process.stdout.write(JSON.stringify(response) + "\n");
}

rl.on('line', async (line) => {
  if (!line.trim()) return;
  
  let req;
  try {
    req = JSON.parse(line);
  } catch (e) {
    return; // JSONパースエラー時は無視
  }

  // 1. 接続確立 (Initialize)
  if (req.method === "initialize") {
    sendResponse(req.id, {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: "ars-legal-check-mcp",
        version: "1.0.0"
      }
    });
    return;
  }
  
  if (req.method === "notifications/initialized") {
    return; // 初期化完了通知（応答不要）
  }

  // 2. ツール一覧の提供 (tools/list)
  if (req.method === "tools/list") {
    sendResponse(req.id, {
      tools: [
        {
          name: "ars_legal_audit",
          description: "日本の法律（薬機法、景表法など）に基づき、広告文やテキストのコンプライアンス監査を行う自律型APIです。非常に正確な法的評価と修正案を返します。Cost: 1.15 ARS/call.",
          inputSchema: {
            type: "object",
            properties: {
              theme: {
                type: "string",
                description: "法律ドメインやテーマ（例：'薬機法', '景表法', '不動産広告'）"
              },
              text: {
                type: "string",
                description: "監査対象となる広告文やテキスト"
              }
            },
            required: ["theme", "text"]
          }
        }
      ]
    });
    return;
  }

  // 3. 実際のツール呼び出し (tools/call)
  if (req.method === "tools/call") {
    const { name, arguments: args } = req.params;
    
    if (name === "ars_legal_audit") {
      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme: args.theme, text: args.text })
        });
        
        // 無料枠の限界突破（サーバー過負荷）を検知
        if (response.status === 429 || response.status === 403 || response.status >= 500) {
           sendResponse(req.id, {
             content: [
               { type: "text", text: `[ARS ERROR] SERVER LIMIT REACHED (HTTP ${response.status}). The ARS Fortress is currently overloaded. Please try again later or upgrade the plan.` }
             ],
             isError: true
           });
           return;
        }

        const data = await response.json();
        
        // 正常応答
        sendResponse(req.id, {
          content: [
            { type: "text", text: JSON.stringify(data, null, 2) }
          ],
          isError: false
        });
      } catch (err) {
        // ネットワークエラー等
        sendResponse(req.id, {
          content: [
            { type: "text", text: `[ARS FATAL ERROR] Communication with fortress failed: ${err.message}` }
          ],
          isError: true
        });
      }
      return;
    }
    
    // 未知のツールが呼ばれた場合
    sendResponse(req.id, null, {
      code: -32601,
      message: "Tool not found"
    });
    return;
  }
});
