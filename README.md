# Cross-editor collaboration for VS Code

This provides collaborative editing similar to Live Share. Its primary
difference is that it is intended to provide interoperability with Neovim using the
a shared WebSocket protocol based on Logoot.

## Features

- Connect to a running instant session: `> Join Instant Session`
- Start a new instant session: `> Start Instant Session`
- Disconnect from the current instant session: `> Stop Instant Session`

## Extension Settings

- `blue-sentinel.username`: Your username as it appears to others in a sharing session.

## Known Issues

This is still a work in progress. Don't blame me if your document gets eaten
