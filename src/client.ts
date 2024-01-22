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
  buffer: [number, number] | undefined;
  crdt: CRDT | undefined;
  document: vscode.TextDocument;
  subscriptions: vscode.Disposable[] = [];
  activeEdit: { kind: 'insert' | 'delete', range: vscode.Range, text: string } | undefined;
  connectedClients = new Map<number, RemoteClient>();

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
    const ws = new WebSocket(url, 'chat');
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
      pids: [pid.make(0, 0), pid.make(1, 0), pid.make(pid.MAX_PID, 0)],
      lines: [''],
    });

    const pids = this.document.getText().split('').map((c: string, i: number) => {
      const pid = this.crdt!.pidForInsert(100, this.document.offsetAt(new vscode.Position(0, i)));
      this.crdt!.insert(pid, c);
    });
  }

  async sendInsert(p: Pid, c: string) {
    return this.sendMessage(MessageTypes.MSG_TEXT, [protocol.OP_INS, c, pid.serializable(p)], this.buffer!, this.clientId!);
  }

  async sendDelete(p: Pid, c: string) {
    return this.sendMessage(MessageTypes.MSG_TEXT, [protocol.OP_DEL, c, pid.serializable(p)], this.buffer!, this.clientId!);
  }

  async insertFromContentChange(change: vscode.TextDocumentContentChangeEvent) {
    const pos = this.document.positionAt(change.rangeOffset);
    await sequence(change.text.split(''), async (c, i) => {
      // PID 0 is the beginning of the _document_, but the beginning of the first _line_ is PID 1.
      const offset = this.document.offsetAt(pos.translate(0, i));
      const p = this.crdt!.pidForInsert(this.clientId!, offset);
      this.crdt!.insert(p, c);
      await this.sendInsert(p, c);
    });
  }

  async deleteFromContentChange(change: vscode.TextDocumentContentChangeEvent) {
    const deletedIndices = Array(change.rangeLength).fill(0).map((_, i) => i + change.rangeOffset);
    const deletedPids = deletedIndices.map((i) => this.crdt!.pidAt(i)!);
    await sequence(deletedPids, async (p) => {
      await this.sendDelete(p, this.crdt!.charAt(p)!);
      this.crdt!.delete(p);
    });
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

        await this.insertFromContentChange(change);
      } else if (change.rangeLength > 0) {
        if (this.activeEdit?.kind === 'delete' && change.range.isEqual(this.activeEdit.range) && change.text === '') {
          return;
        }

        // Handle a replace as a delete followed by an insert
        await this.deleteFromContentChange(change);
        await this.insertFromContentChange(change);
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
    protocol.validateMessage([messageType, ...data]);
    return this.websocket.send(JSON.stringify([messageType, ...data]));
  }

  async sendInfo() {
    let username = vscode.workspace.getConfiguration('instant-code').get('username');
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

    // Decorate line with 👋
    const line = this.document.lineAt(pos.line);
    const range = new vscode.Range(new vscode.Position(pos.line, 0), new vscode.Position(pos.line, line.text.length));
    this.editor()?.setDecorations(client.decoration, [{ range }]);
  }

  async handleRemoteInsert(pid: Pid, c: string, clientId: number) {
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
  }

  handleRemoteDelete(pid: Pid, c: string, clientId: number) {
    const i = this.crdt!.delete(pid);
    this.updateRemoteClientOffset(clientId, i);
    const pos = this.document.positionAt(i);
    this.activeEdit = {
      kind: 'delete',
      range: new vscode.Range(pos, pos.translate(0, 1)),
      text: '',
    };
    this.editor()?.edit((editBuilder) => {
      editBuilder.delete(new vscode.Range(pos, pos.translate(0, 1)));
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
    let _op, c, pid;

    switch (op[0]) {
      case protocol.OP_INS:
        [_op, c, pid] = op;
        const i = this.handleRemoteInsert(pid, c, clientId);
        break;
      case protocol.OP_DEL:
        [_op, c, pid] = op;
        this.handleRemoteDelete(pid, c, clientId);
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
    window.showInformationMessage(`${username} joined. Total connected: ${this.connectedClients.size}`);
  }

  async handleDisconnectMessage(data: any[]) {
    const [_, clientId, username] = data;

    this.connectedClients.delete(clientId);
    window.showInformationMessage(`${username} left. Total connected: ${this.connectedClients.size}`);
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
      const json = JSON.parse(data);
      // TODO: validate json against schema
      this.handleMessage(json);
    });

    this.websocket.on('error', (error: Error) => {
      window.showErrorMessage(`WebSocket error: ${error.message}`);
      this.close();
    });

    this.websocket.on('close', () => {
      this.close();
    });
  }
}

export default Client;