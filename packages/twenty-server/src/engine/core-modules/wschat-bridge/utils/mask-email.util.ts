// Logs keep only enough of an address to correlate calls, never the full e-mail
export const maskEmail = (email: string) => {
  const [localPart, domain] = email.split('@');

  return `${localPart.charAt(0)}***@${domain ?? ''}`;
};
