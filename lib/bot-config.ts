// ─── Campaign-based bot configuration ───
// Single BR campaign for now. Lab/experiments (Phase 2) will replace this
// static config with dynamic variants stored in Postgres.

export interface NicheGroup {
  category: string
  items: readonly string[]
}

/**
 * Optional pre-message qualification filters applied by the prospect-bot
 * during collect/score before any project or outreach is generated.
 *
 * - `minRating`: drop leads with `rating < minRating`. Null rating treated
 *   as below threshold.
 * - `recentReviewMonths`: drop leads whose newest review is older than N
 *   months. Uses `reviews[0].time` (Unix seconds).
 * - `requireOperational`: drop anything other than `business_status ==
 *   'OPERATIONAL'`.
 * - `franchiseBlacklist`: substring match (case-insensitive, accent-folded)
 *   against `business_name`. Any hit disqualifies.
 */
export interface QualificationFilters {
  minRating?: number
  recentReviewMonths?: number
  requireOperational?: boolean
  franchiseBlacklist?: readonly string[]
}

export interface CountryConfig {
  code: string
  name: string
  flag: string
  country: 'BR'
  lang: string
  channel: 'whatsapp'
  niches: readonly NicheGroup[]
  cities: readonly string[]
  qualificationFilters?: QualificationFilters
}

export const COUNTRIES: readonly CountryConfig[] = [
  {
    code: 'BR',
    name: 'Brasil',
    flag: '🇧🇷',
    country: 'BR',
    lang: 'pt',
    channel: 'whatsapp',
    niches: [
      {
        category: 'Foco atual',
        items: [
          'nutricionistas',
          'psicólogos',
          'fisioterapeutas',
        ],
      },
    ],
    cities: [
      // ── Prioridade 1 — Interior SP ──
      'Campinas, SP', 'Santo André, SP', 'Ribeirão Preto, SP',
      'Osasco, SP', 'Sorocaba, SP', 'São Bernardo do Campo, SP',
      'São José dos Campos, SP', 'Mogi das Cruzes, SP', 'Piracicaba, SP',
      'Bauru, SP', 'São Vicente, SP', 'Santos, SP', 'Guarujá, SP',
      'Limeira, SP', 'Taubaté, SP', 'Praia Grande, SP', 'Suzano, SP',
      'Carapicuíba, SP', 'Franca, SP', 'São Carlos, SP', 'Araraquara, SP',
      'Marília, SP', 'Presidente Prudente, SP', 'Americana, SP',
      'Araçatuba, SP', 'Barretos, SP', 'Botucatu, SP', 'Catanduva, SP',
      'Hortolândia, SP', 'Indaiatuba, SP', 'Itu, SP', 'Itapetininga, SP',
      'Jacareí, SP', 'Jundiaí, SP', 'Ourinhos, SP', 'Paulínia, SP',
      'Registro, SP', 'Rio Claro, SP', 'Santa Bárbara d\'Oeste, SP',
      'Sertãozinho, SP', 'Sumaré, SP', 'Taboão da Serra, SP',
      'Valinhos, SP', 'Vinhedo, SP', 'Votuporanga, SP',
      // ── Prioridade 2 — Interior Sul (PR, SC, RS) ──
      'Joinville, SC', 'Londrina, PR', 'Maringá, PR', 'Caxias do Sul, RS',
      'Blumenau, SC', 'Pelotas, RS', 'Ponta Grossa, PR', 'Cascavel, PR',
      'Santa Maria, RS', 'Foz do Iguaçu, PR', 'Novo Hamburgo, RS',
      'São Leopoldo, RS', 'Canoas, RS', 'Chapecó, SC', 'Itajaí, SC',
      'Passo Fundo, RS', 'Gravataí, RS', 'Viamão, RS', 'Umuarama, PR',
      'Apucarana, PR', 'Guarapuava, PR', 'Toledo, PR', 'Paranaguá, PR',
      'São José, SC', 'Criciúma, SC', 'Lages, SC', 'Balneário Camboriú, SC',
      // ── Prioridade 3 — Interior MG, GO, MT, MS, ES ──
      'Uberlândia, MG', 'Contagem, MG', 'Juiz de Fora, MG',
      'Aparecida de Goiânia, GO', 'Ribeirão das Neves, MG', 'Betim, MG',
      'Anápolis, GO', 'Montes Claros, MG', 'Cuiabá, MT',
      'Várzea Grande, MT', 'Rondonópolis, MT', 'Dourados, MS',
      'Três Lagoas, MS', 'Corumbá, MS', 'Serra, ES', 'Vila Velha, ES',
      'Cariacica, ES', 'Sete Lagoas, MG', 'Divinópolis, MG',
      'Ipatinga, MG', 'Uberaba, MG', 'Governador Valadares, MG',
      'Patos de Minas, MG', 'Poços de Caldas, MG', 'Varginha, MG',
      // ── Prioridade 4 — Interior NE/N ──
      'Feira de Santana, BA', 'Caruaru, PE', 'Petrolina, PE',
      'Juazeiro do Norte, CE', 'Imperatriz, MA', 'Mossoró, RN',
      'Campina Grande, PB', 'Arapiraca, AL', 'Ilhéus, BA',
      'Vitória da Conquista, BA', 'Santarém, PA', 'Marabá, PA',
      'Parauapebas, PA', 'Palmas, TO', 'Porto Velho, RO', 'Macapá, AP',
      'Rio Branco, AC', 'Boa Vista, RR', 'Aracaju, SE', 'Teresina, PI',
      'Natal, RN', 'João Pessoa, PB', 'São Luís, MA', 'Maceió, AL',
      // ── Prioridade 5 — Capitais médias ──
      'Florianópolis, SC', 'Vitória, ES', 'Curitiba, PR',
      'Porto Alegre, RS', 'Campo Grande, MS', 'Goiânia, GO',
      'Belém, PA', 'Manaus, AM', 'Recife, PE', 'Fortaleza, CE',
      // ── Prioridade 6 — Grandes capitais (por último) ──
      'Salvador, BA', 'Brasília, DF', 'Rio de Janeiro, RJ', 'São Paulo, SP',
    ],
  },
] as const

export function getCountry(code: string): CountryConfig | undefined {
  return COUNTRIES.find(c => c.code === code)
}
