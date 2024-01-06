import * as vscode from 'vscode';
import { workspace } from 'vscode';
import { window } from 'vscode';
import Server from './server';
import Client from './client';

export function activate(context: vscode.ExtensionContext) {
  const DEFAULT_PORT: number = 8080;

  function parseSessionUrl(url: string | undefined): Thenable<URL | undefined> {
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

	function promptServerUrl(): Thenable<URL | undefined> {
		return window.showInputBox({ prompt: 'Enter server URL' }).then(parseSessionUrl);
	}

  context.subscriptions.push(vscode.commands.registerCommand('instant-code.startServer', (port: number | undefined) => {
    const usedPort = port || DEFAULT_PORT;
    const server = new Server(usedPort);
    console.log(`Instant Code server started on port ${usedPort}`);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('instant-code.startSession', () => {
    promptServerUrl().then((url) => {
      if (url) {
				let documentUri = window.activeTextEditor?.document.uri.toString();
				if (!documentUri) {
					workspace.openTextDocument().then((doc: vscode.TextDocument) => {
						documentUri = doc.uri.toString();
					});
				}

				if (!documentUri) {
					window.showErrorMessage("No active document, and couldn't create a new one");
					return;
				}

				Client.create(documentUri.toString(), url, true);
      }
    });
  }));

  context.subscriptions.push(vscode.commands.registerCommand('instant-code.joinSession', () => {
    promptServerUrl().then((url) => {
      if (url) {
        workspace.openTextDocument().then((doc: vscode.TextDocument) => {
          Client.create(doc.uri.toString(), url, false);
          window.showTextDocument(doc);
        });
      }
    });
  }));
}

export function deactivate() {}