#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const express = require('express');
const net = require('net');
const { globSync } = require('glob');

const BASE_CONFIG_FILE = path.resolve('./mcp_config/mcp_config.json');
const APPS_DIR = path.resolve('./backend/apps');
const AGENTS_DIR = path.resolve('./backend/agents'); // New directory to scan
const BASE_PORT = 13370;
const HOST = '0.0.0.0';
const INIT_TIMEOUT = 90000; // Increased timeout for cold npx installs

const runningServers = [];

async function main() {
  try {
    let combinedConfig = {};
    if (fs.existsSync(BASE_CONFIG_FILE)) {
      const baseConfigContent = fs.readFileSync(BASE_CONFIG_FILE, 'utf8');
      combinedConfig = JSON.parse(baseConfigContent).mcpServers || {};
      console.log(`🔵 Loaded ${Object.keys(combinedConfig).length} servers from base config.`);
    } else {
      console.log('🟡 No base mcp_config.json found.');
    }

    const appConfigFiles = globSync(`${APPS_DIR}/*/mcp_config.json`);
    const agentConfigFiles = globSync(`${AGENTS_DIR}/*/mcp_config.json`); // Scan agents
    const allModuleConfigFiles = [...appConfigFiles, ...agentConfigFiles]; // Combine sources

    console.log(`🔎 Found ${allModuleConfigFiles.length} app/agent-specific MCP configs.`);

    for (const configFile of allModuleConfigFiles) {
      try {
        const moduleConfigContent = fs.readFileSync(configFile, 'utf8');
        const moduleConfig = JSON.parse(moduleConfigContent).mcpServers;
        if (moduleConfig) {
          const moduleDir = path.dirname(configFile);
          for (const serverName in moduleConfig) {
              if (moduleConfig[serverName].args) {
                  moduleConfig[serverName].args = moduleConfig[serverName].args.map(arg => {
                      if (arg.startsWith('./') || arg.startsWith('../')) {
                          return path.resolve(moduleDir, arg);
                      }
                      if (arg.startsWith('~')) {
                          return arg.replace('~', process.env.HOME || require('os').homedir());
                      }
                      return arg;
                  });
              }
          }
          Object.assign(combinedConfig, moduleConfig);
          console.log(`   - Loaded servers from ${path.relative(process.cwd(), configFile)}`);
        }
      } catch (error) {
        console.error(`❌ Error loading module config ${configFile}: ${error.message}`);
      }
    }

    const serverEntries = Object.entries(combinedConfig);
    if (serverEntries.length === 0) {
      console.log('✅ No MCP servers to launch. Exiting.');
      process.exit(0);
    }

    console.log(`\n🚀 Launching ${serverEntries.length} total MCP servers...`);

    let currentPort = BASE_PORT;
    for (const [name, serverConfig] of serverEntries) {
      const port = currentPort++;
      try {
        console.log(`\n📦 Attempting to start ${name} on port ${port}...`);
        const serverProcess = await launchAndProxyServer(name, serverConfig, port);
        runningServers.push({ name, process: serverProcess, port });
        console.log(`✅ ${name} is running and proxied on http://${HOST}:${port}`);
      } catch (error) {
        console.error(`❌ FAILED to start ${name}: ${error.message}`);
      }
    }
    console.log('\n🎉 All available servers started! Press Ctrl+C to stop all processes.');
  } catch (error) {
    console.error('❌ A critical error occurred during launch:', error);
    shutdown();
    process.exit(1);
  }
}

function launchAndProxyServer(name, config, port) {
  return new Promise((resolve, reject) => {
    const substitute = (value) => {
      if (typeof value !== 'string') return value;
      let processedValue = value.replace(/^~/, process.env.HOME || require('os').homedir());
      processedValue = processedValue.replace(/\$\{(\w+)\}/g, (_, varName) => process.env[varName] || '');
      return processedValue;
    };

    const command = config.command;
    const args = (config.args || []).map(substitute);
    
    const spawnEnv = { ...process.env, ...config.env };

    console.log(`   - Spawning: ${command} ${args.join(' ')}`);
    const serverProcess = spawn(command, args, { 
        env: spawnEnv, 
        shell: false, 
        stdio: 'pipe',
        cwd: config.cwd ? substitute(config.cwd) : undefined
    });
    
    const pendingRequests = new Map();

    serverProcess.stdout.on('data', (data) => {
      const messages = data.toString().trim().split('\n');
      for (const msg of messages) {
        if (!msg.trim()) continue;
        try {
          const response = JSON.parse(msg);
          if (response.id && pendingRequests.has(response.id)) {
            pendingRequests.get(response.id)(response);
            pendingRequests.delete(response.id);
          }
        } catch (e) {
            // Non-JSON output, probably a debug log from the server itself.
        }
      }
    });

    serverProcess.stderr.on('data', (data) => {
      process.stderr.write(`[${name} STDERR] ${data.toString()}`);
    });
    serverProcess.on('error', (err) => reject(new Error(`Spawn error for ${name}: ${err.message}.`)));
    serverProcess.on('close', (code) => {
      if (code !== 0 && code !== null) console.log(`[${name}] Process exited with code ${code}`);
    });

    const app = express();
    app.use(express.json());
    app.get('/', (req, res) => res.send(`MCP Proxy for ${name} is running.`));
    app.post('/mcp', (req, res) => {
      const requestBody = req.body;
      if (!requestBody.id) return res.status(400).json({ error: 'Request body must have an id' });
      
      const requestString = JSON.stringify(requestBody);
      
      pendingRequests.set(requestBody.id, (response) => res.json(response));
      serverProcess.stdin.write(requestString + '\n');
    });

    const httpServer = http.createServer(app);
    httpServer.listen(port, HOST, () => {
      const startTime = Date.now();
      const interval = setInterval(() => {
        if (Date.now() - startTime > INIT_TIMEOUT) {
          clearInterval(interval);
          serverProcess.kill();
          reject(new Error(`Timeout: Proxy for ${name} did not become responsive on port ${port}.`));
        }
        const socket = new net.Socket();
        socket.setTimeout(1000);
        socket.on('connect', () => {
          socket.destroy();
          clearInterval(interval);
          resolve(serverProcess);
        }).on('error', () => {}).on('timeout', () => socket.destroy()).connect(port, '127.0.0.1');
      }, 1000);
    });
  });
}

function shutdown() {
  console.log('\n🛑 Shutting down all MCP servers...');
  runningServers.forEach(({ name, process }) => {
    if (!process.killed) {
      console.log(`   - Stopping ${name} (PID: ${process.pid})...`);
      process.kill('SIGINT');
    }
  });
  setTimeout(() => process.exit(0), 1500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main();