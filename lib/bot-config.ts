// ─── Campaign-based bot configuration ───
// Each entry = one (country, channel) campaign. To add a new campaign add an
// entry to COUNTRIES. `code` is the stable identifier the bot receives as
// --market and the UI persists in state.

export interface NicheGroup {
  category: string
  items: readonly string[]
}

/**
 * Optional pre-message qualification filters applied by the prospect-bot
 * during collect/score before any project or outreach is generated.
 *
 * - `minRating`: drop leads with `rating < minRating`. Null rating is treated
 *   as below threshold (no Google traction → no signal of being active).
 * - `recentReviewMonths`: drop leads whose newest review is older than N
 *   months. Uses `reviews[0].time` (Unix seconds) from Place Details.
 *   Implies the business is dead/abandoned even if not flagged closed.
 * - `requireOperational`: drop anything other than `business_status ==
 *   'OPERATIONAL'` (rejects CLOSED_TEMPORARILY and CLOSED_PERMANENTLY).
 * - `franchiseBlacklist`: substring match (case-insensitive, accent-folded)
 *   against `business_name`. Any hit disqualifies. Use to exclude national
 *   chains where the local franchisee lacks budget authority.
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
  country: 'BR' | 'US'
  lang: string
  channel: 'whatsapp' | 'email' | 'sms'
  niches: readonly NicheGroup[]
  cities: readonly string[]
  /**
   * When true, the bot creates a Project (with Claude Code prompt) instead
   * of dispatching outreach. Levi runs Claude Code locally, pastes the
   * preview URL, then admin sends the cold message with URL embedded.
   * Mirrors the US-WA flow.
   */
  previewFirst?: boolean
  /**
   * Optional pre-qualification filters applied by the bot before scoring.
   * Independent of pain_score / opportunity_score (those run after).
   */
  qualificationFilters?: QualificationFilters
}

/**
 * Franchise/chain names blacklisted across aesthetic clinics (BR).
 * Local franchisees lack budget authority and the chain typically has a
 * national web presence already, so neither side of the funnel converts.
 *
 * Match is substring + case-insensitive + accent-folded — see prospect-bot's
 * qualify step for the actual matcher. To add a name discovered during
 * outreach, edit this list and redeploy admin (the bot reads it via
 * externalConfig).
 */
