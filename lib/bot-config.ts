// ─── Country-based bot configuration ───
// To add a new country: add an entry to COUNTRIES with its niches, cities, lang, and channel.

export interface NicheGroup {
  category: string
  items: readonly string[]
}

export interface CountryConfig {
  code: string
  name: string
  flag: string
  lang: string
  channel: 'whatsapp' | 'email'
  niches: readonly NicheGroup[]
  cities: readonly string[]
}

export const COUNTRIES: readonly CountryConfig[] = [
  {
    code: 'BR',
    name: 'Brasil',
    flag: '🇧🇷',
    lang: 'pt',
    channel: 'whatsapp',
    niches: [
      {
        category: 'Saúde',
        items: [
          'clinicas odontologicas',
          'clinicas medicas',
          'academias',
          'spas e centros esteticos',
          'psicologos',
          'fisioterapeutas',
        ],
      },
      {
        category: 'Serviços profissionais',
        items: [
          'advogados',
          'contadores',
          'imobiliarias',
          'arquitetos',
          'engenheiros',
        ],
      },
      {
        category: 'Alimentação',
        items: [
          'restaurantes',
          'cafeterias',
          'padarias',
          'bares',
        ],
      },
      {
        category: 'Beleza',
        items: [
          'saloes de beleza',
          'barbearias',
          'clinicas de estetica',
          'tatuadores',
        ],
      },
      {
        category: 'Educação',
        items: [
          'escolas de idiomas',
          'cursos profissionalizantes',
          'escolas de musica',
          'auto escolas',
        ],
      },
    ],
    cities: [
      // ── SP Interior ──
      'Ribeirão Preto, SP', 'Sorocaba, SP', 'São José dos Campos, SP',
      'São José do Rio Preto, SP', 'Piracicaba, SP', 'Bauru, SP',
      'Jundiaí, SP', 'Franca, SP', 'Marília, SP', 'Campinas, SP',
      'Presidente Prudente, SP', 'Araraquara, SP', 'São Carlos, SP',
      'Rio Claro, SP', 'Limeira, SP', 'Araçatuba, SP', 'Catanduva, SP',
      'Assis, SP', 'Jaú, SP', 'Botucatu, SP', 'Ourinhos, SP',
      'Taubaté, SP', 'Jacareí, SP', 'Bragança Paulista, SP',
      'Itapetininga, SP', 'Itu, SP', 'Americana, SP', 'Indaiatuba, SP',
      'Lins, SP', 'Tupã, SP', 'Birigui, SP', 'Votuporanga, SP',
      'Fernandópolis, SP', 'Bebedouro, SP', 'Tatui, SP',
      'Santa Bárbara d\'Oeste, SP', 'Sumaré, SP', 'Valinhos, SP',
      'Mogi Guaçu, SP', 'Mogi Mirim, SP', 'Registro, SP',
      'Itapeva, SP', 'Andradina, SP', 'Penápolis, SP',
      // ── MG Interior ──
      'Uberlândia, MG', 'Juiz de Fora, MG', 'Uberaba, MG',
      'Montes Claros, MG', 'Poços de Caldas, MG', 'Governador Valadares, MG',
      'Divinópolis, MG', 'Sete Lagoas, MG', 'Patos de Minas, MG',
      'Pouso Alegre, MG', 'Teófilo Otoni, MG', 'Barbacena, MG',
      'Muriaé, MG', 'Lavras, MG', 'Itajubá, MG', 'Conselheiro Lafaiete, MG',
      'Varginha, MG', 'Passos, MG', 'Araguari, MG', 'Ituiutaba, MG',
      'Ipatinga, MG', 'Coronel Fabriciano, MG', 'Manhuaçu, MG',
      'São Lourenço, MG', 'Alfenas, MG', 'Araxá, MG', 'Formiga, MG',
      'Três Corações, MG', 'Caratinga, MG', 'Viçosa, MG',
      // ── PR Interior ──
      'Londrina, PR', 'Maringá, PR', 'Cascavel, PR', 'Ponta Grossa, PR',
      'Foz do Iguaçu, PR', 'Guarapuava, PR', 'Toledo, PR',
      'Apucarana, PR', 'Campo Mourão, PR', 'Umuarama, PR',
      'Francisco Beltrão, PR', 'Paranavaí, PR', 'Pato Branco, PR',
      'Telêmaco Borba, PR', 'Irati, PR', 'Cianorte, PR',
      'Cornélio Procópio, PR', 'Ivaiporã, PR',
      // ── SC Interior ──
      'Joinville, SC', 'Blumenau, SC', 'Chapecó, SC', 'Criciúma, SC',
      'Jaraguá do Sul, SC', 'Lages, SC', 'Brusque, SC', 'Tubarão, SC',
      'Caçador, SC', 'São Bento do Sul, SC', 'Concórdia, SC',
      'Rio do Sul, SC', 'Xanxerê, SC', 'Araranguá, SC', 'Joaçaba, SC',
      // ── RS Interior ──
      'Caxias do Sul, RS', 'Pelotas, RS', 'Santa Maria, RS',
      'Passo Fundo, RS', 'Lajeado, RS', 'Bento Gonçalves, RS',
      'Erechim, RS', 'Santa Cruz do Sul, RS', 'Ijuí, RS',
      'Uruguaiana, RS', 'Bagé, RS', 'Cruz Alta, RS',
      'Vacaria, RS', 'Santiago, RS', 'Carazinho, RS',
      'Frederico Westphalen, RS', 'Santo Ângelo, RS',
      // ── GO Interior ──
      'Anápolis, GO', 'Rio Verde, GO', 'Catalão, GO',
      'Itumbiara, GO', 'Jataí, GO', 'Luziânia, GO',
      'Caldas Novas, GO', 'Porangatu, GO', 'Mineiros, GO',
      // ── MS Interior ──
      'Dourados, MS', 'Três Lagoas, MS', 'Corumbá, MS',
      'Ponta Porã, MS', 'Naviraí, MS', 'Nova Andradina, MS',
      // ── MT Interior ──
      'Rondonópolis, MT', 'Sinop, MT', 'Tangará da Serra, MT',
      'Cáceres, MT', 'Sorriso, MT', 'Lucas do Rio Verde, MT',
      'Primavera do Leste, MT', 'Barra do Garças, MT',
      // ── BA Interior ──
      'Feira de Santana, BA', 'Vitória da Conquista, BA',
      'Ilhéus, BA', 'Itabuna, BA', 'Jequié, BA',
      'Barreiras, BA', 'Teixeira de Freitas, BA', 'Paulo Afonso, BA',
      'Alagoinhas, BA', 'Eunápolis, BA', 'Luís Eduardo Magalhães, BA',
      // ── PE Interior ──
      'Caruaru, PE', 'Petrolina, PE', 'Garanhuns, PE',
      'Serra Talhada, PE', 'Arcoverde, PE', 'Goiana, PE',
      // ── CE Interior ──
      'Juazeiro do Norte, CE', 'Sobral, CE', 'Crato, CE',
      'Iguatu, CE', 'Quixadá, CE', 'Itapipoca, CE',
      // ── PA Interior ──
      'Marabá, PA', 'Santarém, PA', 'Castanhal, PA',
      'Paragominas, PA', 'Altamira, PA', 'Tucuruí, PA',
      // ── MA Interior ──
      'Imperatriz, MA', 'Caxias, MA', 'Timon, MA',
      'Codó, MA', 'Bacabal, MA', 'Açailândia, MA',
      // ── RN Interior ──
      'Mossoró, RN', 'Parnamirim, RN', 'Caicó, RN', 'Açu, RN',
      // ── PB Interior ──
      'Campina Grande, PB', 'Patos, PB', 'Sousa, PB', 'Cajazeiras, PB',
      // ── PI Interior ──
      'Parnaíba, PI', 'Picos, PI', 'Floriano, PI',
      // ── ES Interior ──
      'Cachoeiro de Itapemirim, ES', 'Linhares, ES', 'Colatina, ES',
      'São Mateus, ES', 'Aracruz, ES', 'Guarapari, ES',
      // ── TO Interior ──
      'Araguaína, TO', 'Gurupi, TO', 'Porto Nacional, TO',
      // ── AL Interior ──
      'Arapiraca, AL', 'Palmeira dos Índios, AL', 'Penedo, AL',
      // ── SE Interior ──
      'Itabaiana, SE', 'Lagarto, SE', 'Estância, SE',
      // ── RO Interior ──
      'Ji-Paraná, RO', 'Cacoal, RO', 'Vilhena, RO', 'Ariquemes, RO',
      // ── AC Interior ──
      'Cruzeiro do Sul, AC',
      // ── AP / RR ──
      'Santana, AP', 'Boa Vista, RR',
    ],
  },
  {
    code: 'US',
    name: 'United States',
    flag: '🇺🇸',
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
] as const

export function getCountry(code: string): CountryConfig | undefined {
  return COUNTRIES.find(c => c.code === code)
}
