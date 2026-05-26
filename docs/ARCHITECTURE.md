# 🏗️ AI Agent - Architecture Guide

Dokumentasi teknis arsitektur AI Agent.

## 📊 System Architecture

```
┌─────────────────────────────────────────────┐
│         Frontend (React + Vite)              │
│  - Chat Interface                           │
│  - Tool Selection                           │
│  - Message Management                       │
│  http://localhost:5173                      │
└──────────────────┬──────────────────────────┘
                   │ axios/fetch
                   ↓
┌─────────────────────────────────────────────┐
│       Backend (Node.js + Express)            │
│  - API Server                               │
│  - Tool Orchestration                       │
│  - Message Processing                       │
│  http://localhost:3000                      │
└──────────────────┬──────────────────────────┘
                   │
        ┌──────────┼──────────┐
        ↓          ↓          ↓
    ┌───────┐ ┌────────┐ ┌────────┐
    │ Tools │ │ Config │ │ Logger │
    └───────┘ └────────┘ └────────┘
```

## 📁 Folder Structure

### Frontend
```
frontend/
├── src/
│   ├── components/
│   │   └── AIAgent.jsx      # Main chat component
│   ├── App.jsx              # App wrapper
│   ├── main.jsx             # Entry point
│   ├── App.css              # Styles
│   └── index.css            # Global styles
├── index.html               # HTML template
├── package.json             # Dependencies
└── vite.config.js           # Vite config
```

### Backend
```
backend/
├── server.js                # Main server file
├── tools-config.js          # Tool definitions & manager
├── .env                     # Environment variables
├── .env.example             # Template
└── package.json             # Dependencies
```

## 🔄 Request Flow

1. **User sends message** in UI
   ```
   AIAgent.jsx → handleSendMessage()
   ```

2. **Frontend calls backend API**
   ```javascript
   POST /api/agent/process
   {
     message: "user message",
     tools: ["web_search", "api_caller"],
     userId: "user-123"
   }
   ```

3. **Backend processes request**
   ```javascript
   - Validate input
   - Check rate limits
   - Process with tools
   - Generate response
   ```

4. **Backend returns response**
   ```javascript
   {
     message: "response text",
     toolsUsed: ["web_search"],
     timestamp: "2024-05-26T..."
   }
   ```

5. **Frontend displays message**
   ```
   setMessages([...messages, agentMessage])
   ```

## 🛠️ Tools System

### Available Tools

1. **web_search** - Search the internet
2. **code_executor** - Execute code snippets
3. **api_caller** - Call external APIs
4. **slack_integration** - Slack automation
5. **database** - Database queries
6. **email** - Send emails
7. **file_system** - File operations
8. **custom_api** - Custom API integration

### Tool Configuration

Edit `backend/tools-config.js`:

```javascript
export const TOOLS_CONFIG = {
  my_tool: {
    enabled: true,
    name: 'My Tool',
    description: 'What it does',
    config: { /* tool specific config */ },
    permissions: ['read', 'write'],
    rateLimit: { maxPerMinute: 60 }
  }
};
```

## 🔐 Security

### Input Validation
- Message length limits
- Tool validation
- Rate limiting per user/tool

### Permissions
- Read/Write permissions per tool
- User authentication (ready to implement)
- API key protection

### Best Practices
- Store secrets in .env (never in code)
- Validate all inputs from client
- Log all API calls
- Use HTTPS in production

## 🚀 Deployment

### Development
```bash
npm run dev
```

### Production
```bash
npm start
NODE_ENV=production
```

## 📊 Monitoring

### Logging
- Request/response logging
- Error logging
- Tool execution logging

### Metrics to Track
- API response time
- Tool execution time
- Error rate
- User activity

## 🔌 Integration Points

### Frontend → Backend
- Fetch API / Axios
- REST endpoints
- CORS enabled

### Backend → External Services
- Anthropic API (Claude)
- Third-party APIs
- Database connections
- Slack API (optional)

## 🎨 UI Components

### Main Components
- **AIAgent** - Main chat interface
  - Message display
  - Input area
  - Tool sidebar
  - Settings panel

### Features
- Real-time message updates
- Tool selection
- Message history
- Loading states
- Error handling

## 📈 Performance

### Optimization Tips
1. Lazy load components
2. Memoize expensive calculations
3. Debounce API calls
4. Cache API responses
5. Use compression

### Rate Limiting
- Per user limits
- Per tool limits
- Global limits
- Configurable in tools-config.js

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### API Testing
```bash
# Test endpoints
curl http://localhost:3000/api/health
curl -X POST http://localhost:3000/api/agent/process
```

## 🔄 Future Enhancements

- [ ] WebSocket support (real-time)
- [ ] User authentication (JWT)
- [ ] Database persistence
- [ ] Advanced analytics
- [ ] Plugin system
- [ ] Custom tool builder
- [ ] Multi-language support

---

For more details, check individual files or open project in Claude Desktop.
