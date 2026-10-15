// Same shape check as the backend's helpers/emailValidator.js isAccountEmail
// (and sign-up): name@domain.tld, so name+tag@gmail.com is accepted.
const isAccountEmail = (email) => typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export default isAccountEmail;
