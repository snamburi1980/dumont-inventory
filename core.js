
// auth and db declared in firebase.js
// Firestore helper shims below

// Firestore helper shims (modular -> compat)
function doc(database, ...pathSegments) {
  const path = pathSegments.join('/');
  const parts = path.split('/');
  let ref = database;
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) ref = ref.collection(parts[i]);
    else ref = ref.doc(parts[i]);
  }
  return ref;
}
async function getDoc(ref) {
  const snap = await ref.get();
  snap.exists = () => snap.exists;
  return snap;
}
async function setDoc(ref, data, opts) {
  if (opts && opts.merge) return ref.set(data, { merge: true });
  return ref.set(data);
}
async function addDoc(ref, data) {
  return ref.add(data);
}
async function deleteDoc(ref) {
  return ref.delete();
}
function collection(database, ...path) {
  let ref = database;
  for (const seg of path) {
    if (ref.collection) ref = ref.collection(seg);
  }
  return ref;
}
function query(ref, ...constraints) {
  let q = ref;
  for (const c of constraints) {
    if (c._type === 'orderBy') q = q.orderBy(c.field, c.dir);
    else if (c._type === 'where') q = q.where(c.field, c.op, c.val);
    else if (c._type === 'limit') q = q.limit(c.n);
  }
  return q;
}
function orderBy(field, dir='asc') { return { _type:'orderBy', field, dir }; }
function where(field, op, val)     { return { _type:'where', field, op, val }; }
function limitFn(n)                { return { _type:'limit', n }; }
async function getDocs(ref) {
  const snap = await ref.get();
  snap.docs = snap.docs || [];
  return snap;
}
function onSnapshot(ref, cb) {
  return ref.onSnapshot(snap => {
    snap.exists = () => snap.exists;
    cb(snap);
  });
}
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;



const APP_VERSION = "v14";

