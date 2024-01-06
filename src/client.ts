import * as vscode from 'vscode';
import { window, env } from 'vscode';
import console from './logger';

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