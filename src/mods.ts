// A mod folder (one containing mod_info.json), as returned by /api/mods.
export type ModEntry = {
  // The mod's folder name, used to identify it in API requests.
  folder: string
  // The `name` from mod_info.json, falling back to the folder name.
  name: string
}

// A ship from a mod's data/hulls/ship_data.csv, with its sprite from the matching
// .ship file.
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

// A mod and all of its ships, as returned by /api/ships.
export type ShipMod = ModEntry & {
  ships: ShipHull[]
}
