/* global globalThis */
/* eslint-env worker */
import { extractWebsite } from '../helpers/websitePreviewArchive';
globalThis.onmessage = event => {
  try {
    const files = extractWebsite(new Uint8Array(event.data.buffer), event.data.policy);
    globalThis.postMessage({ files }, files.map(file => file.buffer));
  } catch (error) { globalThis.postMessage({ error: error.message || 'Website ZIP could not be extracted.' }); }
};