const firebaseConfig = {
  apiKey: "AIzaSyBofsUP3yf2OkaQVPav8rfxUiax39TkxYY",
  authDomain: "dumont-inventory.firebaseapp.com",
  projectId: "dumont-inventory",
  storageBucket: "dumont-inventory.firebasestorage.app",
  messagingSenderId: "208739741985",
  appId: "1:208739741985:web:85493fbe669b0e43b78e60"
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

// ── USER CONFIG ──
// Map email → { store, role }
// Add more users here as you create them in Firebase Auth console
const ROLES={SUPER_OWNER:"super_owner",REGIONAL_OWNER:"regional_owner",STORE_OWNER:"store_owner",MANAGER:"manager"};
const ORGS={"dumont":{name:"Dumont Creamery and Cafe",id:"dumont"}};
let REGIONS={"texas":{name:"Texas",orgId:"dumont",id:"texas"}};
let STORE_REGIONS={"coppell":"texas"};
function isSuperOwner(c){return c?.role==="super_owner"||c?.role==="owner";}
function isRegionalOwner(c){return c?.role==="regional_owner"||isSuperOwner(c);}
function isStoreOwner(c){return c?.role==="store_owner"||isRegionalOwner(c);}
function canSeeAllStores(c){return isSuperOwner(c)||isRegionalOwner(c);}

const USERS = {
  "dumonttexas@gmail.com":{store:"coppell",role:ROLES.SUPER_OWNER,orgId:"dumont",regionId:"texas",name:"Sasikanth"},
  "txccpointwest@gmail.com":{store:"coppell",role:ROLES.STORE_OWNER,orgId:"dumont",regionId:"texas",name:"Coppell Owner"},
  "frisco@dumont.com":           { store: "frisco",  role: "manager", name: "Frisco Manager" },
  "cedarpark@dumont.com":        { store: "cedar-park", role: "manager", name: "Cedar Park Manager" },
  "sanjose@dumont.com":          { store: "san-jose", role: "manager", name: "San Jose Manager" },
};

const STORES = {
  "coppell":    { name: "Coppell", city: "Coppell, TX" },
  "frisco":     { name: "Frisco",  city: "Frisco, TX" },
  "cedar-park": { name: "Cedar Park", city: "Cedar Park, TX" },
  "san-jose":   { name: "San Jose",   city: "San Jose, CA" },
};

// ── DEFAULT INVENTORY ──
const DEFAULT_INVENTORY = [
  { id:1,  name:"Chewy Tapioca Pearls",      code:"A2000",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:2,  order_qty:"1 CASE", cost:7.54, units_per_case:6, case_desc:"CASE of 6 bags" },
  { id:2,  name:"Jasmine Green Tea",         code:"T1022",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:2,  order_qty:"1 CASE", cost:3.62, units_per_case:25, case_desc:"CASE of 25 bags" },
  { id:3,  name:"Golden Milk Tea",           code:"T1025",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:2.33, units_per_case:25, case_desc:"CASE of 25 bags" },
  { id:4,  name:"Black Tea",                 code:"T1030",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:2,  order_qty:"1 CASE", cost:3.05, units_per_case:25, case_desc:"CASE of 25 bags" },
  { id:5,  name:"Thai Tea",                  code:"T1035",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:4.79, units_per_case:1, case_desc:"BAG 13oz" },
  { id:6,  name:"White Peach Tea",           code:"T2001",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.83, units_per_case:50, case_desc:"CASE of 50 bags" },
  { id:7,  name:"NDC (Creamer)",             code:"P1020",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:2,  order_qty:"1 CASE", cost:6.775, units_per_case:10, case_desc:"CASE of 10 bags" },
  { id:8,  name:"Granulated Sugar",          code:"S1030",        cat:"Boba",       vendor:"KARAT",     uom:"BAG",    par:2,  order_qty:"1 BAG", cost:49.19, units_per_case:1, case_desc:"BAG" },
  { id:9,  name:"Demerara Cane Sugar",       code:"S1020",        cat:"Boba",       vendor:"KARAT",     uom:"BAG",    par:1,  order_qty:"1 BAG", cost:79.9, units_per_case:1, case_desc:"BAG" },
  { id:10, name:"Dark Brown Sugar",          code:"S1005",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:2,  order_qty:"1 CASE", cost:57.1, units_per_case:1, case_desc:"CASE" },
  { id:11, name:"Longan Honey",              code:"S1015",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:12.5 },
  { id:12, name:"Fructose",                  code:"S1013",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:2,  order_qty:"1 BOTTLE", cost:11.0 },
  { id:13, name:"Dark Brown Sugar Syrup",    code:"S1006",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:2,  order_qty:"1 BOTTLE", cost:24.5 },
  { id:14, name:"Con Dark Brown Sugar Syrup",code:"S1007",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:26.75 },
  { id:15, name:"Grapefruit Syrup",          code:"J1015",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:10.25 },
  { id:16, name:"Lychee Syrup",             code:"J1040",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:10.25 },
  { id:17, name:"Mango Syrup",              code:"J1045",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:10.25 },
  { id:18, name:"Passion Fruit Syrup",      code:"J1060",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:10.25 },
  { id:19, name:"Pineapple Syrup",          code:"J1071",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:10.25 },
  { id:20, name:"Strawberry Syrup",         code:"J1090",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:10.25 },
  { id:21, name:"Winter Melon Syrup",       code:"J1095",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:10.25 },
  { id:22, name:"Passion Fruit Puree",      code:"J1095-P",      cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:16.99 },
  { id:23, name:"Strawberry Fruit Puree",   code:"H-PUREE-STR",  cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:14.09 },
  { id:24, name:"Mango Fruit Puree",        code:"H-PUREE-MNG",  cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:15.49 },
  { id:25, name:"Sea Salt Caramel Powder",  code:"P1044",        cat:"Boba",       vendor:"KARAT",     uom:"BAG",    par:1,  order_qty:"1 BAG", cost:10.25 },
  { id:26, name:"Matcha Green Tea Powder",  code:"P1046",        cat:"Boba",       vendor:"KARAT",     uom:"BAG",    par:2,  order_qty:"1 BAG", cost:15.5 },
  { id:27, name:"Taro Powder",              code:"P0065",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:2,  order_qty:"1 CASE", cost:15.5, units_per_case:1, case_desc:"BAG 2.2lbs" },
  { id:28, name:"Vanilla Powder",           code:"P1068",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:13.35, units_per_case:1, case_desc:"BAG" },
  { id:29, name:"Yoggi Powder",             code:"P2000",        cat:"Boba",       vendor:"KARAT",     uom:"BAG",    par:1,  order_qty:"1 BAG", cost:13.75 },
  { id:30, name:"Horchata Powder",          code:"P6071",        cat:"Boba",       vendor:"KARAT",     uom:"BAG",    par:1,  order_qty:"1 BAG", cost:24.39, units_per_case:1, case_desc:"BAG" },
  { id:31, name:"Chocolate Popping Pearls", code:"B2071",        cat:"Boba",       vendor:"KARAT",     uom:"JAR",    par:1,  order_qty:"1 JAR", cost:19.0 },
  { id:32, name:"Lychee Coconut Jelly",     code:"B2005",        cat:"Boba",       vendor:"KARAT",     uom:"JAR",    par:1,  order_qty:"1 JAR", cost:15.25 },
  { id:33, name:"Assorted Jelly (Rainbow)", code:"B2020",        cat:"Boba",       vendor:"KARAT",     uom:"JAR",    par:2,  order_qty:"1 JAR", cost:15.25 },
  { id:34, name:"Coffee Jelly",             code:"B2025",        cat:"Boba",       vendor:"KARAT",     uom:"JAR",    par:1,  order_qty:"1 JAR", cost:17.75 },
  { id:35, name:"Mango Popping Pearls",     code:"B2051",        cat:"Boba",       vendor:"KARAT",     uom:"JAR",    par:1,  order_qty:"1 JAR", cost:19.0 },
  { id:36, name:"Strawberry Popping Pearls",code:"B2053",        cat:"Boba",       vendor:"KARAT",     uom:"JAR",    par:1,  order_qty:"1 JAR", cost:19.0 },
  { id:37, name:"Passion Popping Pearls",   code:"B2055",        cat:"Boba",       vendor:"KARAT",     uom:"JAR",    par:1,  order_qty:"1 JAR", cost:19.0 },
  { id:38, name:"Blueberry Popping Pearls", code:"B2056",        cat:"Boba",       vendor:"KARAT",     uom:"JAR",    par:1,  order_qty:"1 JAR", cost:19.0, units_per_case:6, case_desc:"CASE of 6 bags" },
  { id:40, name:"Monin Caramel Sauce 1.69L",code:"H-CARAMEL-S",  cat:"Coffee",     vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:18.99 },
  { id:41, name:"Monin White Mocha Sauce",  code:"H-CHOCOLATE-WMS",cat:"Coffee",   vendor:"KARAT",     uom:"BOTTLE", par:2,  order_qty:"1 BOTTLE", cost:18.99 },
  { id:42, name:"Monin Dark Mocha Sauce",   code:"H-CHOCOLATE-S",  cat:"Coffee",   vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:18.99 },
  { id:43, name:"Monin Vanilla Syrup 750ml",code:"H-VANILLA",    cat:"Coffee",     vendor:"KARAT",     uom:"BOTTLE", par:2,  order_qty:"1 BOTTLE", cost:6.99 },
  { id:44, name:"Monin Caramel Syrup 750ml",code:"H-CARAMEL",    cat:"Coffee",     vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:6.99 },
  { id:45, name:"Monin Hazelnut Syrup",     code:"H-HAZELNUT",   cat:"Coffee",     vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:6.99 },
  { id:46, name:"Monin Pistachio Syrup",    code:"H-PISTACHIO",  cat:"Coffee",     vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:6.99 },
  { id:47, name:"Monin Blackberry Syrup",   code:"H-BLACKBERRY", cat:"Coffee",     vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:6.99 },
  { id:48, name:"Monin Strawberry Syrup",   code:"H-STRAWBERRY", cat:"Coffee",     vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:6.99 },
  { id:49, name:"Ghirardelli Choc Sauce 64oz",code:"I-Chocolate-S",cat:"Coffee",   vendor:"KARAT",     uom:"BOTTLE", par:2,  order_qty:"1 BOTTLE", cost:18.99 },
  { id:50, name:"Ghirardelli Caramel Sauce",code:"I-Caramel-S",  cat:"Coffee",     vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:18.99 },
  { id:51, name:"Coffee Beans",             code:"D-Coffeebeans", cat:"Coffee",    vendor:"DUMONT",    uom:"BAG",    par:2,  order_qty:"1 BAG", cost:20.0 },
  { id:60, name:"Kids Scoop Cup",           code:"HP-KSC",       cat:"Dry Stock",  vendor:"HYPERPACK", uom:"CASE",   par:2,  order_qty:"1 CASE", cost:0.108 },
  { id:61, name:"Regular Scoop Cup",        code:"HP-RSC",       cat:"Dry Stock",  vendor:"HYPERPACK", uom:"CASE",   par:2,  order_qty:"1 CASE", cost:0.12 },
  { id:62, name:"Triple Scoop Cup",         code:"HP-TSC",       cat:"Dry Stock",  vendor:"HYPERPACK", uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.15 },
  { id:63, name:"Hand Picked Happiness Tub",code:"HP-HPHC",      cat:"Dry Stock",  vendor:"HYPERPACK", uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.168 },
  { id:64, name:"Take Away Bag",            code:"HP-BAG",       cat:"Dry Stock",  vendor:"HYPERPACK", uom:"CASE",   par:2,  order_qty:"1 CASE", cost:0.216 },
  { id:65, name:"24 Oz Boba Cups",          code:"C-TPP24C",     cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:2,  order_qty:"1 CASE", cost:0.1305 },
  { id:66, name:"16 Oz Milkshake Cups",     code:"C-TPP16C",     cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.079 },
  { id:67, name:"16/24 Oz PP Lids",         code:"C-TPPLW",      cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:2,  order_qty:"1 CASE", cost:0.046 },
  { id:68, name:"12 Oz Coffee Cups",        code:"C-KC12",       cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.168 },
  { id:69, name:"16 Oz Coffee Cups",        code:"C-KC16",       cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.065 },
  { id:70, name:"Boba Straws",              code:"C9050s",       cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:2,  order_qty:"1 CASE", cost:0.0175 },
  { id:71, name:"Beverage Napkins",         code:"KN-B99-1K",    cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.00488 },
  { id:72, name:"Gloves (M)",               code:"FP-GV1007",    cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.024 },
  { id:73, name:"Color Changing Spoons",    code:"U4000",        cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.3 },
  { id:74, name:"Tasting Spoons",           code:"U2400",        cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.05 },
  { id:80, name:"Frozen Mango Chunks",      code:"COND-01",      cat:"Condiments", vendor:"Target",    uom:"BAG",    par:2,  order_qty:"2 BAGS", cost:4.99 },
  { id:81, name:"Frozen Strawberry Chunks", code:"COND-02",      cat:"Condiments", vendor:"Target",    uom:"BAG",    par:2,  order_qty:"2 BAGS", cost:4.99 },
  { id:82, name:"Tajin Seasoning",          code:"COND-03",      cat:"Condiments", vendor:"Walmart",   uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:3.99 },
  { id:83, name:"Chamoy Sauce",             code:"COND-04",      cat:"Condiments", vendor:"Walmart",   uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:3.49 },
  { id:84, name:"Lemons",                   code:"COND-05",      cat:"Condiments", vendor:"Indian Store",uom:"COUNT",par:15, order_qty:"30 COUNT", cost:0.25 },
  { id:85, name:"Mint Leaves",              code:"COND-06",      cat:"Condiments", vendor:"Indian Store",uom:"LBS", par:1,  order_qty:"1 LB", cost:2.99 },
  { id:86, name:"Condensed Milk",           code:"COND-07",      cat:"Condiments", vendor:"Walmart",   uom:"CAN",    par:2,  order_qty:"4 CANS", cost:1.5 },
  { id:87, name:"Oat Milk",                 code:"COND-08",      cat:"Condiments", vendor:"Walmart",   uom:"CARTON", par:2,  order_qty:"2 CARTONS", cost:4.99 },
  { id:88, name:"Almond Milk",              code:"COND-09",      cat:"Condiments", vendor:"Walmart",   uom:"CARTON", par:2,  order_qty:"2 CARTONS", cost:3.99 },
  { id:89, name:"Heavy Cream",              code:"COND-10",      cat:"Condiments", vendor:"Walmart",   uom:"CARTON", par:2,  order_qty:"2 CARTONS", cost:3.99 },
  { id:90, name:"Honey",                    code:"COND-11",      cat:"Condiments", vendor:"Walmart",   uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:5.99 },
  { id:91, name:"Date Syrup",               code:"COND-12",      cat:"Condiments", vendor:"Walmart",   uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:6.99 },
  { id:92, name:"Cardamom Powder",          code:"COND-13",      cat:"Condiments", vendor:"Indian Store",uom:"PKT", par:1,  order_qty:"1 PKT", cost:3.99 },
  { id:93, name:"Callebaut Dark Chocolate", code:"COND-14",      cat:"Condiments", vendor:"Walmart",   uom:"BAG",    par:1,  order_qty:"1 BAG", cost:8.99 },
  { id:94, name:"Whipped Cream Spray",      code:"COND-15",      cat:"Condiments", vendor:"Walmart",   uom:"CAN",    par:2,  order_qty:"2 CANS", cost:4.99 },
  { id:95, name:"Roasted Nuts",             code:"COND-16",      cat:"Condiments", vendor:"Walmart",   uom:"LBS",    par:1,  order_qty:"1 LB", cost:6.99 },
  { id:96, name:"Biscoff Biscuits",         code:"COND-17",      cat:"Condiments", vendor:"Walmart",   uom:"PKT",    par:1,  order_qty:"1 PKT", cost:3.99 },
  { id:97, name:"Ferrero Rocher",           code:"COND-18",      cat:"Condiments", vendor:"Walmart",   uom:"BOX",    par:1,  order_qty:"1 BOX", cost:12.99 },
  { id:98, name:"Graham Crackers",          code:"COND-19",      cat:"Condiments", vendor:"Walmart",   uom:"BOX",    par:1,  order_qty:"1 BOX", cost:3.99 },
  { id:99, name:"PB M&Ms",                  code:"COND-20",      cat:"Condiments", vendor:"Walmart",   uom:"BAG",    par:1,  order_qty:"1 BAG", cost:4.99 },
  { id:100,name:"Coconut Water",            code:"COND-21",      cat:"Condiments", vendor:"Walmart",   uom:"PACK",   par:1,  order_qty:"1 PACK", cost:5.99 },
  { id:101,name:"Tonic Water",              code:"COND-22",      cat:"Condiments", vendor:"Walmart",   uom:"PACK",   par:1,  order_qty:"1 PACK", cost:4.99 },
  { id:102,name:"Simple Syrup",             code:"COND-23",      cat:"Condiments", vendor:"Target",    uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:3.99 },
  { id:103,name:"Maple Syrup",              code:"COND-24",      cat:"Condiments", vendor:"Costco",    uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:9.99 },
  { id:110,name:"Vanilla Bean",             code:"IC-01",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:2,  order_qty:"2 TUBS", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:111,name:"Classic Chocolate",        code:"IC-02",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:2,  order_qty:"2 TUBS", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:112,name:"Butterscotch",             code:"IC-03",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:113,name:"Strawberry Chunks",        code:"IC-04",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:114,name:"Berry Yogurt",             code:"IC-05",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:115,name:"Pistachio",                code:"IC-06",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:116,name:"Lots of Nuts",             code:"IC-07",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:117,name:"Oreo Caramel Fudge",       code:"IC-08",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:118,name:"Salted Caramel",           code:"IC-09",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:2,  order_qty:"2 TUBS", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:119,name:"Taro",                     code:"IC-10",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:2,  order_qty:"2 TUBS", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:120,name:"Mango",                    code:"IC-11",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:2,  order_qty:"2 TUBS", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:121,name:"Kheer",                    code:"IC-12",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:122,name:"Filter Coffee",            code:"IC-13",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:123,name:"Mint Chocochip",           code:"IC-14",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:124,name:"Ferrero Ice Cream",        code:"IC-15",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:125,name:"Biscoff Ice Cream",        code:"IC-16",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:126,name:"Ruby Cheese",              code:"IC-17",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:127,name:"Peanut Butter Chocolate",  code:"IC-18",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
];

const RECIPES = {
  "Taro Milk Tea":      [{id:27,a:0.005},{id:7,a:0.008},{id:12,a:0.01},{id:1,a:0.02},{id:65,a:0.01}],
  "Matcha Milk Tea":    [{id:26,a:0.005},{id:28,a:0.008},{id:7,a:0.008},{id:12,a:0.01},{id:65,a:0.01}],
  "Horchata Milk Tea":  [{id:30,a:0.008},{id:7,a:0.008},{id:12,a:0.01},{id:65,a:0.01}],
  "Tiger Stripes":      [{id:5,a:0.02},{id:34,a:0.025},{id:7,a:0.008},{id:65,a:0.01}],
  "Thai Milk Tea":      [{id:5,a:0.02},{id:7,a:0.008},{id:10,a:0.01},{id:65,a:0.01}],
  "Classic Milk Tea":   [{id:4,a:0.02},{id:7,a:0.008},{id:12,a:0.01},{id:65,a:0.01}],
  "Dirty Mad Tea":      [{id:4,a:0.02},{id:7,a:0.008},{id:51,a:0.01},{id:65,a:0.01}],
  "Mangoficient":       [{id:17,a:0.02},{id:33,a:0.02},{id:35,a:0.015},{id:2,a:0.02},{id:65,a:0.01}],
  "Pink Lips":          [{id:20,a:0.02},{id:33,a:0.02},{id:36,a:0.015},{id:4,a:0.02},{id:65,a:0.01}],
  "Passionate Love":    [{id:18,a:0.02},{id:33,a:0.02},{id:37,a:0.015},{id:2,a:0.02},{id:65,a:0.01}],
  "Lychee Lust":        [{id:16,a:0.02},{id:32,a:0.02},{id:36,a:0.015},{id:4,a:0.02},{id:65,a:0.01}],
  "Strawberry Burst":   [{id:20,a:0.025},{id:36,a:0.02},{id:65,a:0.01}],
  "Mangonada":          [{id:17,a:0.025},{id:82,a:0.02},{id:83,a:0.015},{id:65,a:0.01}],
  "Mango Market Lemonade":     [{id:17,a:0.02},{id:12,a:0.01},{id:84,a:0.07},{id:85,a:0.005}],
  "Pineapple Island Lemonade": [{id:19,a:0.02},{id:12,a:0.01},{id:84,a:0.07}],
  "Passion World Lemonade":    [{id:18,a:0.02},{id:12,a:0.01},{id:84,a:0.07}],
  "Taro Smoothie":      [{id:27,a:0.007},{id:12,a:0.01},{id:65,a:0.01}],
  "Matcha Smoothie":    [{id:26,a:0.005},{id:28,a:0.006},{id:65,a:0.01}],
  "Latte Hot":          [{id:51,a:0.015},{id:68,a:0.01}],
  "Latte Iced":         [{id:51,a:0.015},{id:68,a:0.01}],
  "Iced Latte":         [{id:51,a:0.015},{id:87,a:0.025},{id:68,a:0.01}],
  "Cappuccino Hot":     [{id:51,a:0.015},{id:68,a:0.01}],
  "Americano Hot":      [{id:51,a:0.012},{id:68,a:0.01}],
  "Dark Chocolate Mocha Hot":   [{id:51,a:0.015},{id:42,a:0.015},{id:43,a:0.008},{id:68,a:0.01}],
  "Dark Chocolate Mocha Iced":  [{id:51,a:0.015},{id:42,a:0.015},{id:43,a:0.008},{id:68,a:0.01}],
  "White Chocolate Mocha Hot":  [{id:51,a:0.015},{id:41,a:0.015},{id:68,a:0.01}],
  "White Chocolate Mocha Iced": [{id:51,a:0.015},{id:41,a:0.015},{id:68,a:0.01}],
  "Pistachio White Mocha Hot":  [{id:51,a:0.015},{id:41,a:0.015},{id:46,a:0.01},{id:68,a:0.01}],
  "Pistachio White Mocha Iced": [{id:51,a:0.015},{id:41,a:0.015},{id:46,a:0.01},{id:68,a:0.01}],
  "Blackberry White Mocha Iced":[{id:51,a:0.015},{id:41,a:0.015},{id:47,a:0.01},{id:68,a:0.01}],
  "Date Cardamom Latte Hot":    [{id:51,a:0.015},{id:92,a:0.005},{id:91,a:0.01},{id:68,a:0.01}],
  "Date Cardamom Latte Iced":   [{id:51,a:0.015},{id:92,a:0.005},{id:91,a:0.01},{id:68,a:0.01}],
  "OG Cold Coffee":             [{id:51,a:0.018},{id:86,a:0.015},{id:68,a:0.01}],
  "Affogato Single shot":       [{id:51,a:0.012},{id:110,a:0.03}],
  "Affogato Double Shot":       [{id:51,a:0.02},{id:110,a:0.03}],
  "Matcha Affogato":            [{id:26,a:0.005},{id:110,a:0.03}],
  "Kheer Milkshake":                [{id:121,a:0.06},{id:66,a:0.01}],
  "Raspberry Mascarpone Milkshake": [{id:110,a:0.06},{id:66,a:0.01}],
  "Strawberry Chunks Milkshake":    [{id:113,a:0.06},{id:66,a:0.01}],
  "Pistachio Milkshake":            [{id:115,a:0.06},{id:66,a:0.01}],
  "Vanilla Bean kids":          [{id:110,a:0.025},{id:60,a:0.01}],
  "Vanilla Bean Regular":       [{id:110,a:0.04},{id:61,a:0.01}],
  "Classic Chocolate kids":     [{id:111,a:0.025},{id:60,a:0.01}],
  "Classic Chocolate Regular":  [{id:111,a:0.04},{id:61,a:0.01}],
  "Butterscotch kids":          [{id:112,a:0.025},{id:60,a:0.01}],
  "Butterscotch Regular":       [{id:112,a:0.04},{id:61,a:0.01}],
  "Pistachio kids":             [{id:115,a:0.025},{id:60,a:0.01}],
  "Pistachio Regular":          [{id:115,a:0.04},{id:61,a:0.01}],
  "Kheer kids":                 [{id:121,a:0.025},{id:60,a:0.01}],
  "Kheer Regular":              [{id:121,a:0.04},{id:61,a:0.01}],
  "Salted Caramel kids":        [{id:118,a:0.025},{id:60,a:0.01}],
  "Salted Caramel Regular":     [{id:118,a:0.04},{id:61,a:0.01}],
  "Mango kids":                 [{id:120,a:0.025},{id:60,a:0.01}],
  "Mango Regular":              [{id:120,a:0.04},{id:61,a:0.01}],
  "Biscoff kids":               [{id:125,a:0.025},{id:60,a:0.01}],
  "Biscoff Regular":            [{id:125,a:0.04},{id:61,a:0.01}],
};

// ── APP STATE ──
let currentUser = null;
let currentUserConfig = null;
let inventory = [];
let deliveryHistory = [];
let activeCategory = 'all';
let activeTab = 'dashboard';
let viewingStore = null;
let unsubscribeInventory = null;
let allStoresData = {};
let pendingScan = null;

// ── AUTH ──
window.doLogin = async function() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pw    = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn   = document.querySelector('.btn-login');
  errEl.textContent = '';
  if (!email || !pw) { errEl.textContent = 'Please enter email and password'; return; }
  try {
    btn.textContent = 'Signing in...';
    btn.disabled = true;
    await signInWithEmailAndPassword(auth, email, pw);
  } catch(e) {
    btn.textContent = 'Sign In';
    btn.disabled = false;
    const msgs = {
      'auth/invalid-credential':    'Wrong email or password. Check and try again.',
      'auth/user-not-found':        'No account found with this email.',
      'auth/wrong-password':        'Incorrect password.',
      'auth/too-many-requests':     'Too many attempts. Wait a few minutes and try again.',
      'auth/network-request-failed':'No internet connection. Check your WiFi.',
      'auth/invalid-email':         'Email address format is invalid.',
    };
    errEl.textContent = msgs[e.code] || ('Error: ' + e.code + ' — ' + e.message);
  }
};

// Allow Enter key to submit login

// Attach all button listeners (module script scope fix)
function attachAllListeners() {
  // Login
  document.getElementById('loginBtn')?.addEventListener('click', doLogin);
  document.getElementById('loginPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('loginEmail')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('loginPassword')?.focus();
  });
  // Signup
  document.getElementById('showSignupBtn')?.addEventListener('click', () => showSignup());
  document.getElementById('showLoginBtn')?.addEventListener('click',  () => showLogin());
  document.getElementById('signupBtn')?.addEventListener('click',     () => doSignup());
  document.getElementById('signupRoleSelect')?.addEventListener('change', () => toggleSignupRoleFields());
  // Schedule toolbar
  document.getElementById('schedPrev')?.addEventListener('click', () => schedNav(-1));
  document.getElementById('schedNext')?.addEventListener('click', () => schedNav(1));
  document.getElementById('schedShiftsBtn')?.addEventListener('click', () => openManageShiftTypes());
  document.getElementById('schedStaffBtn')?.addEventListener('click', () => openAddStaff());
  document.getElementById('schedCopyBtn')?.addEventListener('click', () => copyLastWeek());
  document.getElementById('schedPublishBtn')?.addEventListener('click', () => publishSchedule());
  document.getElementById('schedShareBtn')?.addEventListener('click', () => exportScheduleImage());
  document.getElementById('hrsWeekBtn')?.addEventListener('click', () => setHrsPeriod('week'));
  document.getElementById('hrsMonthBtn')?.addEventListener('click', () => setHrsPeriod('month'));
}
// Run immediately (module scripts execute after DOM is parsed)
attachAllListeners();

