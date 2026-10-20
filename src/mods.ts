// A mod folder (one containing mod_info.json), as returned by /api/mods.
export type ModEntry = {
  // The mod's folder name, used to identify it in API requests.
  folder: string
  // The `name` from mod_info.json, falling back to the folder name.
  name: string
  // Whether ship_data.csv lists at least one hull whose .ship file has a sprite image
  // in the mod. This decides inclusion in the Ships tab.
  hasShipHulls: boolean
}

// A ship from a mod's data/hulls/ship_data.csv, with details from its matching
// .ship file, as returned by /api/ship-hulls.
export type ShipHull = {
  // The ship_data.csv `id`, which matches the .ship file's `hullId`.
  hullId: string
  // The ship_data.csv `name`. Rows without one are left out.
  hullName: string
  // Path to the hull's sprite, relative to the mod folder.
  sprite: string
  // The ship_data.csv `tech/manufacturer` value, or null if blank or absent.
  manufacturer: string | null
}
