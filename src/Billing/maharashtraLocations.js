const talukasByDistrict = {
  Ahilyanagar: 'Akole|Jamkhed|Karjat|Kopargaon|Nagar|Nevasa|Parner|Pathardi|Rahata|Rahuri|Sangamner|Shevgaon|Shrigonda|Shrirampur',
  Akola: 'Akola|Akot|Balapur|Barshitakli|Murtizapur|Patur|Telhara',
  Amravati: 'Achalpur|Amravati|Anjangaon Surji|Bhatkuli|Chandurbazar|Chandur Railway|Chikhaldara|Daryapur|Dhamangaon Railway|Dharni|Morshi|Nandgaon-Khandeshwar|Teosa|Warud',
  Beed: 'Ambejogai|Ashti|Beed|Dharur|Georai|Kaij|Majalgaon|Parli|Patoda|Shirur-Kasar|Wadwani',
  Bhandara: 'Bhandara|Lakhandur|Lakhani|Mohadi|Pauni|Sakoli|Tumsar',
  Buldhana: 'Buldhana|Chikhli|Deolgaon Raja|Jalgaon Jamod|Khamgaon|Lonar|Malkapur|Mehkar|Motala|Nandura|Sangrampur|Shegaon|Sindkhed Raja',
  Chandrapur: 'Ballarpur|Bhadravati|Brahmapuri|Chandrapur|Chimur|Gondpipri|Jiwati|Korpana|Mul|Nagbhid|Pombhurna|Rajura|Sawali|Sindewahi|Warora',
  'Chhatrapati Sambhajinagar': 'Chhatrapati Sambhajinagar|Gangapur|Kannad|Khuldabad|Paithan|Phulambri|Sillod|Soegaon|Vaijapur',
  Dharashiv: 'Bhoom|Dharashiv|Kalamb|Lohara|Omerga|Paranda|Tuljapur|Washi',
  Dhule: 'Dhule|Sakri|Shirpur|Sindkheda',
  Gadchiroli: 'Aheri|Armori|Bhamragad|Chamorshi|Dhanora|Etapalli|Gadchiroli|Korchi|Kurkheda|Mulchera|Sironcha|Wadsa Desaiganj',
  Gondia: 'Amgaon|Arjuni Morgaon|Deori|Gondia|Goregaon|Sadak Arjuni|Salekasa|Tirora',
  Hingoli: 'Aundha Nagnath|Basmath|Hingoli|Kalamnuri|Sengaon',
  Jalgaon: 'Amalner|Bhadgaon|Bhusawal|Bodwad|Chalisgaon|Chopda|Dharangaon|Erandol|Jalgaon|Jamner|Muktainagar|Pachora|Parola|Raver|Yawal',
  Jalna: 'Ambad|Badnapur|Bhokardan|Ghansawangi|Jafrabad|Jalna|Mantha|Partur',
  Kolhapur: 'Ajra|Bavda|Bhudargad|Chandgad|Gadhinglaj|Hatkanangle|Kagal|Karveer|Panhala|Radhanagari|Shahuwadi|Shirol',
  Latur: 'Ahmadpur|Ausa|Chakur|Deoni|Jalkot|Latur|Nilanga|Renapur|Shirur-Anantpal|Udgir',
  'Mumbai City': 'Mumbai City',
  'Mumbai Suburban': 'Andheri|Borivali|Kurla',
  Nagpur: 'Hingna|Kalameshwar|Kamptee|Katol|Kuhi|Mouda|Nagpur Rural|Nagpur Urban|Narkhed|Parseoni|Ramtek|Saoner|Umred',
  Nanded: 'Ardhapur|Bhokar|Biloli|Deglur|Dharmabad|Hadgaon|Himayatnagar|Kandhar|Kinwat|Loha|Mahur|Mudkhed|Mukhed|Naigaon|Nanded',
  Nandurbar: 'Akkalkuwa|Akrani|Nandurbar|Navapur|Shahada|Taloda',
  Nashik: 'Baglan (Satana)|Chandwad|Deola|Dindori|Igatpuri|Kalwan|Malegaon|Nandgaon|Nashik|Niphad|Peint|Sinnar|Surgana|Trimbakeshwar|Yeola',
  Palghar: 'Dahanu|Jawhar|Mokhada|Palghar|Talasari|Vada|Vasai|Vikramgad',
  Parbhani: 'Gangakhed|Jintur|Manwath|Palam|Parbhani|Pathri|Purna|Sailu|Sonpeth',
  Pune: 'Ambegaon|Baramati|Bhor|Daund|Haveli|Indapur|Junnar|Khed|Maval|Mulshi|Pune City|Purandar|Shirur|Velhe',
  Raigad: 'Alibag|Karjat|Khalapur|Mahad|Mangaon|Mhasla|Murud|Panvel|Pen|Poladpur|Roha|Shrivardhan|Sudhagad|Tala|Uran',
  Ratnagiri: 'Chiplun|Dapoli|Guhagar|Khed|Lanja|Mandangad|Rajapur|Ratnagiri|Sangameshwar',
  Sangli: 'Atpadi|Jat|Kadegaon|Kavathe Mahankal|Khanapur|Miraj|Palus|Shirala|Tasgaon|Walwa',
  Satara: 'Jaavali|Karad|Khandala|Khatav|Koregaon|Mahabaleshwar|Man|Patan|Phaltan|Satara|Wai',
  Sindhudurg: 'Devgad|Dodamarg|Kankavli|Kudal|Malvan|Sawantwadi|Vaibhavwadi|Vengurla',
  Solapur: 'Akkalkot|Barshi|Karmala|Madha|Malshiras|Mangalwedha|Mohol|Pandharpur|Sangole|Solapur North|Solapur South',
  Thane: 'Ambarnath|Bhiwandi|Kalyan|Murbad|Shahapur|Thane|Ulhasnagar',
  Wardha: 'Arvi|Ashti|Deoli|Hinganghat|Karanja|Samudrapur|Seloo|Wardha',
  Washim: 'Karanja|Malegaon|Mangrulpir|Manora|Risod|Washim',
  Yavatmal: 'Arni|Babhulgaon|Darwha|Digras|Ghatanji|Kalamb|Mahagaon|Maregaon|Ner|Pandharkawada|Pusad|Ralegaon|Umarkhed|Wani|Yavatmal|Zari Jamani',
};

export const MAHARASHTRA_DISTRICTS = Object.keys(talukasByDistrict)
  .sort((left, right) => left.localeCompare(right));

export const MAHARASHTRA_TALUKAS_BY_DISTRICT = Object.freeze(
  Object.fromEntries(
    Object.entries(talukasByDistrict).map(([district, talukas]) => [
      district,
      talukas.split('|').sort((left, right) => left.localeCompare(right)),
    ]),
  ),
);