window.doLogout = async function() {
  if (unsubscribeInventory) unsubscribeInventory();
  await signOut(auth);
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;

    // ── Check if user is pending approval ──
    const isPending = await checkPendingStatus(user);
    if (isPending) return;

    // ── Load user profile from Firestore first, fallback to USERS map ──
    let cfg = USERS[user.email] || { store: 'coppell', role: 'manager', name: user.email };
    try {
      const emailKey = user.email.replace(/\./g,'_').replace(/@/g,'_at_');
      const userSnap = await getDoc(doc(db, 'users', emailKey));
      if (userSnap.exists()) {
        const fd=userSnap.data(); if(fd.role==="owner")fd.role=ROLES.SUPER_OWNER; cfg={...cfg,...fd};
      } else {
        // First login — write profile to Firestore
        await setDoc(doc(db, 'users', emailKey), {
          email: user.email,
          store: cfg.store,
          role:  cfg.role,
          name:  cfg.name,
          createdAt: Date.now()
        });
      }
    } catch(e) {
      console.warn('Could not load user profile from Firestore, using local config', e);
    }

    currentUserConfig = cfg;
    viewingStore = cfg.store;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';

    if(isSuperOwner(cfg)){document.getElementById('storeBadge').textContent='Super Owner';document.getElementById('ownerBar').style.display='flex';document.getElementById('adminTabBtn').style.display='block';if(document.getElementById('regionalTabBtn'))document.getElementById('regionalTabBtn').style.display='block';}else if(isRegionalOwner(cfg)){document.getElementById('storeBadge').textContent=(REGIONS[cfg.regionId]?.name||'')+' Region';document.getElementById('ownerBar').style.display='flex';document.getElementById('adminTabBtn').style.display='block';if(document.getElementById('regionalTabBtn'))document.getElementById('regionalTabBtn').style.display='block';}else{document.getElementById('storeBadge').textContent=STORES[cfg.store]?.name||cfg.store;document.getElementById('ownerBar').style.display='none';document.getElementById('adminTabBtn').style.display='none';}
    if(typeof populateStoreSwitcher==='function')populateStoreSwitcher(cfg);

    await initStore(cfg.store);
    await loadCustomItems();
    populateDelivSelect();
    renderInventory();
    renderOrders();
    renderDelivery();
    await checkNeedsSetup();
  } else {
    currentUser = null;
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
  }
});

