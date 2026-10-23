import { Unzip, UnzipInflate } from 'fflate';

function safeName(value, policy, allowDirectory = false) {
  const path = value.normalize('NFC');
  if (!path || new TextEncoder().encode(path).length > policy.pathBytes || /[\\%?#:]/.test(path) || [...path].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) || path.startsWith('/') || path.split('/').some((p, i, a) => (!p && !(allowDirectory && i === a.length - 1)) || p === '.' || p === '..')) throw new Error(`Unsafe ZIP path: ${value}`);
  return path;
}
function entriesOf(bytes, policy) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < Math.max(0, bytes.length - 65557)) throw new Error('Invalid ZIP archive.');
  const count = view.getUint16(end + 10, true), offset = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || count === 65535 || offset === 0xffffffff || count > policy.fileCount * 4) throw new Error('Split, ZIP64 or oversized archives are unsupported.');
  const files = []; const seen = new Set(); let cursor = offset;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Invalid ZIP directory.');
    const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true), size = view.getUint32(cursor + 24, true);
    const length = view.getUint16(cursor + 28, true), extra = view.getUint16(cursor + 30, true), comment = view.getUint16(cursor + 32, true);
    if (cursor + 46 + length + extra + comment > bytes.length) throw new Error('Invalid ZIP entry.');
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(cursor + 46, cursor + 46 + length));
    const directory = name.endsWith('/'), unixType = (view.getUint32(cursor + 38, true) >>> 16) & 0xf000;
    if (flags & 1 || ![0, 8].includes(method) || (unixType && unixType !== 0x8000 && !(directory && unixType === 0x4000))) throw new Error('Encrypted files, symlinks and unsupported ZIP methods are not allowed.');
    const path = safeName(name, policy, directory);
    if (seen.has(path)) throw new Error('Duplicate ZIP path.'); seen.add(path);
    if (!directory && !path.split('/').some(p => p === '__MACOSX' || p === '.DS_Store')) files.push({ name, path, size });
    cursor += 46 + length + extra + comment;
  }
  if (!files.length || files.length > policy.fileCount) throw new Error('ZIP contains too many files, or no website files.');
  let prefix = '';
  if (!files.some(f => f.path === 'index.html')) {
    const folder = files[0].path.split('/')[0];
    if (files.every(f => f.path.startsWith(`${folder}/`)) && files.some(f => f.path === `${folder}/index.html`)) prefix = `${folder}/`;
  }
  let total = 0;
  for (const f of files) {
    f.path = f.path.slice(prefix.length);
    const top = f.path.split('/')[0].toLowerCase();
    if (['api', 'admin', '_next', '__website-preview', 'sw.js', 'service-worker.js'].includes(top)) throw new Error(`Reserved preview path: ${f.path}`);
    if (!policy.mime[f.path.split('.').pop().toLowerCase()]) throw new Error(`Unsupported website file: ${f.path}`);
    if (f.size > policy.fileBytes) throw new Error(`File exceeds the size limit: ${f.path}`);
    total += f.size;
  }
  if (total > policy.totalBytes || !files.some(f => f.path === 'index.html')) throw new Error('ZIP must have index.html and fit within the website size limit.');
  return files;
}
export function extractWebsite(bytes, policy) {
  if (bytes.length > policy.zipBytes) throw new Error('ZIP exceeds the compressed size limit.');
  const entries = entriesOf(bytes, policy), expected = new Map(entries.map(f => [f.name, f])), output = []; let total = 0;
  const zip = new Unzip(file => {
    const entry = expected.get(file.name); if (!entry) return;
    const chunks = []; let size = 0;
    file.ondata = (error, data, final) => {
      if (error) throw error;
      size += data.length; total += data.length;
      if (size > policy.fileBytes || total > policy.totalBytes || size > entry.size) throw new Error('ZIP expansion exceeds the declared size limit.');
      chunks.push(data);
      if (final) {
        if (size !== entry.size || output.some(f => f.path === entry.path)) throw new Error('ZIP content does not match its directory.');
        const content = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.length; }
        output.push({ path: entry.path, size, buffer: content.buffer });
      }
    };
    file.start();
  });
  zip.register(UnzipInflate);
  for (let start = 0; start < bytes.length; start += 65536) zip.push(bytes.subarray(start, start + 65536), start + 65536 >= bytes.length);
  if (output.length !== entries.length) throw new Error('ZIP extraction was incomplete.');
  return output;
}
