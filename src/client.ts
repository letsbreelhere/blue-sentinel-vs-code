import * as vscode from 'vscode';
import { window, env } from 'vscode';
import WebSocket from 'ws';

import Logger from './logger';
import { CRDT } from './crdt';
import * as pid from './pid';
import { Pid } from './pid';
import * as protocol from './protocol';
import { MessageTypes } from './protocol';
import { readFile } from 'fs';

// eslint-disable-next-line @typescript-eslint/naming-convention

interface RemoteClient {
  username: string;
  documentOffset: number | undefined;
  decoration: vscode.TextEditorDecorationType;
}


function sequence<T>(list: readonly T[], f: (item: T, ix: number) => Promise<void>) {
  return list.reduce((p, c, i) => p.then(() => f(c, i)), Promise.resolve());
}

class Client {
  websocket: WebSocket;
  isHost: boolean;
  clientId: number | undefined;
  bufferName: string | undefined;
  buffer: [number, number] = [0, 0];
  crdt: CRDT | undefined;
  document: vscode.TextDocument;
  subscriptions: vscode.Disposable[] = [];
  activeEdit: { kind: 'insert' | 'delete', range: vscode.Range, text: string } | undefined;
  connectedClients = new Map<number, RemoteClient>();
  operationQueue: any[] = [];

  static openClients = new Map<string, Client>();

  static forDocument(document: vscode.TextDocument): Client | undefined {
    return Client.openClients.get(document.uri.toString());
  }

  static async create(document: vscode.TextDocument, url: URL, isHost: boolean) {
    const client = new Client(url, isHost, document);
    Client.openClients.set(document.uri.toString(), client);
    return client;
  }

