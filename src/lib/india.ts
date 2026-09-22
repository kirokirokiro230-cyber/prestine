/**
 * Indian states, union territories and their major cities.
 *
 * The shop ships within India — checkout dropped the country field — so "state" is a
 * closed list of 36 entries and belongs in a dropdown.
 *
 * City is deliberately **not** closed. There are thousands of towns, and a select that
 * does not contain a shopper's town is a checkout that cannot be completed. So the lists
 * below are suggestions surfaced as you type, and the field still accepts anything typed
 * into it. A shopper in a village gets to buy the coat.
 *
 * Kept to well-known cities per state rather than exhaustive: the whole point is to save
 * typing for most people, and a complete gazetteer would be a large payload on the page
 * where payload matters most.
 */

export interface IndianState {
  /** Two-letter code, as used by couriers including Delhivery's `state_code`. */
  code: string;
  name: string;
}

/** 28 states, then the 8 union territories. Alphabetical within each group. */
export const INDIAN_STATES: IndianState[] = [
  { code: "AP", name: "Andhra Pradesh" },
  { code: "AR", name: "Arunachal Pradesh" },
  { code: "AS", name: "Assam" },
  { code: "BR", name: "Bihar" },
  { code: "CG", name: "Chhattisgarh" },
  { code: "GA", name: "Goa" },
  { code: "GJ", name: "Gujarat" },
  { code: "HR", name: "Haryana" },
  { code: "HP", name: "Himachal Pradesh" },
  { code: "JH", name: "Jharkhand" },
  { code: "KA", name: "Karnataka" },
  { code: "KL", name: "Kerala" },
  { code: "MP", name: "Madhya Pradesh" },
  { code: "MH", name: "Maharashtra" },
  { code: "MN", name: "Manipur" },
  { code: "ML", name: "Meghalaya" },
  { code: "MZ", name: "Mizoram" },
  { code: "NL", name: "Nagaland" },
  { code: "OD", name: "Odisha" },
  { code: "PB", name: "Punjab" },
  { code: "RJ", name: "Rajasthan" },
  { code: "SK", name: "Sikkim" },
  { code: "TN", name: "Tamil Nadu" },
  { code: "TS", name: "Telangana" },
  { code: "TR", name: "Tripura" },
  { code: "UP", name: "Uttar Pradesh" },
  { code: "UK", name: "Uttarakhand" },
  { code: "WB", name: "West Bengal" },

  { code: "AN", name: "Andaman and Nicobar Islands" },
  { code: "CH", name: "Chandigarh" },
  { code: "DH", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "DL", name: "Delhi" },
  { code: "JK", name: "Jammu and Kashmir" },
  { code: "LA", name: "Ladakh" },
  { code: "LD", name: "Lakshadweep" },
  { code: "PY", name: "Puducherry" },
];

/** For the state dropdown. Names, not codes — a shopper picks "Kerala", not "KL". */
export const STATE_OPTIONS = INDIAN_STATES.map((state) => ({
  value: state.name,
  label: state.name,
}));

/**
 * Major cities by state name.
 *
 * Keyed by name rather than code so the checkout can look up suggestions straight from
 * the selected dropdown value with no mapping step.
 */
