export function sanitizeDealMessage(text: string): { sanitizedText: string; hasRedactions: boolean } {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
  const phoneRegex = /(\+?\d{1,4}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
  const urlRegex = /(https?:\/\/)?(www\.)?[a-zA-Z0-9-]+\.(com|io|co|net|org|app|dev)(\/[^\s]*)?/gi;
  const handleRegex = /(telegram|tg|whatsapp|wa|discord|twitter|x\.com|instagram)\s*[:@\-\s]+\w+/gi;

  let sanitizedText = text
    .replace(emailRegex, '[Email Redacted for Security]')
    .replace(phoneRegex, '[Phone Redacted for Security]')
    .replace(urlRegex, '[External Link Redacted]')
    .replace(handleRegex, '[Handle Redacted]');

  return {
    sanitizedText,
    hasRedactions: sanitizedText !== text
  };
}