  constructor(url: URL, isHost: boolean, document: vscode.TextDocument) {
    const ws = new WebSocket(url, 'blue-sentinel');
    this.websocket = ws;
    this.isHost = isHost;
    this.document = document;

    if (this.isHost) {
      this.makeHostCrdt();
    }

    this.setupHooks();

    this.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => this.handleTextChange(e)));
  }

  makeHostCrdt() {
    this.crdt = new CRDT({
      hostId: 100,
      pids: [pid.make(0, 0), pid.make(1, 0), pid.make(pid.MAX_UID, 0)],
      lines: [''],
    });

    const pids = this.document.getText().split('').map((c: string, i: number) => {
      const pid = this.crdt!.pidForInsert(100, this.document.offsetAt(new vscode.Position(0, i)));
      this.crdt!.insert(pid, c);
    });
  }

  async sendInserts(content: [Pid, string][]) {
    return this.sendMessage(MessageTypes.MSG_TEXT, [protocol.OP_INS, content], this.buffer, this.clientId!);
  }

  async sendDeletes(deletes: [Pid, string][]) {
    return this.sendMessage(MessageTypes.MSG_TEXT, [protocol.OP_DEL, deletes], this.buffer, this.clientId!);
  }

  async handleLocalInsert(change: vscode.TextDocumentContentChangeEvent) {
    const inserts: [Pid, string][] = change.text.split('').map((c, i) => {
      const offset = change.rangeOffset + i;
      const p = this.crdt!.pidForInsert(this.clientId!, offset);
      this.crdt!.insert(p, c);
      return [p, c];
    });

    await this.sendInserts(inserts);
  }

  async handleLocalDelete(change: vscode.TextDocumentContentChangeEvent) {
    const deletedIndices = Array(change.rangeLength).fill(0).map((_, i) => i + change.rangeOffset);
    const deletes: [Pid, string][] = deletedIndices.map((i) => {
      const p = this.crdt!.pidAt(i)!;
      const c = this.crdt!.charAt(p)!;
      return [p, c];
    });
    deletes.forEach(([p, c]) => this.crdt!.delete(p));
    await this.sendDeletes(deletes);
  }

  async handleTextChange(e: vscode.TextDocumentChangeEvent) {
    if (e.document !== this.document) {
      return;
    }

    const changes = e.contentChanges;

    await sequence(changes, async (change) => {
      if (change.rangeLength === 0) {
        if (this.activeEdit?.kind === 'insert' && change.range.isEqual(this.activeEdit.range)) {
          return;
        }

        await this.handleLocalInsert(change);
      } else if (change.rangeLength > 0) {
        if (this.activeEdit?.kind === 'delete' && change.range.isEqual(this.activeEdit.range)) {
          return;
        }

        // Handle a replace as a delete followed by an insert
        await this.handleLocalDelete(change);
        await this.handleLocalInsert(change);
      } else {
      }
    });
  }

  close() {
    this.websocket.removeAllListeners();
    this.subscriptions.forEach((s) => s.dispose());
    if (this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.close();
    }
  }

  async sendMessage(messageType: number, ...data: any) {
    console.log('sending message', messageType, data);
    protocol.validateMessage([messageType, ...data]);
    return this.websocket.send(JSON.stringify([messageType, ...data]));
  }

  async sendInfo() {
    let username = vscode.workspace.getConfiguration('blue-sentinel').get('username');
    if (!username) {
      const birds = require('../json/birds.json');
      const adjectives = require('../json/adjectives.json');

      const bird = birds[Math.floor(Math.random() * birds.length)];
      const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];

      username = `${adjective}-${bird}`;
    }

    return this.sendMessage(
      MessageTypes.MSG_INFO,
      false, // session_share is not implemented
      username,
      protocol.VSCODE_AGENT
    );
  }

  async sendInitialBuffer() {
    const lines = this.document.getText().split('\n');
    return this.sendMessage(
      MessageTypes.MSG_INITIAL,
      this.document.fileName || 'Untitled',
      [
        0,
        this.clientId!
      ],
      this.crdt!.allPids(),
      lines
    );
  }

  async handleInitialMessage(data: any[]) {
    const [_, bufferName, [bufnr, hostId], pids, lines] = data;

    this.bufferName = bufferName;
    this.buffer = [bufnr, hostId];

    this.crdt = new CRDT({ hostId, pids: pids, lines });

    const str = this.crdt!.asString();
    this.activeEdit = {
      kind: 'insert',
      range: new vscode.Range(0, 0, 0, 0),
      text: str,
    },
    await window.showTextDocument(this.document).then(async (editor) => {
      await editor.edit((editBuilder) => {
        editBuilder.insert(new vscode.Position(0, 0), str);
      });
    });
    this.activeEdit = undefined;
  }

  async requestInitialBuffer() {
    return this.sendMessage(MessageTypes.MSG_REQUEST);
  }

  editor() {
    const editor = window.visibleTextEditors.find(
      (editor) => editor.document === this.document
    );
    if (!editor) {
      window.showErrorMessage(`Could not find editor for document ${this.document.uri.toString()}`);
      this.close();
      return null;
    }

    return editor;
  }

  updateRemoteClientOffset(clientId: number, offset: number) {
    const client = this.connectedClients.get(clientId)!;
    client.documentOffset = offset;
    const pos = this.document.positionAt(offset);

    const line = this.document.lineAt(pos.line);
    const range = new vscode.Range(new vscode.Position(pos.line, 0), new vscode.Position(pos.line, line.text.length));
    this.editor()?.setDecorations(client.decoration, [{ range }]);
  }

  async handleRemoteInserts(inserts: [Pid, string][], clientId: number) {
    await sequence(inserts, async ([pid, c]) => {
      const i = this.crdt!.insert(pid, c);

      this.updateRemoteClientOffset(clientId, i);
      const pos = this.document.positionAt(i);

      this.activeEdit = {
        kind: 'insert',
        range: new vscode.Range(pos, pos),
        text: c,
      };
      await this.editor()?.edit((editBuilder) => {
        editBuilder.insert(pos, c);
      });
      this.activeEdit = undefined;
    });
  }

  async handleRemoteDeletes(deletes: [Pid, string][], clientId: number) {
    await sequence(deletes, async ([pid, c]) => {
      const i = this.crdt!.delete(pid);
      const pos = this.document.positionAt(i);
      const isDeletingLine: boolean = c === '\n';
      let range = new vscode.Range(pos, pos.translate(0, 1));
      if (isDeletingLine) {
        range = new vscode.Range(pos, pos.translate(1, 0).with(undefined, 0));
      }
      this.activeEdit = {
        kind: 'delete',
        range,
        text: '',
      };
      await this.editor()?.edit((editBuilder) => {
        editBuilder.delete(range);
      });
      this.updateRemoteClientOffset(clientId, this.document.offsetAt(range.start));
      this.activeEdit = undefined;
    });
  }

  async handleAvailableMessage(data: any[]) {
    const [_, isFirst, clientId, sessionShare] = data;

    if (isFirst && !this.isHost) {
      window.showErrorMessage('Error: guest was first to connect');
      this.close();
    }
    if (sessionShare) {
      window.showErrorMessage('Error: session share not implemented');
      this.close();
    }

    this.clientId = clientId;

    if (!this.isHost) {
      this.requestInitialBuffer();
    }
  }

  async handleText(op: any[], clientId: number) {
    switch (op[0]) {
      case protocol.OP_INS:
        const inserts = op[1];
        const i = this.handleRemoteInserts(inserts, clientId);
        break;
      case protocol.OP_DEL:
        const deletes = op[1];
        this.handleRemoteDeletes(deletes, clientId);
        break;
      default:
        break;
    }
  }

  async handleConnectMessage(data: any[]) {
    const [_, clientId, username] = data;

    const decoration = window.createTextEditorDecorationType({
      after: {
        contentText: `        ${username} 👋`,
        color: new vscode.ThemeColor('editorLineNumber.foreground'),
      },
    });
    this.connectedClients.set(clientId, { username, documentOffset: undefined, decoration });
    window.setStatusBarMessage(`${username} joined. Total connected: ${this.connectedClients.size}`);
  }

  async handleDisconnectMessage(data: any[]) {
    const [_, clientId, username] = data;

    this.editor()?.setDecorations(this.connectedClients.get(clientId)!.decoration, []);
    this.connectedClients.delete(clientId);
    window.setStatusBarMessage(`${username} left. Total connected: ${this.connectedClients.size}`);
  }

  async handleMessage(json: any[]) {
    protocol.validateMessage(json);
    switch (json[0]) {
      case MessageTypes.MSG_TEXT:
        const [_m, op, _b, clientId] = json;
        this.operationQueue.push([op, clientId]);
        break;
      case MessageTypes.MSG_AVAILABLE:
        this.handleAvailableMessage(json);
        break;
      case MessageTypes.MSG_INITIAL:
        this.handleInitialMessage(json);
        break;
      case MessageTypes.MSG_CONNECT:
        this.handleConnectMessage(json);
        break;
      case MessageTypes.MSG_DISCONNECT:
        this.handleDisconnectMessage(json);
      case MessageTypes.MSG_REQUEST:
        if (!this.clientId) {
          window.showErrorMessage('Received MSG_REQUEST before MSG_AVAILABLE');
          this.close();
          return;
        }
        this.sendInitialBuffer();
        break;
      default:
        window.showErrorMessage(`Received unhandled message ${JSON.stringify(json)}`);
        break;
    }
  }

  async setupHooks() {
    this.websocket.on('open', () => {
      this.sendInfo();
    });

    this.websocket.on('message', (data: string) => {
      Logger.log(`Received message: ${data}`);
      const json = JSON.parse(data);
      this.handleMessage(json);
    });

    this.websocket.on('error', (error: Error) => {
      window.showErrorMessage(`WebSocket error: ${error.message}`);
      this.close();
    });

    this.websocket.on('close', () => {
      this.close();
    });

    setInterval(() => {
      if (this.activeEdit || this.operationQueue.length === 0) {
        return;
      }

      const [op, clientId] = this.operationQueue.shift()!;
      this.handleText(op, clientId);
    }, 1);
  }
}

export default Client;