async function initStore(storeId) {
  if (unsubscribeInventory) unsubscribeInventory();
  // Load inventory from Firestore, fallback to defaults
  const docRef = doc(db, 'stores', storeId, 'inventory', 'stock');
  const snap = await getDoc(docRef);
  const stockMap = snap.exists() ? snap.data() : {};
  inventory = DEFAULT_INVENTORY.map(item => ({
    ...item,
    stock: stockMap[String(item.id)] !== undefined ? stockMap[String(item.id)] : 0
  }));
  // Real-time listener
  unsubscribeInventory = onSnapshot(docRef, (snap) => {
    const data = snap.exists() ? snap.data() : {};
    inventory.forEach(item => {
      if (data[String(item.id)] !== undefined) item.stock = data[String(item.id)];
    });
    renderDashboard();
    renderInventory();
    renderOrders();
    const t = new Date().toLocaleTimeString();
    document.getElementById('syncInfo').innerHTML = `🔄 Live sync — last update: ${t}`;
  });
  // Load delivery history
  try {
    const delRef = collection(db, 'stores', storeId, 'deliveries');
    const delQ = query(delRef, orderBy('timestamp','desc'));
    const delSnap = await getDocs(delQ);
    deliveryHistory = delSnap.docs.map(d => d.data());
  } catch(e) { deliveryHistory = []; }
  renderDashboard();
  renderDelivery();
  document.getElementById('syncInfo').innerHTML = `🔄 Live sync active — ${STORES[storeId]?.name || storeId}`;
}

