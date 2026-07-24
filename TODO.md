# TODO: Fix Auto-New-Chat Bug on Refresh/Idle

## Status Tracking

### Phase 1: ConversationEngine.jsx - Persistensi & Restore
- [x] 1.1 Simpan `currentChatId` ke localStorage setiap kali berubah
- [x] 1.2 Restore `currentChatId` dari localStorage pada mount
- [x] 1.3 Load messages dari Supabase otomatis setelah restore
- [x] 1.4 Guard `handleNewChat` dengan `useRef` anti-auto-trigger
- [x] 1.5 Tambah `useEffect` untuk sinkronasi sessionId

### Phase 2: ChatHistory.jsx - Optimasi Refresh
- [x] 2.1 Hapus auto-refresh yang tidak perlu saat `activeChatId` berubah
- [x] 2.2 Tambah loading state yang lebih akurat (menggunakan state lokal, tanpa fetch ulang)

### Phase 3: Testing
- [x] 3.1 Verifikasi refresh tidak membuat chat baru — Guard `isNewChatInitiatedByUser` + persist `currentChatId` ke localStorage
- [x] 3.2 Verifikasi restore state chat setelah refresh — `useState` initializer membaca localStorage, `useEffect` mount memuat messages dari Supabase
- [x] 3.3 Verifikasi sidebar tidak refresh berlebihan — ganti `fetchChats()` dengan update state lokal `isActive`
