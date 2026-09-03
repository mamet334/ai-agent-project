/**
 * AIAgent/index.jsx — Entry Point (Barrel Export)
 *
 * Struktur modul:
 *   AIAgent.jsx  → Main component (state, auth, send)
 *   helpers/     → workspaceScanner, fileProcessor
 *   hooks/       → useDesktopPreExec, useDesktopInterceptor
 *   ui/          → LoginForm, ChatSidebar, ChatMessageList, ChatInputArea, RightPanel
 *   modals/      → CronModal, SettingsModal, RagModal
 *
 * Komponen pendukung (diimport AIAgent.jsx):
 *   ../../chat/ChatHeader     → chat/ChatHeader.jsx
 *   ../../chat/ChatInput      → chat/ChatInput.jsx
 *   ../../chat/ChatMessages   → chat/ChatMessages.jsx
 *   ../../layout/Sidebar      → layout/Sidebar.jsx
 *
 * DEBUG FLOW — langsung ke file yang tepat:
 *   1. Auth/login gagal      → AIAgent.jsx :: useEffect(supabase.auth)
 *   2. Chat tidak tersimpan  → AIAgent.jsx :: fetchChats / handleSendMessage
 *   3. File attach error     → helpers/fileProcessor.js
 *   4. Workspace scan hang   → helpers/workspaceScanner.js
 *   5. Terminal tidak jalan  → hooks/useDesktopPreExec.js
 *   6. Interceptor miss      → hooks/useDesktopInterceptor.js
 *   7. Sidebar tidak muncul  → layout/Sidebar.jsx
 *   8. Pesan tidak render    → chat/ChatMessages.jsx
 *   9. Input tidak kirim     → chat/ChatInput.jsx
 *  10. Header salah tampil   → chat/ChatHeader.jsx
 *  11. Inspector kosong      → ui/RightPanel.jsx
 *  12. Cron tidak tersimpan  → modals/CronModal.jsx
 *  13. RAG upload gagal      → modals/RagModal.jsx
 *  14. BYOK key hilang       → modals/SettingsModal.jsx
 */

// ── Main Component (default export) ──────────────────────────────────
export { default } from './AIAgent';

// ── Helpers ──────────────────────────────────────────────────────────
export { scanWorkspaceFiles, buildWorkspaceTree } from './helpers/workspaceScanner';
export { processAttachedFile } from './helpers/fileProcessor';

// ── Hooks ─────────────────────────────────────────────────────────────
export { runDesktopPreExec } from './hooks/useDesktopPreExec';
export { runDesktopInterceptors } from './hooks/useDesktopInterceptor';

// ── UI Components ─────────────────────────────────────────────────────
export { default as LoginForm } from './ui/LoginForm';
export { default as ChatSidebar } from './ui/ChatSidebar';
export { default as ChatMessageList } from './ui/ChatMessageList';
export { default as ChatInputArea } from './ui/ChatInputArea';
export { default as RightPanel } from './ui/RightPanel';

// ── Modals ────────────────────────────────────────────────────────────
export { default as CronModal } from './modals/CronModal';
export { default as SettingsModal } from './modals/SettingsModal';
export { default as RagModal } from './modals/RagModal';
