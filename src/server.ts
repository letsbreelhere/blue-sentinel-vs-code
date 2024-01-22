import Logger from './logger';
import WebSocket from 'ws';
import { MessageTypes, isMessageValid } from './protocol';
import { window } from 'vscode';
import { IncomingMessage } from 'http';

interface ClientState {
  ws: WebSocket;
  clientId: number;
  initialized: boolean;
}

class Server {
  static singleton: Server | undefined;
  port: number;
  maxClientId: number = 100;
  connectedClients: Map<number, ClientState> = new Map();
  wss: WebSocket.Server;

  static async create(port: number) {
    if (Server.singleton) {
      throw new Error(`Server already started at ${Server.singleton.port}`);
    }

    Server.singleton = new Server(port);
    return Server.singleton;
  }

  handleMessage(ws: WebSocket, message: string, clientId: number) {
    Logger.log(`Message from client ${clientId}: ${message}`);
    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch (err) {
      Logger.log(`Error parsing message from client ${clientId}: ${err}`);
      return;
    }

    if (!isMessageValid(parsed)) {
      Logger.log(`Invalid message from client ${clientId}: ${message}`);
      return;
    }

    const client = this.connectedClients.get(clientId);

    const msgType = parsed[0];

    if (msgType !== MessageTypes.MSG_INFO && !client) {
      Logger.log(`Client ${clientId} sent message before initialization: ${message}`);
      return;
    }

    switch (msgType) {
      case MessageTypes.MSG_INFO:
        // First message from client
        const isFirst = this.connectedClients.size === 0;
        this.connectedClients.set(clientId, {
          ws,
          clientId,
          initialized: false
        });

        this.reply(
          // Final boolean here is session share, which is not yet implemented
          [MessageTypes.MSG_AVAILABLE, isFirst, clientId, false],
          clientId
        );

        const [_, sessionShare, username, _agent] = parsed;
        if (sessionShare) {
          Logger.log(`Client ${clientId} requested session share`);
        }

        this.sendToOthers(
          [MessageTypes.MSG_CONNECT, clientId, username],
          clientId
        );
        break;
      case MessageTypes.MSG_TEXT:
        this.sendToOthers(parsed, clientId);
        break;
      case MessageTypes.MSG_REQUEST:
        this.sendToOneOther(parsed, clientId);
        break;
      case MessageTypes.MSG_INITIAL:
        this.sendToOthers(parsed, clientId);
        const client = this.connectedClients.get(clientId);
        break;
      case MessageTypes.MSG_MARK:
        this.sendToOthers(parsed, clientId);
        break;
      default:
        Logger.log(`Unknown message from client ${clientId}: ${message}`);
        break;
    }
  }

  sendToOneOther(message: any, clientId: number) {
    this.connectedClients.forEach(({ ws }, id) => {
      if (id !== clientId) {
        ws.send(JSON.stringify(message));
        return;
      }
    });
  }

  reply(message: any, clientId: number) {
    const client = this.connectedClients.get(clientId);
    if (client) {
      client.ws.send(JSON.stringify(message));
    }
  }

  sendToOthers(message: any, clientId: number) {
    this.connectedClients.forEach(({ ws }, id) => {
      if (id !== clientId) {
        ws.send(JSON.stringify(message));
      }
    });
  }

  sendToAll(message: any, clientId: number) {
    this.connectedClients.forEach(({ ws }, id) => {
      ws.send(JSON.stringify(message));
    });
  }

  constructor(port: number) {
    this.port = port;
    const wss = new WebSocket.Server({ port });
    this.wss = wss;

    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      const clientId = this.maxClientId++;
      Logger.log(`Client ${clientId} connected`);

      ws.on('close', () => {
        Logger.log(`Client ${clientId} disconnected`);
        this.connectedClients.delete(clientId);
        this.sendToAll(
          [MessageTypes.MSG_DISCONNECT, clientId],
          clientId
        );
      });

      ws.on('error', (err) => {
        Logger.log(`Error from client ${clientId}: ${err}`);
      });

      ws.on('message', (message: string) => this.handleMessage(ws, message, clientId));
    });

    this.wss.on('listening', function listening() {
      window.showInformationMessage(`Server started at port ${port}`);
    });

    this.wss.on('error', function error(err) {
      Logger.log(`Error starting server: ${err}`);
      wss.close();
    });
  }

  close() {
    this.wss.close();
    Server.singleton = undefined;
  }
}

export default Server;