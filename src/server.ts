import Logger from './logger';

// eslint-disable-next-line @typescript-eslint/naming-convention
const WebSocket = require('ws');

class Server {
  static serverSingleton: Server | undefined;
  port: number;

  static async create(documentUri: string, port: number) {
    if (Server.serverSingleton) {
      throw new Error(`Server already started at ${Server.serverSingleton.port}`);
    }

    const server = new Server(port);
    Server.serverSingleton = server;
    return server;
  }

  constructor(port: number) {
    this.port = port;
    const wss = new WebSocket.Server({ port });

    wss.on('connection', function connection(ws: any) {
      ws.on('message', function incoming(message: any) {
        Logger.log(`received: ${message}`);
      });
    });

    wss.on('listening', function listening() {
      Logger.log(`Instant Code server started on port ${port}`);
    });
  }
}

export default Server;