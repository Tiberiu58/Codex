import { BABYLON } from "./babylon.js"
import { WORLD_CONFIG } from "./config.js"
import { clamp } from "./utils.js"

function createPatternTexture(scene, name, draw) {
  const texture = new BABYLON.DynamicTexture(name, { width: 64, height: 64 }, scene, false)
  const context = texture.getContext()

  draw(context)
  texture.update()
  texture.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE
  texture.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE
  texture.anisotropicFilteringLevel = 2

  return texture
}

export class Level {
  constructor(scene) {
    this.scene = scene
    this.map = WORLD_CONFIG.map
    this.cellSize = WORLD_CONFIG.cellSize
    this.wallHeight = WORLD_CONFIG.wallHeight
    this.floorY = WORLD_CONFIG.floorY
    this.width = this.map[0].length
    this.depth = this.map.length
    this.staticMeshes = []
    this.teleportBlockers = []

    this.buildMaterials()
    this.buildGeometry()
  }

  buildMaterials() {
    const wallTexture = createPatternTexture(this.scene, "wallTexture", (context) => {
      context.fillStyle = "#6884e7"
      context.fillRect(0, 0, 64, 64)
      context.fillStyle = "#87a5ff"
      context.fillRect(0, 0, 64, 6)
      context.fillRect(0, 30, 64, 4)
      context.fillStyle = "#526ccc"
      context.fillRect(0, 34, 64, 2)
      context.fillRect(20, 0, 2, 64)
      context.fillRect(42, 0, 2, 64)
      context.fillStyle = "rgba(255,255,255,0.12)"
      context.fillRect(4, 4, 56, 2)
    })

    const floorTexture = createPatternTexture(this.scene, "floorTexture", (context) => {
      context.fillStyle = "#1a2332"
      context.fillRect(0, 0, 64, 64)
      context.fillStyle = "#243248"
      for (let y = 0; y < 64; y += 16) {
        for (let x = 0; x < 64; x += 16) {
          context.fillRect(x, y, 16, 16)
        }
      }
      context.fillStyle = "#35516e"
      for (let y = 0; y < 64; y += 16) {
        context.fillRect(0, y, 64, 2)
      }
      for (let x = 0; x < 64; x += 16) {
        context.fillRect(x, 0, 2, 64)
      }
    })

    const ceilingTexture = createPatternTexture(this.scene, "ceilingTexture", (context) => {
      context.fillStyle = "#101826"
      context.fillRect(0, 0, 64, 64)
      context.fillStyle = "#19273a"
      context.fillRect(0, 0, 64, 8)
      context.fillRect(0, 28, 64, 4)
      context.fillStyle = "#223754"
      context.fillRect(14, 14, 36, 4)
    })

    this.wallMaterial = new BABYLON.StandardMaterial("wallMaterial", this.scene)
    this.wallMaterial.diffuseTexture = wallTexture
    this.wallMaterial.diffuseTexture.uScale = 1
    this.wallMaterial.diffuseTexture.vScale = 0.7
    this.wallMaterial.specularColor = BABYLON.Color3.Black()
    this.wallMaterial.ambientColor = BABYLON.Color3.FromHexString("#7f9af1")
    this.wallMaterial.emissiveColor = BABYLON.Color3.FromHexString("#18233f")
    this.wallMaterial.freeze()

    this.floorMaterial = new BABYLON.StandardMaterial("floorMaterial", this.scene)
    this.floorMaterial.diffuseTexture = floorTexture
    this.floorMaterial.diffuseTexture.uScale = this.width * 0.42
    this.floorMaterial.diffuseTexture.vScale = this.depth * 0.42
    this.floorMaterial.specularColor = BABYLON.Color3.Black()
    this.floorMaterial.ambientColor = BABYLON.Color3.FromHexString("#34516f")
    this.floorMaterial.emissiveColor = BABYLON.Color3.FromHexString("#111926")
    this.floorMaterial.freeze()

    this.ceilingMaterial = new BABYLON.StandardMaterial("ceilingMaterial", this.scene)
    this.ceilingMaterial.diffuseTexture = ceilingTexture
    this.ceilingMaterial.diffuseTexture.uScale = this.width * 0.34
    this.ceilingMaterial.diffuseTexture.vScale = this.depth * 0.34
    this.ceilingMaterial.specularColor = BABYLON.Color3.Black()
    this.ceilingMaterial.ambientColor = BABYLON.Color3.FromHexString("#263957")
    this.ceilingMaterial.emissiveColor = BABYLON.Color3.FromHexString("#131d2e")
    this.ceilingMaterial.freeze()

    this.lightPanelMaterial = new BABYLON.StandardMaterial("lightPanelMaterial", this.scene)
    this.lightPanelMaterial.diffuseColor = BABYLON.Color3.FromHexString("#d7fbff")
    this.lightPanelMaterial.emissiveColor = BABYLON.Color3.FromHexString("#a7efff")
    this.lightPanelMaterial.specularColor = BABYLON.Color3.Black()
    this.lightPanelMaterial.freeze()

    this.landmarkBlueMaterial = new BABYLON.StandardMaterial("landmarkBlueMaterial", this.scene)
    this.landmarkBlueMaterial.diffuseColor = BABYLON.Color3.FromHexString("#7cc7ff")
    this.landmarkBlueMaterial.emissiveColor = BABYLON.Color3.FromHexString("#2d6ea2")
    this.landmarkBlueMaterial.specularColor = BABYLON.Color3.Black()
    this.landmarkBlueMaterial.freeze()

    this.landmarkOrangeMaterial = new BABYLON.StandardMaterial("landmarkOrangeMaterial", this.scene)
    this.landmarkOrangeMaterial.diffuseColor = BABYLON.Color3.FromHexString("#ffb36c")
    this.landmarkOrangeMaterial.emissiveColor = BABYLON.Color3.FromHexString("#96552b")
    this.landmarkOrangeMaterial.specularColor = BABYLON.Color3.Black()
    this.landmarkOrangeMaterial.freeze()

    this.landmarkGreenMaterial = new BABYLON.StandardMaterial("landmarkGreenMaterial", this.scene)
    this.landmarkGreenMaterial.diffuseColor = BABYLON.Color3.FromHexString("#8fe8be")
    this.landmarkGreenMaterial.emissiveColor = BABYLON.Color3.FromHexString("#2d835a")
    this.landmarkGreenMaterial.specularColor = BABYLON.Color3.Black()
    this.landmarkGreenMaterial.freeze()

    this.trimMaterial = new BABYLON.StandardMaterial("trimMaterial", this.scene)
    this.trimMaterial.diffuseColor = BABYLON.Color3.FromHexString("#22314a")
    this.trimMaterial.emissiveColor = BABYLON.Color3.FromHexString("#142235")
    this.trimMaterial.specularColor = BABYLON.Color3.Black()
    this.trimMaterial.freeze()
  }

