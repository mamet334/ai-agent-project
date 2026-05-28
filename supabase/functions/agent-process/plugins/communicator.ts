export default {
  name: 'communicator',
  description: 'Mengirim pesan Slack atau memanggil API eksternal.',
  execute: async ({ task }) => {
    // Simulasi aksi eksternal
    return {
      output: `[Simulasi Edge Function] Aksi Komunikasi diselesaikan untuk tugas: ${task}`
    };
  }
};
