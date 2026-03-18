/**
 * Country data for phone number input with country code selector.
 * Each entry contains:
 * - code: ISO 3166-1 alpha-2 country code
 * - dialCode: International dialing prefix
 * - flag: Unicode flag emoji
 * - name: Country name in English
 */

export interface CountryData {
  code: string;
  dialCode: string;
  flag: string;
  name: string;
}

/**
 * Get flag emoji from ISO 3166-1 alpha-2 country code.
 * Uses Unicode Regional Indicator Symbol Letters.
 */
function flagEmoji(code: string): string {
  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split("")
      .map((c) => 0x1f1e6 - 65 + c.charCodeAt(0)),
  );
}

/**
 * Full list of countries with dial codes, sorted by dial code (numerically)
 * with secondary sort by country code for ties.
 */
export const countries: CountryData[] = [
  { code: "US", dialCode: "+1", name: "United States" },
  { code: "KZ", dialCode: "+7", name: "Kazakhstan" },
  { code: "RU", dialCode: "+7", name: "Russia" },
  { code: "EG", dialCode: "+20", name: "Egypt" },
  { code: "ZA", dialCode: "+27", name: "South Africa" },
  { code: "GR", dialCode: "+30", name: "Greece" },
  { code: "NL", dialCode: "+31", name: "Netherlands" },
  { code: "BE", dialCode: "+32", name: "Belgium" },
  { code: "FR", dialCode: "+33", name: "France" },
  { code: "ES", dialCode: "+34", name: "Spain" },
  { code: "HU", dialCode: "+36", name: "Hungary" },
  { code: "IT", dialCode: "+39", name: "Italy" },
  { code: "RO", dialCode: "+40", name: "Romania" },
  { code: "CH", dialCode: "+41", name: "Switzerland" },
  { code: "AT", dialCode: "+43", name: "Austria" },
  { code: "GB", dialCode: "+44", name: "United Kingdom" },
  { code: "DK", dialCode: "+45", name: "Denmark" },
  { code: "SE", dialCode: "+46", name: "Sweden" },
  { code: "NO", dialCode: "+47", name: "Norway" },
  { code: "PL", dialCode: "+48", name: "Poland" },
  { code: "DE", dialCode: "+49", name: "Germany" },
  { code: "PE", dialCode: "+51", name: "Peru" },
  { code: "MX", dialCode: "+52", name: "Mexico" },
  { code: "CU", dialCode: "+53", name: "Cuba" },
  { code: "AR", dialCode: "+54", name: "Argentina" },
  { code: "BR", dialCode: "+55", name: "Brazil" },
  { code: "CL", dialCode: "+56", name: "Chile" },
  { code: "CO", dialCode: "+57", name: "Colombia" },
  { code: "VE", dialCode: "+58", name: "Venezuela" },
  { code: "MY", dialCode: "+60", name: "Malaysia" },
  { code: "AU", dialCode: "+61", name: "Australia" },
  { code: "ID", dialCode: "+62", name: "Indonesia" },
  { code: "PH", dialCode: "+63", name: "Philippines" },
  { code: "NZ", dialCode: "+64", name: "New Zealand" },
  { code: "SG", dialCode: "+65", name: "Singapore" },
  { code: "TH", dialCode: "+66", name: "Thailand" },
  { code: "JP", dialCode: "+81", name: "Japan" },
  { code: "KR", dialCode: "+82", name: "South Korea" },
  { code: "VN", dialCode: "+84", name: "Vietnam" },
  { code: "CN", dialCode: "+86", name: "China" },
  { code: "TR", dialCode: "+90", name: "Turkey" },
  { code: "IN", dialCode: "+91", name: "India" },
  { code: "PK", dialCode: "+92", name: "Pakistan" },
  { code: "AF", dialCode: "+93", name: "Afghanistan" },
  { code: "LK", dialCode: "+94", name: "Sri Lanka" },
  { code: "MM", dialCode: "+95", name: "Myanmar" },
  { code: "IR", dialCode: "+98", name: "Iran" },
  { code: "SS", dialCode: "+211", name: "South Sudan" },
  { code: "MA", dialCode: "+212", name: "Morocco" },
  { code: "DZ", dialCode: "+213", name: "Algeria" },
  { code: "TN", dialCode: "+216", name: "Tunisia" },
  { code: "LY", dialCode: "+218", name: "Libya" },
  { code: "GM", dialCode: "+220", name: "Gambia" },
  { code: "SN", dialCode: "+221", name: "Senegal" },
  { code: "MR", dialCode: "+222", name: "Mauritania" },
  { code: "ML", dialCode: "+223", name: "Mali" },
  { code: "GN", dialCode: "+224", name: "Guinea" },
  { code: "CI", dialCode: "+225", name: "Ivory Coast" },
  { code: "BF", dialCode: "+226", name: "Burkina Faso" },
  { code: "NE", dialCode: "+227", name: "Niger" },
  { code: "TG", dialCode: "+228", name: "Togo" },
  { code: "BJ", dialCode: "+229", name: "Benin" },
  { code: "MU", dialCode: "+230", name: "Mauritius" },
  { code: "LR", dialCode: "+231", name: "Liberia" },
  { code: "SL", dialCode: "+232", name: "Sierra Leone" },
  { code: "GH", dialCode: "+233", name: "Ghana" },
  { code: "NG", dialCode: "+234", name: "Nigeria" },
  { code: "TD", dialCode: "+235", name: "Chad" },
  { code: "CF", dialCode: "+236", name: "Central African Republic" },
  { code: "CM", dialCode: "+237", name: "Cameroon" },
  { code: "CV", dialCode: "+238", name: "Cape Verde" },
  { code: "GQ", dialCode: "+240", name: "Equatorial Guinea" },
  { code: "GA", dialCode: "+241", name: "Gabon" },
  { code: "CG", dialCode: "+242", name: "Congo" },
  { code: "CD", dialCode: "+243", name: "Congo (DRC)" },
  { code: "AO", dialCode: "+244", name: "Angola" },
  { code: "GW", dialCode: "+245", name: "Guinea-Bissau" },
  { code: "SD", dialCode: "+249", name: "Sudan" },
  { code: "RW", dialCode: "+250", name: "Rwanda" },
  { code: "ET", dialCode: "+251", name: "Ethiopia" },
  { code: "SO", dialCode: "+252", name: "Somalia" },
  { code: "DJ", dialCode: "+253", name: "Djibouti" },
  { code: "KE", dialCode: "+254", name: "Kenya" },
  { code: "TZ", dialCode: "+255", name: "Tanzania" },
  { code: "UG", dialCode: "+256", name: "Uganda" },
  { code: "BI", dialCode: "+257", name: "Burundi" },
  { code: "MZ", dialCode: "+258", name: "Mozambique" },
  { code: "ZM", dialCode: "+260", name: "Zambia" },
  { code: "MG", dialCode: "+261", name: "Madagascar" },
  { code: "ZW", dialCode: "+263", name: "Zimbabwe" },
  { code: "NA", dialCode: "+264", name: "Namibia" },
  { code: "MW", dialCode: "+265", name: "Malawi" },
  { code: "LS", dialCode: "+266", name: "Lesotho" },
  { code: "BW", dialCode: "+267", name: "Botswana" },
  { code: "SZ", dialCode: "+268", name: "Eswatini" },
  { code: "KM", dialCode: "+269", name: "Comoros" },
  { code: "ER", dialCode: "+291", name: "Eritrea" },
  { code: "PT", dialCode: "+351", name: "Portugal" },
  { code: "LU", dialCode: "+352", name: "Luxembourg" },
  { code: "IE", dialCode: "+353", name: "Ireland" },
  { code: "IS", dialCode: "+354", name: "Iceland" },
  { code: "AL", dialCode: "+355", name: "Albania" },
  { code: "MT", dialCode: "+356", name: "Malta" },
  { code: "CY", dialCode: "+357", name: "Cyprus" },
  { code: "FI", dialCode: "+358", name: "Finland" },
  { code: "BG", dialCode: "+359", name: "Bulgaria" },
  { code: "LT", dialCode: "+370", name: "Lithuania" },
  { code: "LV", dialCode: "+371", name: "Latvia" },
  { code: "EE", dialCode: "+372", name: "Estonia" },
  { code: "MD", dialCode: "+373", name: "Moldova" },
  { code: "AM", dialCode: "+374", name: "Armenia" },
  { code: "BY", dialCode: "+375", name: "Belarus" },
  { code: "AD", dialCode: "+376", name: "Andorra" },
  { code: "MC", dialCode: "+377", name: "Monaco" },
  { code: "UA", dialCode: "+380", name: "Ukraine" },
  { code: "RS", dialCode: "+381", name: "Serbia" },
  { code: "ME", dialCode: "+382", name: "Montenegro" },
  { code: "HR", dialCode: "+385", name: "Croatia" },
  { code: "SI", dialCode: "+386", name: "Slovenia" },
  { code: "BA", dialCode: "+387", name: "Bosnia and Herzegovina" },
  { code: "MK", dialCode: "+389", name: "North Macedonia" },
  { code: "CZ", dialCode: "+420", name: "Czech Republic" },
  { code: "SK", dialCode: "+421", name: "Slovakia" },
  { code: "LI", dialCode: "+423", name: "Liechtenstein" },
  { code: "BZ", dialCode: "+501", name: "Belize" },
  { code: "GT", dialCode: "+502", name: "Guatemala" },
  { code: "SV", dialCode: "+503", name: "El Salvador" },
  { code: "HN", dialCode: "+504", name: "Honduras" },
  { code: "NI", dialCode: "+505", name: "Nicaragua" },
  { code: "CR", dialCode: "+506", name: "Costa Rica" },
  { code: "PA", dialCode: "+507", name: "Panama" },
  { code: "HT", dialCode: "+509", name: "Haiti" },
  { code: "BO", dialCode: "+591", name: "Bolivia" },
  { code: "GY", dialCode: "+592", name: "Guyana" },
  { code: "EC", dialCode: "+593", name: "Ecuador" },
  { code: "PY", dialCode: "+595", name: "Paraguay" },
  { code: "SR", dialCode: "+597", name: "Suriname" },
  { code: "UY", dialCode: "+598", name: "Uruguay" },
  { code: "TL", dialCode: "+670", name: "Timor-Leste" },
  { code: "BN", dialCode: "+673", name: "Brunei" },
  { code: "PG", dialCode: "+675", name: "Papua New Guinea" },
  { code: "FJ", dialCode: "+679", name: "Fiji" },
  { code: "KP", dialCode: "+850", name: "North Korea" },
  { code: "HK", dialCode: "+852", name: "Hong Kong" },
  { code: "MO", dialCode: "+853", name: "Macau" },
  { code: "KH", dialCode: "+855", name: "Cambodia" },
  { code: "LA", dialCode: "+856", name: "Laos" },
  { code: "BD", dialCode: "+880", name: "Bangladesh" },
  { code: "TW", dialCode: "+886", name: "Taiwan" },
  { code: "MV", dialCode: "+960", name: "Maldives" },
  { code: "LB", dialCode: "+961", name: "Lebanon" },
  { code: "JO", dialCode: "+962", name: "Jordan" },
  { code: "SY", dialCode: "+963", name: "Syria" },
  { code: "IQ", dialCode: "+964", name: "Iraq" },
  { code: "KW", dialCode: "+965", name: "Kuwait" },
  { code: "SA", dialCode: "+966", name: "Saudi Arabia" },
  { code: "YE", dialCode: "+967", name: "Yemen" },
  { code: "OM", dialCode: "+968", name: "Oman" },
  { code: "PS", dialCode: "+970", name: "Palestine" },
  { code: "AE", dialCode: "+971", name: "United Arab Emirates" },
  { code: "IL", dialCode: "+972", name: "Israel" },
  { code: "BH", dialCode: "+973", name: "Bahrain" },
  { code: "QA", dialCode: "+974", name: "Qatar" },
  { code: "BT", dialCode: "+975", name: "Bhutan" },
  { code: "MN", dialCode: "+976", name: "Mongolia" },
  { code: "NP", dialCode: "+977", name: "Nepal" },
  { code: "TJ", dialCode: "+992", name: "Tajikistan" },
  { code: "TM", dialCode: "+993", name: "Turkmenistan" },
  { code: "AZ", dialCode: "+994", name: "Azerbaijan" },
  { code: "GE", dialCode: "+995", name: "Georgia" },
  { code: "KG", dialCode: "+996", name: "Kyrgyzstan" },
  { code: "UZ", dialCode: "+998", name: "Uzbekistan" },
].map((c) => ({ ...c, flag: flagEmoji(c.code) }));

/**
 * Find a country by its ISO code, defaulting to US.
 */
export function getCountryByCode(code: string): CountryData {
  const upper = code.toUpperCase();
  return (
    countries.find((c) => c.code === upper) ||
    countries.find((c) => c.code === "US")!
  );
}