  buildGeometry() {
    const worldWidth = this.width * this.cellSize
    const worldDepth = this.depth * this.cellSize

    const floor = BABYLON.MeshBuilder.CreateGround(
      "facilityFloor",
      { width: worldWidth, height: worldDepth, subdivisions: 1 },
      this.scene
    )
    floor.position.set(worldWidth * 0.5, this.floorY, worldDepth * 0.5)
    floor.material = this.floorMaterial
    floor.receiveShadows = false
    floor.freezeWorldMatrix()
    this.staticMeshes.push(floor)

    const ceiling = BABYLON.MeshBuilder.CreateGround(
      "facilityCeiling",
      { width: worldWidth, height: worldDepth, subdivisions: 1 },
      this.scene
    )
    ceiling.position.set(worldWidth * 0.5, this.wallHeight, worldDepth * 0.5)
    ceiling.rotation.x = Math.PI
    ceiling.material = this.ceilingMaterial
    ceiling.freezeWorldMatrix()
    this.staticMeshes.push(ceiling)

    const wallMeshes = []

    for (let z = 0; z < this.depth; z += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (!this.isWallCell(x, z)) {
          continue
        }

        const wall = BABYLON.MeshBuilder.CreateBox(
          `wall-${x}-${z}`,
          {
            width: this.cellSize,
            height: this.wallHeight,
            depth: this.cellSize,
          },
          this.scene
        )

        wall.position.set(
          (x + 0.5) * this.cellSize,
          this.wallHeight * 0.5,
          (z + 0.5) * this.cellSize
        )
        wall.material = this.wallMaterial
        wall.isPickable = false
        wallMeshes.push(wall)
      }
    }

