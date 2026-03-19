// Clover menu item -> ingredient recipes

export const CLOVER_RECIPES = {
  // ── ICE CREAM ──
  '_kids':     [{ item:'Ice Cream', qty:1, unit:'scoop' }],
  '_regular':  [{ item:'Ice Cream', qty:2, unit:'scoop' }],
  '_milkshake':[{ item:'Ice Cream', qty:4, unit:'scoop' }, { item:'Milk', qty:120, unit:'ml' }],
  '_hph':      [{ item:'Ice Cream', qty:6, unit:'scoop' }],
  '_flight':   [{ item:'Ice Cream', qty:4, unit:'scoop' }],
  // ── MILK TEA ──
  'Taro Milk Tea':    [{ item:'NDC (Creamer)', qty:30, unit:'g' }, { item:'Fructose', qty:12, unit:'g' }],
  'Matcha Milk Tea':  [{ item:'NDC (Creamer)', qty:30, unit:'g' }, { item:'Fructose', qty:12, unit:'g' }],
  'Horchata Milk Tea':[{ item:'NDC (Creamer)', qty:30, unit:'g' }, { item:'Fructose', qty:12, unit:'g' }],
  'Classic Milk Tea': [{ item:'NDC (Creamer)', qty:30, unit:'g' }, { item:'Golden Milk Tea', qty:2.4, unit:'g' }, { item:'Fructose', qty:12, unit:'g' }],
  'Thai Mlik Tea':    [{ item:'Thai Tea', qty:12, unit:'g' }, { item:'NDC (Creamer)', qty:30, unit:'g' }],
  'Tiger Stripes':    [{ item:'Thai Tea', qty:12, unit:'g' }, { item:'NDC (Creamer)', qty:30, unit:'g' }],
  'Dirty Mad Tea':    [{ item:'Golden Milk Tea', qty:2.4, unit:'g' }, { item:'NDC (Creamer)', qty:30, unit:'g' }, { item:'Dark Brown Sugar Syrup', qty:24, unit:'g' }],
  'White Peach Green Milk Tea': [{ item:'White Peach Tea', qty:3, unit:'g' }, { item:'NDC (Creamer)', qty:30, unit:'g' }],
  // ── FRUIT TEA ──
  'Lychee Lust':    [{ item:'Black Tea', qty:2.4, unit:'g' }, { item:'Lychee Syrup', qty:24, unit:'g' }],
  'Mangoficient':   [{ item:'Jasmine Green Tea', qty:2.4, unit:'g' }, { item:'Grapefruit Syrup', qty:24, unit:'g' }],
  'Passionate Love':[{ item:'Jasmine Green Tea', qty:2.4, unit:'g' }, { item:'Grapefruit Syrup', qty:24, unit:'g' }],
  // ── SLUSH ──
  'Strawberry Burst':[{ item:'Lychee Syrup', qty:48, unit:'g' }],
  'Sunny Mango':     [{ item:'Grapefruit Syrup', qty:48, unit:'g' }],
  'Mangonada':       [{ item:'Grapefruit Syrup', qty:48, unit:'g' }],
  // ── SMOOTHIE ──
  'Purple Patch':    [{ item:'NDC (Creamer)', qty:30, unit:'g' }, { item:'Fructose', qty:12, unit:'g' }],
  'Matcha Smoothie': [{ item:'NDC (Creamer)', qty:30, unit:'g' }, { item:'Fructose', qty:12, unit:'g' }],
  // ── COFFEE ──
  'Latte Hot':            [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Latte Iced':           [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:320, unit:'ml' }],
  'Cappuccino Hot':       [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Cappuccino Iced':      [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Americano Hot':        [{ item:'Coffee Beans', qty:18, unit:'g' }],
  'Americano Iced':       [{ item:'Coffee Beans', qty:18, unit:'g' }],
  'Flat white':           [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:180, unit:'ml' }],
  'Single shot Espresso': [{ item:'Coffee Beans', qty:9,  unit:'g' }],
  'Double shot espresso': [{ item:'Coffee Beans', qty:18, unit:'g' }],
  'Affogato Single shot': [{ item:'Coffee Beans', qty:9,  unit:'g' }, { item:'Ice Cream', qty:2, unit:'scoop' }],
  'Affogato Double Shot': [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Ice Cream', qty:2, unit:'scoop' }],
  'Dark Chocolate Mocha Hot':  [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:270, unit:'ml' }],
  'Dark Chocolate Mocha Iced': [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'White Chocolate Mocha Hot': [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:290, unit:'ml' }],
  'White Chocolate Mocha Iced':[{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Dumont Hot Chocolate':      [{ item:'Milk', qty:300, unit:'ml' }],
  // ── SPECIALTY ──
  'Date Cardamom Latte Hot':  [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Date Cardamom Latte Iced': [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Pistachio White Mocha Hot': [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Pistachio White Mocha Iced':[{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Blackberry White Mocha Hot':[{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Blackberry White Mocha Iced':[{item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Lavender Latte Hot':  [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Lavender Latte Iced': [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Spanish Latte Hot':   [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Spanish Latte Iced':  [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Lavender Matcha Latte Iced':     [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Strawberry Matcha Latte Iced':   [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Strawberry Matcha Latte Hot':    [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'OG Cold Coffee': [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:200, unit:'ml' }],
  'Kheer Iced':     [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:200, unit:'ml' }],
  // ── FALOODA ──
  'Kheer Falooda':        [{ item:'Ice Cream', qty:1, unit:'scoop' }, { item:'NDC (Creamer)', qty:50, unit:'g' }],
  'Butterscotch Falooda': [{ item:'Ice Cream', qty:1, unit:'scoop' }, { item:'NDC (Creamer)', qty:50, unit:'g' }],
  'Mango Falooda':        [{ item:'Ice Cream', qty:1, unit:'scoop' }, { item:'NDC (Creamer)', qty:50, unit:'g' }],
};

export const ITEM_SIZES = {
  'NDC (Creamer)':       600,    // grams per bag
  'Fructose':            1200,   // grams per bottle
  'Dark Brown Sugar Syrup': 1200,
  'Lychee Syrup':        1200,
  'Grapefruit Syrup':    1200,
  'Jasmine Green Tea':   25,     // bags per case, each ~3.6g per cup usage
  'Golden Milk Tea':     25,
  'Black Tea':           25,
  'Thai Tea':            1,      // sold individually
  'White Peach Tea':     50,
  'Coffee Beans':        500,    // grams per bag
  'Ice Cream':           60,     // scoops per bucket
  'Milk':                3785,   // ml per gallon
};

export function matchCloverItem(name) {
  const n = name.toLowerCase().trim();
  // Direct match first
  if (CLOVER_RECIPES[name]) return CLOVER_RECIPES[name];
  // Ice cream pattern matching
  if (n.includes('milkshake'))                          return CLOVER_RECIPES['_milkshake'];
  if (n.includes('hand packed happiness') || n.includes('hand packed')) return CLOVER_RECIPES['_hph'];
  if (n.includes('flight of 4'))                        return CLOVER_RECIPES['_flight'];
  if (n.includes('regular scoop'))                      return CLOVER_RECIPES['_regular'];
  if (n.endsWith(' kids') || n.includes(' kids'))       return CLOVER_RECIPES['_kids'];
  if (n.endsWith(' regular') || n.endsWith(' large'))   return CLOVER_RECIPES['_regular'];
  // Drinks
  if (n.includes('affogato single'))    return CLOVER_RECIPES['Affogato Single shot'];
  if (n.includes('affogato double'))    return CLOVER_RECIPES['Affogato Double Shot'];
  if (n.includes('affogato'))           return CLOVER_RECIPES['Affogato Single shot'];
  if (n.includes('taro milk tea'))      return CLOVER_RECIPES['Taro Milk Tea'];
  if (n.includes('matcha milk tea'))    return CLOVER_RECIPES['Matcha Milk Tea'];
  if (n.includes('horchata milk tea'))  return CLOVER_RECIPES['Horchata Milk Tea'];
  if (n.includes('classic milk tea'))   return CLOVER_RECIPES['Classic Milk Tea'];
  if (n.includes('tiger stripes'))      return CLOVER_RECIPES['Tiger Stripes'];
  if (n.includes('dirty mad tea'))      return CLOVER_RECIPES['Dirty Mad Tea'];
  if (n.includes('thai'))               return CLOVER_RECIPES['Thai Mlik Tea'];
  if (n.includes('white peach'))        return CLOVER_RECIPES['White Peach Green Milk Tea'];
  if (n.includes('lychee lust'))        return CLOVER_RECIPES['Lychee Lust'];
  if (n.includes('mangoficient'))       return CLOVER_RECIPES['Mangoficient'];
  if (n.includes('passionate love'))    return CLOVER_RECIPES['Passionate Love'];
  if (n.includes('strawberry burst'))   return CLOVER_RECIPES['Strawberry Burst'];
  if (n.includes('sunny mango'))        return CLOVER_RECIPES['Sunny Mango'];
  if (n.includes('mangonada'))          return CLOVER_RECIPES['Mangonada'];
  if (n.includes('purple patch'))       return CLOVER_RECIPES['Purple Patch'];
  if (n.includes('matcha smoothie'))    return CLOVER_RECIPES['Matcha Smoothie'];
  if (n.includes('kheer falooda'))      return CLOVER_RECIPES['Kheer Falooda'];
  if (n.includes('butterscotch falooda')) return CLOVER_RECIPES['Butterscotch Falooda'];
  if (n.includes('mango falooda'))      return CLOVER_RECIPES['Mango Falooda'];
  if (n.includes('date cardamom') && n.includes('iced')) return CLOVER_RECIPES['Date Cardamom Latte Iced'];
  if (n.includes('date cardamom'))      return CLOVER_RECIPES['Date Cardamom Latte Hot'];
  if (n.includes('pistachio white mocha') && n.includes('iced')) return CLOVER_RECIPES['Pistachio White Mocha Iced'];
  if (n.includes('pistachio white mocha')) return CLOVER_RECIPES['Pistachio White Mocha Hot'];
  if (n.includes('blackberry white mocha') && n.includes('iced')) return CLOVER_RECIPES['Blackberry White Mocha Iced'];
  if (n.includes('blackberry'))         return CLOVER_RECIPES['Blackberry White Mocha Hot'];
  if (n.includes('lavender matcha'))    return CLOVER_RECIPES['Lavender Matcha Latte Iced'];
  if (n.includes('lavender'))          return CLOVER_RECIPES['Lavender Latte Hot'];
  if (n.includes('strawberry matcha') && n.includes('hot')) return CLOVER_RECIPES['Strawberry Matcha Latte Hot'];
  if (n.includes('strawberry matcha')) return CLOVER_RECIPES['Strawberry Matcha Latte Iced'];
  if (n.includes('spanish latte') && n.includes('iced')) return CLOVER_RECIPES['Spanish Latte Iced'];
  if (n.includes('spanish latte'))     return CLOVER_RECIPES['Spanish Latte Hot'];
  if (n.includes('og cold coffee') || n.includes('cold coffee')) return CLOVER_RECIPES['OG Cold Coffee'];
  if (n.includes('kheer iced'))        return CLOVER_RECIPES['Kheer Iced'];
  if (n.includes('latte iced') || n.includes('iced latte'))  return CLOVER_RECIPES['Latte Iced'];
  if (n.includes('latte hot') || (n.includes('latte') && !n.includes('iced'))) return CLOVER_RECIPES['Latte Hot'];
  if (n.includes('cappuccino iced'))   return CLOVER_RECIPES['Cappuccino Iced'];
  if (n.includes('cappuccino'))        return CLOVER_RECIPES['Cappuccino Hot'];
  if (n.includes('americano iced') || n.includes('iced americano')) return CLOVER_RECIPES['Americano Iced'];
  if (n.includes('americano'))         return CLOVER_RECIPES['Americano Hot'];
  if (n.includes('flat white'))        return CLOVER_RECIPES['Flat white'];
  if (n.includes('dark chocolate mocha iced')) return CLOVER_RECIPES['Dark Chocolate Mocha Iced'];
  if (n.includes('dark chocolate mocha'))      return CLOVER_RECIPES['Dark Chocolate Mocha Hot'];
  if (n.includes('white chocolate mocha iced')) return CLOVER_RECIPES['White Chocolate Mocha Iced'];
  if (n.includes('white chocolate mocha'))     return CLOVER_RECIPES['White Chocolate Mocha Hot'];
  if (n.includes('hot chocolate'))     return CLOVER_RECIPES['Dumont Hot Chocolate'];
  if (n.includes('double shot') || n.includes('doppio')) return CLOVER_RECIPES['Double shot espresso'];
  if (n.includes('single shot') || n.includes('espresso')) return CLOVER_RECIPES['Single shot Espresso'];
  return null;
}

// ── Parse Clover CSV/Excel ──