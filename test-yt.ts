import { YoutubeTranscript } from 'https://esm.sh/youtube-transcript@1.2.1';
YoutubeTranscript.fetchTranscript('YtDI-dXfP5Q').then(res => console.log(res.slice(0, 3))).catch(console.error);
