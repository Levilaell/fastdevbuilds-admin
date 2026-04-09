/**
 * Extract the city name from a Google Places address string.
 * Example: "R. Carolina Soares, 108 - Limão, São Paulo - SP, 02554-000, Brazil"
 * → "São Paulo"
 */
export function extractCity(address: string): string | null {
  const parts = address.split(',')
  if (parts.length < 3) return null
  const segment = parts[parts.length - 3].trim() // "São Paulo - SP"
  const city = segment.replace(/\s*-\s*[A-Z]{2}$/, '').trim()
  return city || null
}