    const mergedWalls = BABYLON.Mesh.MergeMeshes(wallMeshes, true, true, undefined, false, true)
    if (mergedWalls) {
      mergedWalls.name = "facilityWalls"
      mergedWalls.freezeWorldMatrix()
      this.staticMeshes.push(mergedWalls)
    }

    const lightPanels = []
    for (let z = 1; z < this.depth - 1; z += 3) {
      for (let x = 1; x < this.width - 1; x += 4) {
        if (this.isWallCell(x, z)) {
          continue
        }

        const panel = BABYLON.MeshBuilder.CreateBox(
          `light-${x}-${z}`,
          { width: this.cellSize * 0.8, height: 0.05, depth: this.cellSize * 0.18 },
          this.scene
        )
        panel.position.set(
          (x + 0.5) * this.cellSize,
          this.wallHeight - 0.06,
          (z + 0.5) * this.cellSize
        )
        panel.material = this.lightPanelMaterial
        panel.isPickable = false
        lightPanels.push(panel)
      }
    }

    const mergedPanels = BABYLON.Mesh.MergeMeshes(lightPanels, true, true, undefined, false, true)
    if (mergedPanels) {
      mergedPanels.name = "facilityLights"
      mergedPanels.freezeWorldMatrix()
      this.staticMeshes.push(mergedPanels)
    }

