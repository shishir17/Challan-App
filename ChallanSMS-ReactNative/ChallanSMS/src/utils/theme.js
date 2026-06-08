// src/utils/theme.js

export const C = {
  bg:      '#0f1117',
  surface: '#161b27',
  card:    '#1c2235',
  border:  '#252d42',
  accent:  '#4f8ef7',
  green:   '#22c55e',
  red:     '#ef4444',
  yellow:  '#f59e0b',
  purple:  '#a78bfa',
  text:    '#dde6f5',
  muted:   '#5a6a8a',
  white:   '#ffffff',
};

export const DAILY_LIMIT = 200;

export const DEFAULT_HINDI = `*वाहन चालान सूचना*

प्रिय उपयोगकर्ता,

आपके मोबाईल नम्बर पर पंजीकृत वाहन पर चालान जारी किया गया है:

🔸 चालान राशि: Rs.{amount}
🔸 वाहन संख्या: {vehicle_number}
🔸 चालान संख्या: {challan_number}

भुगतान करें: https://vcourts.gov.in

यदि भुगतान हो चुका है तो इस संदेश को नज़रअंदाज़ करें।
- UP परिवहन विभाग`;

export const DEFAULT_ENGLISH = `*Traffic Challan Notice*

A challan has been issued on your vehicle:

Amount: Rs.{amount}
Vehicle: {vehicle_number}
Challan No: {challan_number}

Pay at: https://vcourts.gov.in

Ignore if already paid.
- UP Traffic Department`;