export const ESTHETICS_FRANCHISE_BLACKLIST_BR: readonly string[] = [
  'Onodera',
  'Jacques Janine',
  'Body Lab',
  'Body Tech',
  'Dr. Hair',
  "L'Officiel",
  'Espaço Laser',
  'Espaçolaser',
  'Vialaser',
  'Pello Menos',
  'Spazio Laser',
  'Belezix',
  'Beleza Natural',
] as const

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
        category: 'Alta prioridade',
        items: [
          'clínicas odontológicas',
          'clínicas de estética',
          'clínicas veterinárias',
          'clínicas de psicologia',
          'imobiliárias',
          'escritórios de contabilidade',
        ],
      },
      {
        category: 'Média prioridade',
        items: [
          'academias',
          'estúdios de pilates',
          'salões de beleza',
          'barbearias',
          'pet shops',
          'autoescolas',
          'escolas de idiomas',
          'clínicas médicas',
          'fisioterapeutas',
          'nutricionistas',
        ],
      },
      {
        category: 'Baixa prioridade',
        items: [
          'restaurantes',
          'padarias e confeitarias',
          'lojas de roupas',
          'floriculturas',
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
  // ─── BR-WA-PREVIEW: BR preview-first replica of US-WA. Bot prospects only
  // (creates Project with Claude Code prompt + images, no outreach send) so
  // Levi runs Claude Code locally, pastes the Vercel URL, then admin
  // dispatches the cold WhatsApp message with that URL embedded — same flow
  // the US-WA campaign uses.
  //
  // Phase 1 scope: aesthetic clinics only, in 3 cities. Kill switch at
  // 14 days / 100 messages: < 1% reply or 0 sales → revisit offer; ≥ 1
  // sale or ≥ 3% reply → expand to next niche (vet) under Phase 2.
  {
    code: 'BR-WA-PREVIEW',
    name: 'BR (Preview-First)',
    flag: '🇧🇷',
    country: 'BR',
    lang: 'pt',
    channel: 'whatsapp',
    previewFirst: true,
    qualificationFilters: {
      minRating: 3.5,
      recentReviewMonths: 12,
      requireOperational: true,
      franchiseBlacklist: ESTHETICS_FRANCHISE_BLACKLIST_BR,
    },
    niches: [
      {
        category: 'Foco validação (Fase 1)',
        items: [
          'clínicas de estética',
        ],
      },
    ],
    cities: [
      'Ribeirão Preto, SP',
      'Sorocaba, SP',
      'Londrina, PR',
    ],
  },
  {
    code: 'US-EM',
    name: 'US (Email)',
    flag: '🇺🇸',
    country: 'US',
    lang: 'en',
    channel: 'email',
    niches: [
      {
        category: 'Healthcare',
        items: [
          'dental clinics', 'med spas', 'chiropractors',
          'veterinary clinics', 'therapy practices',
        ],
      },
      {
        category: 'Home Services',
        items: [
          'HVAC companies', 'roofing contractors', 'electricians',
          'plumbers', 'landscaping companies', 'cleaning services',
        ],
      },
      {
        category: 'Fitness & Wellness',
        items: [
          'gyms', 'yoga studios', 'pilates studios', 'personal trainers',
        ],
      },
      {
        category: 'Beauty',
        items: [
          'hair salons', 'barbershops', 'tattoo shops',
        ],
      },
      {
        category: 'Food & Hospitality',
        items: [
          'restaurants', 'pizza shops', 'bakeries', 'wedding venues',
        ],
      },
      {
        category: 'Professional Services',
        items: [
          'law firms', 'accounting firms', 'insurance agencies',
          'real estate agencies',
        ],
      },
      {
        category: 'Other',
        items: [
          'auto repair shops', 'pet grooming', 'boutiques',
          'florists', 'photography studios', 'daycares', 'driving schools',
        ],
      },
    ],
    cities: [
      // ── TX Interior ──
      'Lubbock, TX', 'Amarillo, TX', 'Midland, TX', 'Odessa, TX',
      'Tyler, TX', 'Waco, TX', 'Abilene, TX', 'Beaumont, TX',
      'McAllen, TX', 'Brownsville, TX', 'Laredo, TX', 'Corpus Christi, TX',
      'Killeen, TX', 'Temple, TX', 'Bryan, TX', 'Longview, TX',
      'Texarkana, TX', 'Lufkin, TX', 'San Angelo, TX', 'Victoria, TX',
      'Sherman, TX', 'Wichita Falls, TX',
      // ── FL Interior ──
      'Gainesville, FL', 'Ocala, FL', 'Lakeland, FL', 'Daytona Beach, FL',
      'Fort Myers, FL', 'Pensacola, FL', 'Tallahassee, FL', 'Panama City, FL',
      'Port St. Lucie, FL', 'Cape Coral, FL', 'Palm Bay, FL',
      'Kissimmee, FL', 'Bradenton, FL', 'Deltona, FL',
      'Fort Pierce, FL', 'Winter Haven, FL', 'Sanford, FL',
      // ── GA Interior ──
      'Savannah, GA', 'Augusta, GA', 'Macon, GA', 'Athens, GA',
      'Albany, GA', 'Valdosta, GA', 'Warner Robins, GA',
      'Dalton, GA', 'Gainesville, GA', 'Rome, GA', 'Statesboro, GA',
      // ── NC Interior ──
      'Asheville, NC', 'Wilmington, NC', 'Fayetteville, NC',
      'Greensboro, NC', 'Winston-Salem, NC', 'Greenville, NC',
      'High Point, NC', 'Hickory, NC', 'Burlington, NC',
      'Jacksonville, NC', 'Rocky Mount, NC', 'Goldsboro, NC',
      // ── SC Interior ──
      'Greenville, SC', 'Columbia, SC', 'Myrtle Beach, SC',
      'Spartanburg, SC', 'Anderson, SC', 'Florence, SC',
      'Rock Hill, SC', 'Sumter, SC', 'Aiken, SC',
      // ── TN Interior ──
      'Knoxville, TN', 'Chattanooga, TN', 'Clarksville, TN',
      'Murfreesboro, TN', 'Johnson City, TN', 'Jackson, TN',
      'Kingsport, TN', 'Cleveland, TN', 'Cookeville, TN',
      // ── AL Interior ──
      'Huntsville, AL', 'Mobile, AL', 'Montgomery, AL', 'Tuscaloosa, AL',
      'Dothan, AL', 'Decatur, AL', 'Auburn, AL', 'Florence, AL',
      'Gadsden, AL', 'Opelika, AL',
      // ── MS Interior ──
      'Gulfport, MS', 'Biloxi, MS', 'Hattiesburg, MS', 'Meridian, MS',
      'Tupelo, MS', 'Olive Branch, MS', 'Oxford, MS', 'Starkville, MS',
      // ── LA Interior ──
      'Shreveport, LA', 'Lafayette, LA', 'Lake Charles, LA',
      'Monroe, LA', 'Alexandria, LA', 'Houma, LA',
      'New Iberia, LA', 'Ruston, LA', 'Natchitoches, LA',
      // ── AR Interior ──
      'Fayetteville, AR', 'Fort Smith, AR', 'Jonesboro, AR',
      'Springdale, AR', 'Rogers, AR', 'Conway, AR',
      'Pine Bluff, AR', 'Bentonville, AR',
      // ── OK Interior ──
      'Norman, OK', 'Lawton, OK', 'Broken Arrow, OK',
      'Edmond, OK', 'Moore, OK', 'Enid, OK',
      'Stillwater, OK', 'Muskogee, OK', 'Bartlesville, OK',
      // ── KY Interior ──
      'Lexington, KY', 'Bowling Green, KY', 'Owensboro, KY',
      'Covington, KY', 'Richmond, KY', 'Elizabethtown, KY',
      'Hopkinsville, KY', 'Paducah, KY',
      // ── OH Interior ──
      'Dayton, OH', 'Akron, OH', 'Toledo, OH', 'Canton, OH',
      'Youngstown, OH', 'Springfield, OH', 'Mansfield, OH',
      'Lima, OH', 'Newark, OH', 'Findlay, OH', 'Zanesville, OH',
      // ── IN Interior ──
      'Fort Wayne, IN', 'South Bend, IN', 'Evansville, IN',
      'Bloomington, IN', 'Lafayette, IN', 'Terre Haute, IN',
      'Kokomo, IN', 'Muncie, IN', 'Anderson, IN', 'Elkhart, IN',
      // ── MI Interior ──
      'Grand Rapids, MI', 'Kalamazoo, MI', 'Lansing, MI', 'Flint, MI',
      'Traverse City, MI', 'Saginaw, MI', 'Muskegon, MI',
      'Battle Creek, MI', 'Jackson, MI', 'Midland, MI',
      // ── WI Interior ──
      'Green Bay, WI', 'Appleton, WI', 'Oshkosh, WI', 'Racine, WI',
      'Kenosha, WI', 'Eau Claire, WI', 'Wausau, WI',
      'La Crosse, WI', 'Janesville, WI', 'Sheboygan, WI',
      // ── MN Interior ──
      'Rochester, MN', 'Duluth, MN', 'St. Cloud, MN',
      'Mankato, MN', 'Moorhead, MN', 'Winona, MN',
      // ── IA Interior ──
      'Cedar Rapids, IA', 'Davenport, IA', 'Sioux City, IA',
      'Iowa City, IA', 'Waterloo, IA', 'Council Bluffs, IA',
      'Dubuque, IA', 'Ames, IA', 'Mason City, IA',
      // ── MO Interior ──
      'Springfield, MO', 'Columbia, MO', 'Joplin, MO',
      'St. Joseph, MO', 'Jefferson City, MO', 'Cape Girardeau, MO',
      'Sedalia, MO', 'Rolla, MO',
      // ── KS Interior ──
      'Wichita, KS', 'Topeka, KS', 'Lawrence, KS',
      'Manhattan, KS', 'Salina, KS', 'Hutchinson, KS',
      'Leavenworth, KS', 'Garden City, KS', 'Dodge City, KS',
      // ── NE Interior ──
      'Lincoln, NE', 'Grand Island, NE', 'Kearney, NE',
      'Hastings, NE', 'North Platte, NE', 'Columbus, NE',
      // ── ND / SD Interior ──
      'Fargo, ND', 'Bismarck, ND', 'Grand Forks, ND', 'Minot, ND',
      'Sioux Falls, SD', 'Rapid City, SD', 'Aberdeen, SD',
      // ── WV Interior ──
      'Huntington, WV', 'Morgantown, WV', 'Parkersburg, WV',
      'Wheeling, WV', 'Beckley, WV',
      // ── VA Interior ──
      'Roanoke, VA', 'Lynchburg, VA', 'Danville, VA',
      'Harrisonburg, VA', 'Staunton, VA', 'Winchester, VA',
      'Charlottesville, VA', 'Bristol, VA', 'Blacksburg, VA',
      // ── PA Interior ──
      'Scranton, PA', 'Allentown, PA', 'Erie, PA', 'Reading, PA',
      'Lancaster, PA', 'Harrisburg, PA', 'York, PA',
      'Williamsport, PA', 'State College, PA', 'Bethlehem, PA',
      // ── NY Upstate ──
      'Syracuse, NY', 'Rochester, NY', 'Buffalo, NY', 'Albany, NY',
      'Utica, NY', 'Binghamton, NY', 'Ithaca, NY',
      'Poughkeepsie, NY', 'Elmira, NY', 'Watertown, NY',
      // ── NM Interior ──
      'Las Cruces, NM', 'Santa Fe, NM', 'Roswell, NM',
      'Farmington, NM', 'Clovis, NM', 'Alamogordo, NM',
      // ── AZ Interior ──
      'Tucson, AZ', 'Flagstaff, AZ', 'Yuma, AZ',
      'Prescott, AZ', 'Lake Havasu City, AZ', 'Sierra Vista, AZ',
      'Bullhead City, AZ', 'Casa Grande, AZ',
      // ── CO Interior ──
      'Colorado Springs, CO', 'Fort Collins, CO', 'Pueblo, CO',
      'Grand Junction, CO', 'Greeley, CO', 'Loveland, CO',
      'Durango, CO', 'Montrose, CO',
      // ── UT Interior ──
      'Provo, UT', 'Ogden, UT', 'St. George, UT',
      'Logan, UT', 'Cedar City, UT',
      // ── ID Interior ──
      'Boise, ID', 'Nampa, ID', 'Idaho Falls, ID',
      'Pocatello, ID', 'Twin Falls, ID', 'Coeur d\'Alene, ID',
      // ── MT Interior ──
      'Billings, MT', 'Missoula, MT', 'Great Falls, MT',
      'Bozeman, MT', 'Helena, MT', 'Kalispell, MT',
      // ── WY Interior ──
      'Cheyenne, WY', 'Casper, WY', 'Laramie, WY',
      'Gillette, WY', 'Rock Springs, WY', 'Sheridan, WY',
      // ── OR Interior ──
      'Salem, OR', 'Eugene, OR', 'Bend, OR', 'Medford, OR',
      'Corvallis, OR', 'Albany, OR', 'Grants Pass, OR',
      'Roseburg, OR', 'Klamath Falls, OR',
      // ── WA Interior ──
      'Spokane, WA', 'Tacoma, WA', 'Olympia, WA', 'Bellingham, WA',
      'Yakima, WA', 'Kennewick, WA', 'Richland, WA',
      'Walla Walla, WA', 'Wenatchee, WA', 'Ellensburg, WA',
      // ── ME / NH / VT Interior ──
      'Bangor, ME', 'Lewiston, ME', 'Auburn, ME',
      'Manchester, NH', 'Nashua, NH', 'Concord, NH',
      'Burlington, VT', 'Rutland, VT',
      // ── CT / RI Interior ──
      'Waterbury, CT', 'New Britain, CT', 'Danbury, CT', 'Norwich, CT',
      'Warwick, RI', 'Cranston, RI',
    ],
  },
  // ─── US-WA: WhatsApp-first preview-first outreach targeting solo-operator
  // SMBs without websites. Niches are intentionally small-scale trades where
  // the owner is the operator in the field and hasn't prioritized digital
  // presence — "roofing contractors" was dropped because those are LLCs that
  // invested in SEO + site to survive Angi/HomeAdvisor competition. Cities
  // include hispanic-dense metros and their suburbs (lower digital
  // saturation). FL excluded pending US entity (FTSA risk).
  {
    code: 'US-WA',
    name: 'US (WhatsApp)',
    flag: '🇺🇸',
    country: 'US',
    lang: 'en',
    channel: 'whatsapp',
    // US-WA was preview-first all along; the flag is now explicit so UI and
    // bot can branch on the property instead of comparing the code string.
    previewFirst: true,
    niches: [
      {
        category: 'Solo Operator Services',
        items: [
          'handyman',
          'gutter cleaning',
          'pressure washing',
          'junk removal',
          'lawn mowing',
          'tree service',
          'fence repair',
          'drywall repair',
          'appliance repair',
          'mobile car detailing',
          'pool cleaning',
          'mobile mechanic',
        ],
      },
    ],
    cities: [
      // ── TX metros + suburbs (hispanic-dense) ──
      'Houston, TX', 'San Antonio, TX', 'Dallas, TX', 'Fort Worth, TX',
      'Austin, TX', 'El Paso, TX', 'Laredo, TX', 'McAllen, TX',
      'Brownsville, TX', 'Corpus Christi, TX', 'Arlington, TX',
      'Plano, TX', 'Garland, TX', 'Irving, TX',
      'Pasadena, TX', 'Pearland, TX', 'Sugar Land, TX', 'Katy, TX',
      'Humble, TX', 'Baytown, TX', 'Conroe, TX', 'League City, TX',
      'Missouri City, TX', 'Spring, TX',
      // ── AZ ──
      'Phoenix, AZ', 'Tucson, AZ', 'Mesa, AZ', 'Chandler, AZ',
      'Glendale, AZ', 'Gilbert, AZ', 'Scottsdale, AZ', 'Tempe, AZ',
      'Buckeye, AZ', 'Surprise, AZ', 'Goodyear, AZ',
      // ── NV ──
      'Las Vegas, NV', 'Henderson, NV', 'North Las Vegas, NV', 'Reno, NV',
      // ── CA ──
      'Los Angeles, CA', 'San Diego, CA', 'San Jose, CA', 'Fresno, CA',
      'Bakersfield, CA', 'Sacramento, CA', 'Long Beach, CA', 'Anaheim, CA',
      'Riverside, CA', 'Santa Ana, CA', 'San Bernardino, CA',
      'Stockton, CA', 'Modesto, CA', 'Oxnard, CA', 'Fontana, CA',
      'Moreno Valley, CA', 'Santa Clarita, CA', 'Oceanside, CA',
      'Pomona, CA', 'Norwalk, CA', 'El Monte, CA',
      'Garden Grove, CA', 'Whittier, CA',
      // ── GA ──
      'Atlanta, GA', 'Marietta, GA', 'Roswell, GA',
      'Duluth, GA', 'Lawrenceville, GA', 'Alpharetta, GA', 'Norcross, GA',
      // ── NC ──
      'Charlotte, NC', 'Raleigh, NC', 'Greensboro, NC', 'Durham, NC',
      // ── IL ──
      'Chicago, IL', 'Aurora, IL', 'Joliet, IL', 'Elgin, IL',
      'Cicero, IL', 'Waukegan, IL', 'Berwyn, IL', 'Melrose Park, IL',
      // ── NJ ──
      'Newark, NJ', 'Paterson, NJ', 'Elizabeth, NJ', 'Jersey City, NJ',
      'Passaic, NJ',
      // ── NM ──
      'Albuquerque, NM', 'Las Cruces, NM',
      // ── CO ──
      'Denver, CO', 'Aurora, CO', 'Colorado Springs, CO',
    ],
  },
  // ─── US-SMS: mirrors US-WA (same niches + cities, different channel).
  // Twilio + 10DLC integration is pending — sends currently fail with
  // sms_not_configured. Kept in sync with US-WA so when SMS goes live the
  // comparison run is apples-to-apples.
  {
    code: 'US-SMS',
    name: 'US (SMS)',
    flag: '🇺🇸',
    country: 'US',
    lang: 'en',
    channel: 'sms',
    niches: [
      {
        category: 'Solo Operator Services',
        items: [
          'handyman',
          'gutter cleaning',
          'pressure washing',
          'junk removal',
          'lawn mowing',
          'tree service',
          'fence repair',
          'drywall repair',
          'appliance repair',
          'mobile car detailing',
          'pool cleaning',
          'mobile mechanic',
        ],
      },
    ],
    cities: [
      'Houston, TX', 'San Antonio, TX', 'Dallas, TX', 'Fort Worth, TX',
      'Austin, TX', 'El Paso, TX', 'Laredo, TX', 'McAllen, TX',
      'Brownsville, TX', 'Corpus Christi, TX', 'Arlington, TX',
      'Plano, TX', 'Garland, TX', 'Irving, TX',
      'Pasadena, TX', 'Pearland, TX', 'Sugar Land, TX', 'Katy, TX',
      'Humble, TX', 'Baytown, TX', 'Conroe, TX', 'League City, TX',
      'Missouri City, TX', 'Spring, TX',
      'Phoenix, AZ', 'Tucson, AZ', 'Mesa, AZ', 'Chandler, AZ',
      'Glendale, AZ', 'Gilbert, AZ', 'Scottsdale, AZ', 'Tempe, AZ',
      'Buckeye, AZ', 'Surprise, AZ', 'Goodyear, AZ',
      'Las Vegas, NV', 'Henderson, NV', 'North Las Vegas, NV', 'Reno, NV',
      'Los Angeles, CA', 'San Diego, CA', 'San Jose, CA', 'Fresno, CA',
      'Bakersfield, CA', 'Sacramento, CA', 'Long Beach, CA', 'Anaheim, CA',
      'Riverside, CA', 'Santa Ana, CA', 'San Bernardino, CA',
      'Stockton, CA', 'Modesto, CA', 'Oxnard, CA', 'Fontana, CA',
      'Moreno Valley, CA', 'Santa Clarita, CA', 'Oceanside, CA',
      'Pomona, CA', 'Norwalk, CA', 'El Monte, CA',
      'Garden Grove, CA', 'Whittier, CA',
      'Atlanta, GA', 'Marietta, GA', 'Roswell, GA',
      'Duluth, GA', 'Lawrenceville, GA', 'Alpharetta, GA', 'Norcross, GA',
      'Charlotte, NC', 'Raleigh, NC', 'Greensboro, NC', 'Durham, NC',
      'Chicago, IL', 'Aurora, IL', 'Joliet, IL', 'Elgin, IL',
      'Cicero, IL', 'Waukegan, IL', 'Berwyn, IL', 'Melrose Park, IL',
      'Newark, NJ', 'Paterson, NJ', 'Elizabeth, NJ', 'Jersey City, NJ',
      'Passaic, NJ',
      'Albuquerque, NM', 'Las Cruces, NM',
      'Denver, CO', 'Aurora, CO', 'Colorado Springs, CO',
    ],
  },
] as const

export function getCountry(code: string): CountryConfig | undefined {
  return COUNTRIES.find(c => c.code === code)
}
