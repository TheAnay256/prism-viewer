// A mod folder (one containing mod_info.json), as returned by /api/mods.
export type ModEntry = {
  name: string
  // Whether the mod has a graphics/ships folder.
  hasShips: boolean
  // Whether the mod has a graphics/weapons folder.
  hasWeapons: boolean
  // Whether the mod has a graphics/portraits folder.
  hasPortraits: boolean
  // Whether data/hulls has at least one hull whose sprite is an image file in the mod.
  // This decides inclusion in the Ships tab.
  hasShipHulls: boolean
}

// A ship hull read from a mod's data/hulls folder, as returned by /api/ship-hulls.
export type ShipHull = {
  hullName: string
  // Path to the hull's sprite, relative to the mod folder.
  sprite: string
}