    this.buildLandmarks()
  }

  buildLandmarks() {
    const landmarkGroups = [
      {
        name: "centerBeacon",
        material: this.landmarkBlueMaterial,
        blocksTeleport: true,
        cells: [
          { x: 8.5, z: 6.5, width: 1.4, depth: 1.4, height: 1.4, y: 0.7 },
          { x: 8.5, z: 6.5, width: 2.1, depth: 0.16, height: 0.16, y: 0.08 },
          { x: 8.5, z: 6.5, width: 0.16, depth: 2.1, height: 0.16, y: 0.08 },
        ],
      },
      {
        name: "northMarkers",
        material: this.landmarkOrangeMaterial,
        blocksTeleport: true,
        cells: [
          { x: 4.5, z: 1.5, width: 0.34, depth: 1.2, height: 2.1, y: 1.05 },
          { x: 12.5, z: 1.5, width: 0.34, depth: 1.2, height: 2.1, y: 1.05 },
          { x: 8.5, z: 1.5, width: 1.2, depth: 0.18, height: 2.4, y: 1.2 },
        ],
      },
      {
        name: "southMarkers",
        material: this.landmarkGreenMaterial,
        blocksTeleport: true,
        cells: [
          { x: 4.5, z: 11.5, width: 0.34, depth: 1.2, height: 2.1, y: 1.05 },
          { x: 12.5, z: 11.5, width: 0.34, depth: 1.2, height: 2.1, y: 1.05 },
          { x: 8.5, z: 11.5, width: 1.2, depth: 0.18, height: 2.4, y: 1.2 },
        ],
      },
      {
        name: "laneTrim",
        material: this.trimMaterial,
        blocksTeleport: false,
        cells: [
          { x: 2.5, z: 6.5, width: 1.8, depth: 0.14, height: 0.08, y: 0.04 },
          { x: 14.5, z: 6.5, width: 1.8, depth: 0.14, height: 0.08, y: 0.04 },
          { x: 8.5, z: 3.5, width: 0.14, depth: 1.4, height: 0.08, y: 0.04 },
          { x: 8.5, z: 9.5, width: 0.14, depth: 1.4, height: 0.08, y: 0.04 },
        ],
      },
    ]

    landmarkGroups.forEach((group) => {
      if (group.blocksTeleport) {
        group.cells.forEach((cell) => {
          this.teleportBlockers.push({
            x: cell.x * this.cellSize,
            z: cell.z * this.cellSize,
            radius: Math.max(cell.width, cell.depth) * this.cellSize * 0.25,
          })
        })
      }

      const meshes = group.cells.map((cell, index) => {
        const mesh = BABYLON.MeshBuilder.CreateBox(
          `${group.name}-${index}`,
          {
            width: cell.width * this.cellSize * 0.5,
            depth: cell.depth * this.cellSize * 0.5,
            height: cell.height,
          },
          this.scene
        )
        mesh.position.set(cell.x * this.cellSize, cell.y, cell.z * this.cellSize)
        mesh.material = group.material
        mesh.isPickable = false
        return mesh
      })

      const merged = BABYLON.Mesh.MergeMeshes(meshes, true, true, undefined, false, true)
      if (merged) {
        merged.name = group.name
        merged.freezeWorldMatrix()
        this.staticMeshes.push(merged)
      }
    })
  }

  dispose() {
    this.staticMeshes.forEach((mesh) => mesh.dispose())
  }

  isWallCell(cellX, cellZ) {
    const row = this.map[cellZ]
    if (!row || row[cellX] == null) {
      return true
    }

    return row[cellX] === "#"
  }

  cellToWorld(cell) {
    return new BABYLON.Vector3(
      cell.x * this.cellSize,
      this.floorY,
      cell.z * this.cellSize
    )
  }

  getPlayerSpawn() {
    return this.cellToWorld(WORLD_CONFIG.playerSpawn)
  }

  getEnemySpawns() {
    return WORLD_CONFIG.enemyRoutes.map((route) => ({
      position: this.cellToWorld(route[0]),
      patrol: route.map((point) => this.cellToWorld(point)),
    }))
  }

  overlapsWall(x, z, radius) {
    const minCellX = Math.floor((x - radius) / this.cellSize)
    const maxCellX = Math.floor((x + radius) / this.cellSize)
    const minCellZ = Math.floor((z - radius) / this.cellSize)
    const maxCellZ = Math.floor((z + radius) / this.cellSize)

    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        if (!this.isWallCell(cellX, cellZ)) {
          continue
        }

        const minX = cellX * this.cellSize
        const maxX = minX + this.cellSize
        const minZ = cellZ * this.cellSize
        const maxZ = minZ + this.cellSize
        const nearestX = clamp(x, minX, maxX)
        const nearestZ = clamp(z, minZ, maxZ)
        const diffX = x - nearestX
        const diffZ = z - nearestZ

        if (diffX * diffX + diffZ * diffZ < radius * radius) {
          return true
        }
      }
    }

    return false
  }

  overlapsTeleportBlocker(x, z, radius) {
    for (let i = 0; i < this.teleportBlockers.length; i += 1) {
      const blocker = this.teleportBlockers[i]
      const diffX = x - blocker.x
      const diffZ = z - blocker.z
      const distance = radius + blocker.radius

      if (diffX * diffX + diffZ * diffZ < distance * distance) {
        return true
      }
    }

    return false
  }

  isWithinBounds(x, z, radius = 0) {
    const maxX = this.width * this.cellSize
    const maxZ = this.depth * this.cellSize

    return x - radius >= 0
      && z - radius >= 0
      && x + radius <= maxX
      && z + radius <= maxZ
  }

  canOccupyPosition(x, z, radius) {
    if (!this.isWithinBounds(x, z, radius)) {
      return false
    }

    if (this.overlapsWall(x, z, radius)) {
      return false
    }

    if (this.overlapsTeleportBlocker(x, z, radius)) {
      return false
    }

    return true
  }

  validateTeleportTarget(from, target, radius) {
    if (!this.canOccupyPosition(target.x, target.z, radius)) {
      return false
    }

    if (!this.hasLineOfSight(from, target)) {
      return false
    }

    const diffX = target.x - from.x
    const diffZ = target.z - from.z
    const distance = Math.hypot(diffX, diffZ)
    const steps = Math.max(2, Math.ceil(distance / Math.max(radius * 1.4, 0.4)))

    for (let step = 1; step < steps; step += 1) {
      const t = step / steps
      const sampleX = from.x + diffX * t
      const sampleZ = from.z + diffZ * t

      if (this.overlapsTeleportBlocker(sampleX, sampleZ, radius * 0.8)) {
        return false
      }
    }

    return true
  }

  moveCircle(position, delta, radius, options = {}) {
    const stepSize = options.stepSize || Math.max(radius * 0.25, 0.05)
    const xFirst = this.moveByOrder(position, delta, radius, stepSize, true)
    const zFirst = this.moveByOrder(position, delta, radius, stepSize, false)

    // Trying both axis orders makes diagonal wall contact slide naturally and
    // helps the player avoid snagging on hard corners.
    return this.distanceSquared(position, xFirst) >= this.distanceSquared(position, zFirst)
      ? xFirst
      : zFirst
  }

  moveByOrder(position, delta, radius, stepSize, xFirst) {
    const next = position.clone()

    if (xFirst) {
      next.x = this.moveAxis(next.x, next.z, delta.x, radius, stepSize, "x")
      next.z = this.moveAxis(next.x, next.z, delta.z, radius, stepSize, "z")
    } else {
      next.z = this.moveAxis(next.x, next.z, delta.z, radius, stepSize, "z")
      next.x = this.moveAxis(next.x, next.z, delta.x, radius, stepSize, "x")
    }

    return next
  }

  moveAxis(baseX, baseZ, delta, radius, stepSize, axis) {
    if (delta === 0) {
      return axis === "x" ? baseX : baseZ
    }

    let current = axis === "x" ? baseX : baseZ
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / stepSize))
    const step = delta / steps

    for (let i = 0; i < steps; i += 1) {
      const candidate = current + step
      const nextX = axis === "x" ? candidate : baseX
      const nextZ = axis === "z" ? candidate : baseZ

      if (this.overlapsWall(nextX, nextZ, radius)) {
        break
      }

      current = candidate
    }

    return current
  }

  distanceSquared(from, to) {
    const dx = to.x - from.x
    const dz = to.z - from.z
    return dx * dx + dz * dz
  }

  raycastWalls(origin, direction, maxDistance) {
    // A tiny DDA grid walk keeps line-of-sight and rifle hitscan cheap.
    const dirX = direction.x
    const dirZ = direction.z
    const horizontalLength = Math.hypot(dirX, dirZ)

    if (horizontalLength < 0.0001) {
      return maxDistance
    }

    const rayX = dirX / horizontalLength
    const rayZ = dirZ / horizontalLength
    let cellX = Math.floor(origin.x / this.cellSize)
    let cellZ = Math.floor(origin.z / this.cellSize)

    const deltaDistX = rayX === 0 ? Infinity : Math.abs(this.cellSize / rayX)
    const deltaDistZ = rayZ === 0 ? Infinity : Math.abs(this.cellSize / rayZ)

    let sideDistX
    let sideDistZ
    let stepX
    let stepZ

    if (rayX < 0) {
      stepX = -1
      sideDistX = (origin.x - cellX * this.cellSize) / -rayX
    } else {
      stepX = 1
      sideDistX = (((cellX + 1) * this.cellSize) - origin.x) / (rayX || 1)
    }

    if (rayZ < 0) {
      stepZ = -1
      sideDistZ = (origin.z - cellZ * this.cellSize) / -rayZ
    } else {
      stepZ = 1
      sideDistZ = (((cellZ + 1) * this.cellSize) - origin.z) / (rayZ || 1)
    }

    let distance = 0

    while (distance <= maxDistance) {
      if (sideDistX < sideDistZ) {
        distance = sideDistX
        sideDistX += deltaDistX
        cellX += stepX
      } else {
        distance = sideDistZ
        sideDistZ += deltaDistZ
        cellZ += stepZ
      }

      if (this.isWallCell(cellX, cellZ)) {
        return Math.min(distance, maxDistance)
      }
    }

    return maxDistance
  }

  hasLineOfSight(from, to) {
    const diffX = to.x - from.x
    const diffZ = to.z - from.z
    const distance = Math.hypot(diffX, diffZ)

    if (distance < 0.001) {
      return true
    }

    const hitDistance = this.raycastWalls(from, { x: diffX, z: diffZ }, distance)
    return hitDistance >= distance - 0.12
  }
}
