const BABYLON = window.BABYLON

if (!BABYLON) {
  throw new Error("Babylon.js failed to load before the game booted.")
}

export { BABYLON }
