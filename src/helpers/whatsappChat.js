// Keep contact interpretation consistent with backend/helpers/whatsappQueue.js.
export function whatsappChatHref(raw) {
  const phone = String(raw || '').replace(/[\s\-().]/g, '');
  let number = null;
  if (/^[6-9]\d{9}$/.test(phone)) number = `91${phone}`;
  else if (/^0[6-9]\d{9}$/.test(phone)) number = `91${phone.slice(1)}`;
  else if (/^(\+|00)?91[6-9]\d{9}$/.test(phone)) number = phone.replace(/^(\+|00)/, '');
  else if (/^(\+|00)(?!91)[1-9]\d{9,14}$/.test(phone)) number = phone.replace(/^(\+|00)/, '');
  return number ? `https://wa.me/${number}` : null;
}