export const CITIES_BY_STATE: Record<string, string[]> = {
  "Andhra Pradesh": [
    "Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Kurnool", "Rajahmundry",
    "Tirupati", "Kakinada", "Kadapa", "Anantapur", "Eluru", "Ongole",
  ],
  "Arunachal Pradesh": ["Itanagar", "Naharlagun", "Pasighat", "Tawang", "Ziro"],
  Assam: [
    "Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Nagaon", "Tinsukia", "Tezpur",
    "Bongaigaon",
  ],
  Bihar: [
    "Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga", "Purnia", "Ara",
    "Begusarai", "Katihar", "Chapra",
  ],
  Chhattisgarh: ["Raipur", "Bhilai", "Bilaspur", "Korba", "Durg", "Rajnandgaon", "Jagdalpur"],
  Goa: ["Panaji", "Margao", "Vasco da Gama", "Mapusa", "Ponda"],
  Gujarat: [
    "Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar", "Gandhinagar",
    "Junagadh", "Anand", "Nadiad", "Bharuch", "Gandhidham",
  ],
  Haryana: [
    "Gurugram", "Faridabad", "Panipat", "Ambala", "Hisar", "Rohtak", "Karnal",
    "Sonipat", "Yamunanagar", "Panchkula",
  ],
  "Himachal Pradesh": ["Shimla", "Dharamshala", "Solan", "Mandi", "Manali", "Kullu", "Baddi"],
  Jharkhand: ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro Steel City", "Deoghar", "Hazaribagh"],
  Karnataka: [
    "Bengaluru", "Mysuru", "Hubballi", "Mangaluru", "Belagavi", "Davangere",
    "Ballari", "Vijayapura", "Shivamogga", "Tumakuru", "Udupi",
  ],
  Kerala: [
    "Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kollam", "Alappuzha",
    "Kannur", "Kottayam", "Palakkad", "Malappuram",
  ],
  "Madhya Pradesh": [
    "Indore", "Bhopal", "Jabalpur", "Gwalior", "Ujjain", "Sagar", "Dewas",
    "Satna", "Ratlam", "Rewa",
  ],
  Maharashtra: [
    "Mumbai", "Pune", "Nagpur", "Nashik", "Thane", "Aurangabad", "Solapur",
    "Navi Mumbai", "Kolhapur", "Amravati", "Nanded", "Sangli", "Jalgaon", "Akola",
  ],
  Manipur: ["Imphal", "Thoubal", "Bishnupur", "Churachandpur"],
  Meghalaya: ["Shillong", "Tura", "Jowai", "Nongstoin"],
  Mizoram: ["Aizawl", "Lunglei", "Champhai", "Serchhip"],
  Nagaland: ["Kohima", "Dimapur", "Mokokchung", "Tuensang"],
  Odisha: [
    "Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur", "Puri",
    "Balasore", "Bhadrak",
  ],
  Punjab: [
    "Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali",
    "Pathankot", "Hoshiarpur", "Moga",
  ],
  Rajasthan: [
    "Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer", "Bikaner", "Alwar",
    "Bhilwara", "Sikar", "Pali",
  ],
  Sikkim: ["Gangtok", "Namchi", "Gyalshing", "Mangan"],
  "Tamil Nadu": [
    "Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli",
    "Erode", "Vellore", "Thoothukudi", "Thanjavur", "Tiruppur", "Hosur",
  ],
  Telangana: [
    "Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam", "Ramagundam",
    "Secunderabad", "Mahbubnagar",
  ],
  Tripura: ["Agartala", "Udaipur", "Dharmanagar", "Kailashahar"],
  "Uttar Pradesh": [
    "Lucknow", "Kanpur", "Ghaziabad", "Agra", "Varanasi", "Meerut", "Prayagraj",
    "Noida", "Bareilly", "Aligarh", "Moradabad", "Gorakhpur", "Saharanpur", "Jhansi",
    "Mathura", "Ayodhya",
  ],
  Uttarakhand: ["Dehradun", "Haridwar", "Roorkee", "Haldwani", "Rudrapur", "Nainital", "Rishikesh"],
  "West Bengal": [
    "Kolkata", "Howrah", "Durgapur", "Asansol", "Siliguri", "Bardhaman",
    "Malda", "Kharagpur", "Darjeeling",
  ],

  "Andaman and Nicobar Islands": ["Port Blair"],
  Chandigarh: ["Chandigarh"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Silvassa", "Daman", "Diu"],
  Delhi: ["New Delhi", "Delhi", "Dwarka", "Rohini", "Saket", "Karol Bagh", "Pitampura"],
  "Jammu and Kashmir": ["Srinagar", "Jammu", "Anantnag", "Baramulla", "Udhampur"],
  Ladakh: ["Leh", "Kargil"],
  Lakshadweep: ["Kavaratti"],
  Puducherry: ["Puducherry", "Karaikal", "Yanam", "Mahe"],
};

/**
 * City suggestions for a state, or every city we know when no state is chosen yet.
 *
 * Returning the full list rather than nothing matters: a shopper who starts with the city
 * field still gets help, and choosing a state afterwards narrows it.
 */
export function citySuggestions(state: string): string[] {
  const forState = CITIES_BY_STATE[state.trim()];
  if (forState) return forState;

  // Deduplicated, because a few names recur across states (Udaipur, Delhi).
  return [...new Set(Object.values(CITIES_BY_STATE).flat())].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Matches a courier's `state_code` back to a state name, for pincode autofill. */
export function stateFromCode(code: string): string | undefined {
  const match = INDIAN_STATES.find(
    (state) => state.code.toLowerCase() === code.trim().toLowerCase(),
  );
  return match?.name;
}