async function saveStock() {
  try {
    const storeId = viewingStore;
    const stockMap = {};
    inventory.forEach(item => { stockMap[String(item.id)] = item.stock; });
    await setDoc(doc(db, 'stores', storeId, 'inventory', 'stock'), stockMap);
  } catch(e) { showToast('⚠️ Save failed — check connection'); }
}

// ── OWNER STORE SWITCH ──
window.switchViewStore = async function(storeId) {
  document.querySelectorAll('.store-tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(storeId === 'all' ? 'storeAll' : 'store' + storeId.replace('-','').replace('-','').charAt(0).toUpperCase() + storeId.replace('-','').replace('-','').slice(1))?.classList.add('active');
  if (storeId === 'all') {
    document.getElementById('ownerAllView').style.display = 'block';
    document.getElementById('storeView').style.display = 'none';
    await loadAllStores();
  } else {
    document.getElementById('ownerAllView').style.display = 'none';
    document.getElementById('storeView').style.display = 'block';
    viewingStore = storeId;
    document.getElementById('storeBadge').textContent = '👑 ' + (STORES[storeId]?.name || storeId);
    await initStore(storeId);
    populateDelivSelect();
    renderInventory();
    renderOrders();
    renderDelivery();
  }
};

// ── Store tab button IDs map ──
const storeTabIds = { all:'storeAll', coppell:'storeCoppell', frisco:'storeFrisco', 'cedar-park':'storeCedar', 'san-jose':'storeSJ' };
window.switchViewStore = async function(storeId) {
  document.querySelectorAll('.store-tab-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById(storeTabIds[storeId]);
  if (el) el.classList.add('active');
  if (storeId === 'all') {
    document.getElementById('ownerAllView').style.display = 'block';
    document.getElementById('storeView').style.display = 'none';
    await loadAllStores();
  } else {
    document.getElementById('ownerAllView').style.display = 'none';
    document.getElementById('storeView').style.display = 'block';
    viewingStore = storeId;
    document.getElementById('storeBadge').textContent = '👑 ' + (STORES[storeId]?.name || storeId);
    await initStore(storeId);
    populateDelivSelect();
    renderInventory();
    renderOrders();
    renderDelivery();
  }
};

async function loadAllStores() {
  const grid = document.getElementById('ownerGrid');
  grid.innerHTML = '<div style="color:#8B7355;font-size:13px;padding:8px;">Loading all stores...</div>';
  const storeIds = Object.keys(STORES);
  const results = [];
  for (const sid of storeIds) {
    try {
      const snap = await getDoc(doc(db, 'stores', sid, 'inventory', 'stock'));
      const stockMap = snap.exists() ? snap.data() : {};
      const inv = DEFAULT_INVENTORY.map(item => ({
        ...item, stock: stockMap[String(item.id)] !== undefined ? stockMap[String(item.id)] : 0
      }));
      const critical = inv.filter(i => getStatus(i) === 'critical').length;
      const low = inv.filter(i => getStatus(i) === 'low').length;
      const ok = inv.filter(i => getStatus(i) === 'ok').length;
      results.push({ sid, critical, low, ok });
    } catch(e) {
      results.push({ sid, critical:0, low:0, ok:0 });
    }
  }
  grid.innerHTML = results.map(r => `
    <div class="store-card" onclick="window.switchViewStore('${r.sid}')" style="cursor:pointer">
      <div class="store-card-name">${STORES[r.sid].name}</div>
      <div class="store-card-sub">${STORES[r.sid].city} — tap to manage</div>
      <div class="store-stats">
        <div class="store-stat"><div class="store-stat-num red">${r.critical}</div><div class="store-stat-label">Critical</div></div>
        <div class="store-stat"><div class="store-stat-num amber">${r.low}</div><div class="store-stat-label">Low</div></div>
        <div class="store-stat"><div class="store-stat-num green">${r.ok}</div><div class="store-stat-label">OK</div></div>
      </div>
    </div>`).join('');
}

// ── HELPERS ──
function getStatus(item) {
  if (item.stock === 0) return 'critical';
  if (item.stock <= item.par * 0.5) return 'critical';
  if (item.stock <= item.par) return 'low';
  return 'ok';
}
function statusPill(s) {
  if (s==='critical') return '<span class="status-pill status-critical">🔴 ORDER NOW</span>';
  if (s==='low') return '<span class="status-pill status-low">🟡 Low</span>';
  return '<span class="status-pill status-ok">🟢 OK</span>';
}
function vendorTag(v) {
  const map = {KARAT:'vendor-karat',HYPERPACK:'vendor-hyperpack',Target:'vendor-target',Walmart:'vendor-walmart',Brand:'vendor-brand',DUMONT:'vendor-brand'};
  return `<span class="vendor-tag ${map[v]||'vendor-other'}">${v}</span>`;
}
function stockBar(item) {
  const pct = Math.min(100,(item.stock/(item.par*2))*100);
  const s = getStatus(item);
  const cls = s==='ok'?'fill-green':s==='low'?'fill-amber':'fill-red';
  return `<div class="stock-bar"><div class="stock-bar-fill ${cls}" style="width:${pct}%"></div></div>`;
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2500);
}

// ── TABS ──
window.showTab = function(tab) {
  document.querySelectorAll('[id^="tab-"]').forEach(el=>el.style.display='none');
  document.getElementById('tab-'+tab).style.display='block';
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  event.target.classList.add('active');
  activeTab = tab;
  if (tab==='dashboard') renderDashboard();
  if (tab==='inventory') renderInventory();
  if (tab==='orders') renderOrders();
  if (tab==='delivery') renderDelivery();
  if (tab==='admin') loadAdminStores();
  if (tab==='schedule') { schedLoaded=false; loadScheduleData(); }
  if (tab==='regional') { loadRegionalData(); }
  if (tab==='admin') { loadPendingSignups(); loadOrgStructure(); loadAuditLog(); }
  if (tab==='regional') { loadRegionalData(); }
  if (tab==='admin') { loadPendingSignups(); if(typeof loadOrgStructure==="function")loadOrgStructure(); }
  if (tab==='admin') { loadPendingSignups(); }
  if (tab==='cogs') { cogsLoaded=false; loadCogsData(); loadCogsLedgers(); }
};

// ── DASHBOARD ──
function renderDashboard() {
  const critical = inventory.filter(i=>getStatus(i)==='critical');
  const low = inventory.filter(i=>getStatus(i)==='low');
  const ok = inventory.filter(i=>getStatus(i)==='ok');
  document.getElementById('statCritical').textContent = critical.length;
  document.getElementById('statLow').textContent = low.length;
  document.getElementById('statOk').textContent = ok.length;
  const alerts = [...critical,...low];
  const el = document.getElementById('alertSection');
  if (!alerts.length) {
    el.innerHTML = '<div class="empty-state" style="padding:32px;text-align:center;color:#8B7355;">✅ All items are well stocked!</div>';
    return;
  }
  el.innerHTML = '<div class="alert-header">Items Needing Attention (' + alerts.length + ')</div>' +
    alerts.map(i=>`<div class="alert-row">${statusPill(getStatus(i))}<div class="alert-name">${i.name}</div><div class="alert-meta">${i.stock} ${i.uom} | Par: ${i.par}</div></div>`).join('');
}

// ── INVENTORY ──
function renderInventory() {
  const cats = ['all',...[...new Set(inventory.map(i=>i.cat))]];
  const filterEl = document.getElementById('filterBar');
  filterEl.innerHTML = cats.map(c=>`<button class="cat-btn ${activeCategory===c?'active':''}" onclick="setCategory('${c}')">${c==='all'?'All':c}</button>`).join('');
  const search = (document.getElementById('searchBar')?.value||'').toLowerCase();
  const filtered = inventory.filter(i=>{
    const catMatch = activeCategory==='all' || i.cat===activeCategory;
    const searchMatch = !search || i.name.toLowerCase().includes(search) || i.code.toLowerCase().includes(search);
    return catMatch && searchMatch;
  });
  const list = document.getElementById('inventoryList');
  list.innerHTML = filtered.map(item => {
    const s = getStatus(item);
    const pct = Math.min(100,(item.stock/(item.par*2))*100);
    const cls = s==='ok'?'fill-green':s==='low'?'fill-amber':'fill-red';
    return `<div class="item-card" id="card-${item.id}">
      <div class="item-top">
        <span class="item-name">${item.name}</span>
        <span id="pill-${item.id}">${statusPill(s)}</span>
      </div>
      <div class="item-mid">
        <div class="stock-bar"><div class="stock-bar-fill ${cls}" id="bar-${item.id}" style="width:${pct}%"></div></div>
        ${vendorTag(item.vendor)}
      </div>
      <div class="item-bot">
        <div class="stock-controls">
          <button class="btn-adj" onclick="adjustStock(${item.id},-1)">−</button>
          <span class="stock-val" id="sv-${item.id}"
            onclick="editStockDirect(${item.id})"
            title="Tap to type value"
            style="cursor:pointer;min-width:36px;text-align:center">${item.stock}</span>
          <button class="btn-adj" onclick="adjustStock(${item.id},1)">+</button>
        </div>
        <div style="text-align:right">
          <div class="par-info">Par: ${item.par} ${item.uom}</div>
          <div style="font-size:10px;color:#aaa">${item.code}</div>
        </div>
      </div>
    </div>`;
  }).join('');
}
window.setCategory = function(cat) { activeCategory=cat; renderInventory(); };

let saveTimer = null;
window.adjustStock = function(id, delta) {
  const item = inventory.find(i=>i.id===id);
  if (!item) return;
  item.stock = Math.max(0, Math.round((item.stock + delta) * 10) / 10);
  // Update in place
  document.getElementById('sv-'+id).textContent = item.stock;
  const s = getStatus(item);
  document.getElementById('pill-'+id).innerHTML = statusPill(s);
  const pct = Math.min(100,(item.stock/(item.par*2))*100);
  const cls = s==='ok'?'fill-green':s==='low'?'fill-amber':'fill-red';
  const bar = document.getElementById('bar-'+id);
  if (bar) { bar.style.width=pct+'%'; bar.className='stock-bar-fill '+cls; }
  renderDashboard();
  renderOrders();
  // Debounced cloud save
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{ saveStock(); showToast('💾 Saved to cloud'); }, 1200);
};

