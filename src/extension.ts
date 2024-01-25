import * as vscode from 'vscode';
import { workspace } from 'vscode';
import { window } from 'vscode';
import Server from './server';
import Client from './client';

export function activate(context: vscode.ExtensionContext) {
	const DEFAULT_PORT: number = 8080;

	async function parseSessionUrl(url: string | undefined): Promise<URL | undefined> {
		if (!url) {
			return Promise.resolve(undefined);
		}

		let attachUrl = url;
		if (!attachUrl.match(/^[a-zA-Z]+?:\/\//)) {
			attachUrl = `ws://${attachUrl}`;
		}

		const parsedUrl = new URL(attachUrl);

		if (!parsedUrl.port) {
			parsedUrl.port = DEFAULT_PORT.toString();
		}

		return Promise.resolve(parsedUrl);
	}

	async function promptServerUrl(): Promise<URL | undefined> {
		const url = await window.showInputBox({ prompt: 'Enter server URL' });
		return parseSessionUrl(url);
	}

	context.subscriptions.push(vscode.commands.registerCommand('blue-sentinel.startSession', async () => {
		const url = await promptServerUrl();
		if (url) {
			let document = window.activeTextEditor?.document;
			if (!document) {
				await workspace.openTextDocument().then(async (doc: vscode.TextDocument) => {
					document = doc;
          await window.showTextDocument(doc);
				});
			}

			if (!document) {
				window.showErrorMessage("No active document, and couldn't create a new one");
				return;
			}

			Client.create(document, url, true);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('blue-sentinel.joinSession', async () => {
		const url = await promptServerUrl();
		if (url) {
			const doc = await workspace.openTextDocument();
      const client = await Client.create(doc, url, false);
      window.showTextDocument(doc);
      workspace.onDidCloseTextDocument((doc: vscode.TextDocument) => {
        if (doc.uri.toString() === url.toString()) {
          client.close();
        }
      });
		}
	}));

  context.subscriptions.push(vscode.commands.registerCommand('blue-sentinel.stopSession', async () => {
    const document = window.activeTextEditor?.document;
    if (!document) {
      window.showErrorMessage('No active document');
      return;
    }

    const client = Client.forDocument(document);

    if (!client) {
      window.showErrorMessage('No active session for this document');
      return;
    } else {
      client.close();
      window.setStatusBarMessage('Session stopped');
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('blue-sentinel.startServer', async () => {
    const portConfig: string | undefined = vscode.workspace.getConfiguration('blue-sentinel').get('port');
    let port = portConfig ? parseInt(portConfig) : await window.showInputBox({ prompt: 'Enter port for server' }).then((port: string | undefined) => port && parseInt(port));
    if (!port) {
      window.showErrorMessage('No port specified');
      return;
    }
    if (Server.singleton) {
      window.showErrorMessage(`Server already started at ${Server.singleton.port}`);
      return;
    }
    const server = Server.create(port);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('blue-sentinel.stopServer', async () => {
    const server = Server.singleton;
    if (!server) {
      window.showErrorMessage('No server running');
      return;
    }
    server.close();
    window.setStatusBarMessage('Instant Code server stopped');
  }));
}

export function deactivate() { }