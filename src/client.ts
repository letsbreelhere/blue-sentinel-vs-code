import * as vscode from 'vscode';
import { window, env } from 'vscode';
import WebSocket from 'ws';

import Logger from './logger';
import { CRDT } from './crdt';
import { Pid, ClientId } from './pid';
import * as protocol from './protocol';
import { MessageTypes } from './protocol';

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
    // TODO: ignore changes if it's from remote CRDT change
    Logger.log(`Document changed: ${e.document.uri.toString()}`);
    if (e.document !== this.document) {
      return;
    }

    const changes = e.contentChanges;

    changes.forEach((change) => {
      if (change.rangeLength === 0) {
        // Logger.log(`Insert: ${change.rangeOffset}, ${change.text}`);
      } else if (change.rangeLength > 0) {
        // Logger.log(`Replace: ${change.rangeOffset}, ${change.text}`);
        // Handle a replace as a delete followed by an insert
      } else {
        Logger.log(`Unknown change: ${JSON.stringify(change)}`);
      }
    });
  }

  close() {
    Logger.log('Closing client');
    // Unbind event handlers
    this.websocket.removeAllListeners();
    this.subscriptions.forEach((s) => s.dispose());

    this.websocket.close();
  }

  async sendMessage(messageType: number, ...data: any) {
    // Validate message against schema
    protocol.validateMessage([messageType, ...data]);
    return this.websocket.send(JSON.stringify([messageType, ...data]));
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
      MessageTypes.MSG_INFO,
      false, // session_share is not implemented
      vscode.workspace.getConfiguration('instant-code').get('username'),
      protocol.VSCODE_AGENT
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
    window.showTextDocument(this.document).then((editor) => {
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
    return this.sendMessage(MessageTypes.MSG_REQUEST);
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

  handleInsert(pid: Pid, c: string, clientId: ClientId) {
    return this.crdt.insert(pid, c);
  }

  handleDelete(pid: Pid, c: string, clientId: ClientId) {
    return this.crdt.delete(pid);
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
    Logger.log(`Available message: ${JSON.stringify(data)}`);
    const [_, isFirst, clientId, sessionShare] = data;

    if (isFirst && !this.isHost) {
      Logger.log('Error: guest was first to connect');
      window.showErrorMessage('Error: guest was first to connect');
      this.close();
    }
    if (sessionShare) {
      Logger.log('Error: session share not implemented');
      window.showErrorMessage('Error: session share not implemented');
      this.close();
    }

    this.clientId = clientId;
    Logger.log(`Client id: ${this.clientId}`);

    if (!this.isHost) {
      this.requestInitialBuffer();
    }
  }

  async handleText(op: [number, string, Pid], clientId: ClientId) {
    const [opType, c, pid] = op;
    switch (opType) {
      case protocol.OP_INS:
        const i = this.handleInsert(pid, c, clientId);
        // Insert into document
        // TODO: whenever this document is closed, we should also close the client.
        const editor = window.visibleTextEditors.find(
          (editor) => editor.document === this.document
        );
        if (!editor) {
          window.showErrorMessage(`Could not find editor for document ${this.document.uri.toString()}`);
          this.close();
          return;
        }
        editor.edit((editBuilder) => {
          // The beginning of doc _and_ beginning of the first line comprise the first two PIDs
          // Since these are not represented in the document, we need to subtract 2 from the index
          const pos = this.document.positionAt(i - 2);
          editBuilder.insert(pos, c);
        });
        break;
      case protocol.OP_DEL:
        this.handleDelete(pid, c, clientId);
        break;
      default:
        Logger.log(`Received unhandled text operation ${op}`);
        break;
    }
  }

  async handleMessage(json: any[]) {
    protocol.validateMessage(json);
    switch (json[0]) {
      case MessageTypes.MSG_TEXT:
        const [_m, op, _b, clientId] = json;
        this.handleText(op, clientId);
        break;
      case MessageTypes.MSG_AVAILABLE:
        this.handleAvailableMessage(json);
        break;
      case MessageTypes.MSG_INITIAL:
        this.handleInitialMessage(json);
        break;
      default:
        window.showErrorMessage(`Received unhandled message ${JSON.stringify(json)}`);
        break;
    }
  }

  async setupGuest() {
    this.websocket.on('open', () => {
      Logger.log('Client connected');
      this.sendInfo();
    });

    this.websocket.on('message', (data: string) => {
      Logger.log(`received: ${data}`);
      const json = JSON.parse(data);
      // TODO: validate json against schema
      this.handleMessage(json);
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