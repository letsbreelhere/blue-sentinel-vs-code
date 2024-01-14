import * as vscode from 'vscode';
import { window, env } from 'vscode';
import Logger from './logger';
import { CRDT, Pid, ClientId } from './logoot';
import { messageEnum, messageTypeFromEnum, ProtocolMessage, VSCODE_AGENT } from './protocol';
import WebSocket from 'ws';

// eslint-disable-next-line @typescript-eslint/naming-convention

class Client {
  websocket: WebSocket;
  isHost: boolean;
  clientId: number | undefined;
  bufferName: string | undefined;
  crdt: CRDT = new CRDT();
  document: vscode.TextDocument;
  subscriptions: vscode.Disposable[] = [];

  static sockets = new Map<string, Client>();

  static async create(document: vscode.TextDocument, url: URL, isHost: boolean) {
    const client = new Client(url, isHost, document);
    Client.sockets.set(document.uri.toString(), client);
    return client;
  }

  constructor(url: URL, isHost: boolean, document: vscode.TextDocument) {
    const ws = new WebSocket(url, 'chat');
    this.websocket = ws;
    this.isHost = isHost;
    this.document = document;

    if (isHost) {
      this.setupHost();
    } else {
      this.setupGuest();
    }

    this.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => this.handleTextChange(e)));
  }

  handleTextChange(e: vscode.TextDocumentChangeEvent) {
    Logger.log(`Document changed: ${e.document.uri.toString()}`);
    if (e.document !== this.document) {
      return;
    }

    const changes = e.contentChanges;

    changes.forEach((change) => {
      if (change.rangeLength === 0) {
        Logger.log(`Insert: ${change.rangeOffset}, ${change.text}`);
      } else if (change.rangeLength > 0) {
        Logger.log(`Replace: ${change.rangeOffset}, ${change.text}`);
        // Handle a replace as a delete followed by an insert
      } else {
        Logger.log(`Unknown change: ${JSON.stringify(change)}`);
      }
    });
  }

  close() {
    // Unbind event handlers
    this.websocket.removeAllListeners();
    this.subscriptions.forEach((s) => s.dispose());

    this.websocket.close();
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

  async handleInitialMessage(data: any[]) {
    const [_, bufferName, [_bufnr, hostId], uids, lines] = data;

    this.bufferName = bufferName;
    Logger.log(`Buffer name: ${this.bufferName}`);

    // Setup CRDT with initial content
    this.crdt.initialize({ hostId, uids, lines });

    // Set document content from CRDT
    vscode.window.showTextDocument(this.document).then((editor) => {
      editor.edit((editBuilder) => {
        editBuilder.insert(new vscode.Position(0, 0), this.crdt.asString());
      });
    });
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

  async handleInsert(c: string, pid: Pid, clientId: ClientId) {
    this.crdt.insert(pid, c);
  }

  /*
    The available message sent by the server in response to the client.

    [
            MSG_AVAILABLE, // message type [integer]
            is_first, // first client to connect to the server? [boolean]
            client_id, // unique client id assigned by the server [integer]
            session_share, // server in session share mode? [boolean]

    ]
  */
  async handleAvailableMessage(data: any[]) {
    const [_, isFirst, clientId, sessionShare] = data;

    if (isFirst && !this.isHost) {
      vscode.window.showErrorMessage('Error: guest was first to connect');
      this.close();
    }
    if (sessionShare) {
      vscode.window.showErrorMessage('Error: session share not implemented');
      this.close();
    }

    this.clientId = clientId;
    Logger.log(`Client id: ${this.clientId}`);

    if (!this.isHost) {
      this.requestInitialBuffer();
    }
  }

  async setupGuest() {
    this.websocket.on('open', () => {
      Logger.log('Client connected');
      this.sendInfo();
    });

    this.websocket.on('message', (data: any) => {
      Logger.log(`received: ${data}`);
      try {
        const json: any = JSON.parse(data);
        switch (messageTypeFromEnum(json[0])) {
          case 'MSG_AVAILABLE':
            this.handleAvailableMessage(json);
            break;
          case 'MSG_INITIAL':
            this.handleInitialMessage(json);
            break;
          default:
            Logger.log(`Received unhandled message ${data}`);
            break;
        }
      } catch (e) {
        Logger.log(`Received bad message ${data}`);
        Logger.log(`Error parsing JSON: ${e}`);
      }
    });

    this.websocket.on('error', (error: any) => {
      Logger.log(`WebSocket error: ${error}`);
    });

    this.websocket.on('close', () => {
      Logger.log('WebSocket connection closed');
    });
  }

  async setupHost() {
    throw new Error('Not implemented');
  }
}

export default Client;