// ── ORDERS ──
function renderOrders() {
  const karat = inventory.filter(i=>getStatus(i)!=='ok' && i.vendor==='KARAT');
  const hyperpack = inventory.filter(i=>getStatus(i)!=='ok' && i.vendor==='HYPERPACK');
  const grocery = inventory.filter(i=>getStatus(i)!=='ok' && ['Target','Walmart','Indian Store','Costco'].includes(i.vendor));
  const brand = inventory.filter(i=>getStatus(i)!=='ok' && i.vendor==='Brand');
  const el = document.getElementById('ordersContent');
  if (!karat.length && !grocery.length && !brand.length && !hyperpack.length) {
    el.innerHTML = '<div class="empty-order">🎉 Nothing to order — all items are stocked!</div>';
    return;
  }
  let html = '';
  const section = (title, items, id) => {
    if (!items.length) return '';
    return `<div class="order-section">
      <div class="order-header">${title} <span style="font-size:12px;color:#8B7355;font-weight:400">(${items.length} items)</span></div>
      <div class="order-card" id="${id}">
        ${items.map(i=>`<div class="order-row"><div><div class="order-name">${i.name}</div><div class="order-code">${i.code}</div></div><div class="order-qty">${i.order_qty}</div></div>`).join('')}
      </div>
      <button class="btn-copy" onclick="copyOrder('${id}','${title}')">📋 Copy ${title} Order</button>
    </div>`;
  };
  html += section('🧋 Karat Order', karat, 'order-karat');
  html += section('📦 Hyperpack Order', hyperpack, 'order-hyperpack');
  html += section('🛒 Grocery List', grocery, 'order-grocery');
  html += section('🍦 Brand Ice Cream', brand, 'order-brand');
  el.innerHTML = html;
}
window.copyOrder = function(sectionId, title) {
  const rows = document.querySelectorAll('#'+sectionId+' .order-row');
  let text = title + ' — ' + new Date().toLocaleDateString() + '\n\n';
  rows.forEach(r=>{
    const name = r.querySelector('.order-name')?.textContent||'';
    const code = r.querySelector('.order-code')?.textContent||'';
    const qty = r.querySelector('.order-qty')?.textContent||'';
    text += `• ${name} (${code}) — ${qty}\n`;
  });
  navigator.clipboard.writeText(text).then(()=>showToast('✅ Copied to clipboard!')).catch(()=>showToast('⚠️ Copy failed'));
};

