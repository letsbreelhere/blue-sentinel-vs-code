import * as vscode from 'vscode';
import { window, env } from 'vscode';
import console from './logger';
import { messageEnum, ProtocolMessage, VSCODE_AGENT } from './protocol';

// eslint-disable-next-line @typescript-eslint/naming-convention
const WebSocket = require('ws');

class Client {
  websocket: typeof WebSocket;
  isHost: boolean;

  static sockets = new Map<string, Client>();

  static async create(documentUri: string, url: URL, isHost: boolean) {
  const client = new Client(url, isHost);
  Client.sockets.set(documentUri, client);
  return client;
  }

  async sendMessage(messageType: ProtocolMessage, ...data: any) {
  return this.websocket.send(JSON.stringify([messageEnum(messageType), ...data]));
  }

  /*
    The info message by the client when it first connects.

    [
      MSG_INFO, // message type [integer]
      session_share, // client request session share? [boolean]
      username, // client name [string]
      agent, // client agent [integer]
    ]
  */
  async sendInfo() {
    return this.sendMessage(
      'MSG_INFO',
      false, // session_share is not implemented
      vscode.workspace.getConfiguration('instant-code').get('username'),
      VSCODE_AGENT
    );
  }

  /*
    The initial message sent by a client to set the initial data in buffers.
    [
      MSG_INITIAL, // message type [integer]
            buffer_name, // [string]
            [
                bufnr, // buffer number in creator client [integer] - **arbitrary in vscode**
                client_id // client id [integer]
            ],  // buffer unique identifier

            pids, // list of pids of the initial content [integer[]]
            content, // list of lines with the initial content [string[]]
    ]
  */
  async sendInitialBuffer() {
  }

  /*
    The request message. This is sent when a client **joins** a server. It asks for current data. The server relays this message to an already connected client.

    [
      MSG_REQUEST, // message type [integer]
    ]
  */
  async requestInitialBuffer() {
    return this.sendMessage('MSG_REQUEST');
  }

  /*
    The text message. It describes individual character operation.

    [
      MSG_TEXT, // message type [integer]
            op, // text character operation [operation]
            [
                bufnr, // buffer number in creator client [integer]
                client_id // client id [integer]
            ],  // buffer unique identifier
            client_id, // client id of sender [integer]
    ]
  */
  async sendTextOperation() {
  }

  constructor(url: URL, isHost: boolean) {
  const ws = new WebSocket(url, 'chat');
  this.websocket = ws;
  this.isHost = isHost;

  ws.on('open', () => {
    console.log('Client connected');
  });

  ws.on('message', (data: any) => {
    console.log(`received: ${data}`);
  });

  ws.on('error', (error: any) => {
    console.log(`WebSocket error: ${error}`);
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
  }
}

export default Client;