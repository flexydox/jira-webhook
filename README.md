# Jira Webhook Server

This is a basic Jira webhook server built with Node.js and TypeScript.

## Features
- Express server with TypeScript
- `/webhook` endpoint to receive Jira webhooks

## Getting Started

1. **Install dependencies:**
   ```sh
   npm install
   ```
2. **Build the project:**
   ```sh
   npm run build
   ```
3. **Start the server:**
   ```sh
   npm start
   ```
4. **Development mode (auto-reload):**
   ```sh
   npm run dev
   ```

The server will listen on port 3000 by default.

## Webhook Endpoint
- POST `/webhook`
- Logs the received payload to the console.

---