// ── SCAN SALES ──
window.handleFile = async function(e) {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById('scanResults').innerHTML = '<div style="text-align:center;padding:24px;color:#8B7355;">⏳ Processing file...</div>';
  const ext = file.name.split('.').pop().toLowerCase();
  if (['xlsx','xls','csv'].includes(ext)) {
    parseExcelFile(file);
  } else {
    document.getElementById('scanResults').innerHTML = `<div class="parse-error">Image/PDF parsing requires manual entry. Excel (.xlsx) is recommended for automatic parsing.</div>
    <div style="margin-top:16px">${buildManualEntry()}</div>`;
  }
  e.target.value = '';
};
function parseExcelFile(file) {
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  script.onload = () => {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, {type:'array'});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
        let nameCol=-1, soldCol=-1, headerRow=-1;
        for (let r=0;r<Math.min(20,rows.length);r++) {
          const row = rows[r].map(c=>String(c).toLowerCase());
          const ni = row.findIndex(c=>c.includes('item')||c.includes('name'));
          const si = row.findIndex(c=>c.includes('sold')||c.includes('qty')||c.includes('quantity'));
          if (ni>=0 && si>=0) { nameCol=ni; soldCol=si; headerRow=r; break; }
        }
        const sales = [];
        if (nameCol>=0) {
          for (let r=headerRow+1;r<rows.length;r++) {
            const row = rows[r];
            const name = String(row[nameCol]||'').trim();
            const sold = parseInt(row[soldCol])||0;
            if (name && sold>0 && RECIPES[name]) sales.push({name,sold});
          }
        }
        if (sales.length) {
          pendingScan = sales;
          renderScanResults(sales);
        } else {
          document.getElementById('scanResults').innerHTML = `<div class="parse-error">Could not auto-match items to recipes. Try manual entry below.</div><div style="margin-top:12px">${buildManualEntry()}</div>`;
        }
      } catch(err) {
        document.getElementById('scanResults').innerHTML = `<div class="parse-error">Parse error: ${err.message}</div>`;
      }
    };
    reader.readAsArrayBuffer(file);
  };
  document.head.appendChild(script);
}
function renderScanResults(sales) {
  document.getElementById('scanResults').innerHTML = `
    <div style="margin-top:16px">
      <div style="font-size:14px;font-weight:600;margin-bottom:10px;">Matched ${sales.length} items with recipes:</div>
      ${sales.map(s=>`<div class="scan-result-row"><span class="result-item">${s.name}</span><span class="result-sold">×${s.sold} sold</span></div>`).join('')}
      <button class="btn-apply" onclick="applyScan()">⚡ Deduct from Inventory</button>
    </div>`;
}
function buildManualEntry() { return '<div style="color:#8B7355;font-size:13px;text-align:center;padding:12px;">Manual entry coming soon.</div>'; }
window.applyScan = async function() {
  if (!pendingScan) return;
  let deducted = 0;
  pendingScan.forEach(({name,sold}) => {
    const recipe = RECIPES[name];
    if (!recipe) return;
    recipe.forEach(({id,a}) => {
      const item = inventory.find(i=>i.id===id);
      if (item) { item.stock = Math.max(0, Math.round((item.stock - a*sold)*100)/100); deducted++; }
    });
  });
  await saveStock();
  pendingScan = null;
  document.getElementById('scanResults').innerHTML = '';
  renderDashboard(); renderInventory(); renderOrders();
  showToast(`✅ Applied! ${deducted} ingredient adjustments saved`);
};

// ── DELIVERY ──
function populateDelivSelect() {
  const sel = document.getElementById('delivItem');
  sel.innerHTML = '<option value="">— Select item —</option>' +
    inventory.map(i=>`<option value="${i.id}">${i.name} (${i.uom})</option>`).join('');
}
