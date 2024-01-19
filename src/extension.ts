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

	async function checkUsernameExists(): Promise<boolean> {
		if (vscode.workspace.getConfiguration('instant-code').get('username')) {
			return Promise.resolve(true);
		}

    await window.showErrorMessage('Please set your username in the Instant Code extension settings');
		return false;
	}

	async function promptServerUrl(): Promise<URL | undefined> {
		const url = await window.showInputBox({ prompt: 'Enter server URL' });
		return parseSessionUrl(url);
	}

	context.subscriptions.push(vscode.commands.registerCommand('instant-code.startServer', async (port: number | undefined) => {
		await checkUsernameExists();
		const usedPort = port || DEFAULT_PORT;
		const server = new Server(usedPort);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('instant-code.startSession', async () => {
		await checkUsernameExists();
		const url = await promptServerUrl();
		if (url) {
			let document = window.activeTextEditor?.document;
			if (!document) {
				workspace.openTextDocument().then((doc: vscode.TextDocument) => {
					document = doc;
				});
			}

			if (!document) {
				window.showErrorMessage("No active document, and couldn't create a new one");
				return;
			}

			Client.create(document, url, true);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('instant-code.joinSession', async () => {
		await checkUsernameExists();
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
}

export function deactivate() { }