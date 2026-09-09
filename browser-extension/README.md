# DictAI for YouTube

Install this unpacked extension once in Chrome, Edge or Opera. Open a normal YouTube video: DictAI appears as a right-side practice panel, loads that video's English caption track once in the user's browser, and reuses it from browser storage afterward. The toolbar icon shows or hides the panel.

The extension requests access only to `https://www.youtube.com/*` so it can add the panel, read the current player's caption-track metadata and request that current track from YouTube in the same browser session. It does not use a server transcript collector, proxy, cookie export, audio download, bulk crawler or background scheduler. It never preloads unrelated videos. DictAI's remote frame receives the caption text for local segmentation, answers and progress storage; its server only serves code/assets and does not receive those operations.

YouTube's caption URL is not a stable public third-party API. A layout/player change, unavailable caption, account/region restriction or YouTube refusal can still make a video fail. The extension stops and shows the error; it does not loop or change IP addresses. The official API is not used because downloading captions through it requires permission to edit the video.

The panel currently targets `https://192.168.0.68:8771`. Accept that server's certificate in the same browser before use. Store publication and automatic installation are not claimed.
