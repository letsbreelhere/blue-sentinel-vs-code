import * as vscode from 'vscode';
import { window, env } from 'vscode';
import WebSocket from 'ws';

import Logger from './logger';
import { CRDT } from './crdt';
import * as pid from './pid';
import { Pid } from './pid';
import * as protocol from './protocol';
import { MessageTypes } from './protocol';

// eslint-disable-next-line @typescript-eslint/naming-convention

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
    Logger.log(`Sending insert: ${p} ${c}`);
    return this.sendMessage(MessageTypes.MSG_TEXT, [protocol.OP_INS, c, pid.serializable(p)], this.buffer!, this.clientId!);
  }

  async sendDelete(p: Pid, c: string) {
    Logger.log(`Sending delete: ${p} ${c}`);
    return this.sendMessage(MessageTypes.MSG_TEXT, [protocol.OP_DEL, pid.serializable(p), c], this.buffer!, this.clientId!);
  }

  async insertFromContentChange(change: vscode.TextDocumentContentChangeEvent) {
    const pos = this.document.positionAt(change.rangeOffset);
    const promises = change.text.split('').map(async (c, i) => {
      // PID 0 is the beginning of the _document_, but the beginning of the first _line_ is PID 1.
      const offset = this.document.offsetAt(pos.translate(0, i));
      const p = this.crdt!.pidForInsert(this.clientId!, offset);
      Logger.log(`Inserting ${c} at ${offset} with PID ${pid.show(p)}`);
      this.crdt!.insert(p, c);
      await this.sendInsert(p, c);
    });
    await promises.reduce((p, c) => p.then(() => c), Promise.resolve());
  }

  async deleteFromContentChange(change: vscode.TextDocumentContentChangeEvent) {
    const deletedIndices = Array(change.rangeLength).fill(0).map((_, i) => i + change.rangeOffset);
    const deletedPids = deletedIndices.map((i) => this.crdt!.pidAt(i));
    const promises = deletedPids.map(async (p) => {
      await this.sendDelete(p, this.crdt!.charAt(p)!);
      this.crdt!.delete(p);
    });
    await promises.reduce((p, c) => p.then(() => c), Promise.resolve());
  }

  async handleTextChange(e: vscode.TextDocumentChangeEvent) {
    if (e.document !== this.document) {
      return;
    }

    const changes = e.contentChanges;

    const promises = changes.map(async (change) => {
      if (change.rangeLength === 0) {
        if (this.activeEdit?.kind === 'insert' && change.rangeOffset === this.activeEdit.range.start.character) {
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
        Logger.log(`Unknown change: ${JSON.stringify(change)}`);
      }
    });

    await promises.reduce((p, c) => p.then(() => c), Promise.resolve());
  }

  close() {
    Logger.log('Closing client');
    this.websocket.removeAllListeners();
    this.subscriptions.forEach((s) => s.dispose());
    this.websocket.close();
  }

  async sendMessage(messageType: number, ...data: any) {
    Logger.log(`Sending message ${messageType}: ${JSON.stringify(data)}`);
    protocol.validateMessage([messageType, ...data]);
    return this.websocket.send(JSON.stringify([messageType, ...data]));
  }

  async sendInfo() {
    return this.sendMessage(
      MessageTypes.MSG_INFO,
      false, // session_share is not implemented
      vscode.workspace.getConfiguration('instant-code').get('username'),
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

  async handleRemoteInsert(pid: Pid, c: string, clientId: number) {
    const i = this.crdt!.insert(pid, c);
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
        // 🤦
        [_op, pid, c] = op;
        this.handleRemoteDelete(pid, c, clientId);
        break;
      default:
        Logger.log(`Received unhandled text operation ${op}`);
        break;
    }
  }

  async handleConnectMessage(data: any[]) {
    const [_, clientId, username] = data;
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
      case MessageTypes.MSG_REQUEST:
        if (!this.clientId) {
          Logger.log('Error: received MSG_REQUEST before MSG_AVAILABLE');
          window.showErrorMessage('Error: received MSG_REQUEST before MSG_AVAILABLE');
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
}

export default Client;