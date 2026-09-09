# DictAI Caption Bridge

In Chrome / Edge, open Extensions → Manage extensions, enable Developer mode, click Load unpacked and select this folder. Reload DictAI in the same browser.

Start in DictAI's YouTube page: paste a link → Open YouTube. On YouTube, show its transcript and timestamps, choose the intended caption language, then click this extension → Send displayed transcript.

The extension reads only displayed transcript text and timestamps on your explicit click. It does not fetch caption endpoints, extract cookies, record audio, or send transcripts to the DictAI server. If YouTube does not display a transcript, it cannot import one. Visible start times imply approximate clip ends. Browser-local processing and persistence happen in DictAI.

Supported sites: https://192.168.0.68:8771/youtube, https://192.168.0.68:8775/youtube, http://127.0.0.1:8771/youtube, http://localhost:8771/youtube. No store installation or embedded-browser compatibility is claimed.

Permissions: activeTab (current YouTube page on click), scripting (read its displayed transcript), storage (temporary receiving-tab metadata). No YouTube-wide background access. Code is packaged here, not loaded remotely.
