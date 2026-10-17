// Byte-transfer progress only. The caller confirms durable receipt separately.
export function sendUpload({ url, formData, onTransfer, timing, xhrFactory = () => new XMLHttpRequest() }) {
  return new Promise((resolve, reject) => {
    const xhr = xhrFactory();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onTransfer(Math.min(100, Math.floor(event.loaded * 100 / event.total)));
    };
    xhr.upload.onload = () => onTransfer(100);
    xhr.onload = () => {
      timing?.response({ headers: { get: name => xhr.getResponseHeader(name) } });
      let payload;
      try { payload = JSON.parse(xhr.responseText); }
      catch { reject(new Error('Server response was interrupted. Check upload status before retrying.')); return; }
      timing?.mark('response_body_parsed');
      resolve({ status: xhr.status, payload });
    };
    xhr.onerror = () => reject(new Error('Connection interrupted. Check upload status or retry with the same submission.'));
    xhr.onabort = () => reject(new Error('Upload connection closed.'));
    timing?.mark('request_started');
    xhr.send(formData);
  });
}
