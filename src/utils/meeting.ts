export function createMeetingId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  const encoded = Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('')
  return `${encoded.slice(0, 4)}-${encoded.slice(4, 8)}-${encoded.slice(8, 12)}`
}
